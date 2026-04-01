import Tesseract from 'tesseract.js';

// Bingo column ranges: B=1-15, I=16-30, N=31-45, G=46-60, O=61-75
const COL_RANGES: [number, number][] = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
];

// Minimum image width in pixels before we scale up for better OCR accuracy
const MIN_OCR_WIDTH = 1200;

// Scale up small images, convert to grayscale, and boost contrast for better OCR.
async function preprocessImage(source: File | string): Promise<string> {
  return new Promise((resolve, reject) => {
    const isFile = source instanceof File;
    const url = isFile ? URL.createObjectURL(source) : source;

    const img = new Image();
    img.onload = () => {
      if (isFile) URL.revokeObjectURL(url);
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        // Scale up small images — Tesseract accuracy drops below ~1200px wide
        const scale = w < MIN_OCR_WIDTH ? MIN_OCR_WIDTH / w : 1;
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, cw, ch);

        const imageData = ctx.getImageData(0, 0, cw, ch);
        const { data } = imageData;

        // Grayscale + 2.0× contrast boost in a single O(W×H) pass
        for (let i = 0; i < data.length; i += 4) {
          const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          const boosted = Math.min(255, Math.max(0, Math.round(128 + (g - 128) * 2.0)));
          data[i] = data[i + 1] = data[i + 2] = boosted;
          data[i + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      if (isFile) URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for preprocessing'));
    };
    img.src = url;
  });
}

/** Run OCR on one image file and parse a 5×5 bingo grid. */
export async function parseCardImage(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ numbers: number[][]; warnings: string[]; cardId?: string }> {
  const processedImage = await preprocessImage(file);
  return runOcrOnDataUrl(processedImage, onProgress);
}

export interface CardParseResult {
  numbers: number[][];
  warnings: string[];
  cardId?: string;
  cropUrl: string; // object URL of the cropped sub-image shown in CardEditor
}

/**
 * Detect and parse all bingo cards in one photo.
 * - If the image contains multiple cards they are detected, cropped, and each
 *   parsed individually so every result gets its own CardEditor review.
 * - Falls back to single-card path when only one card is found.
 */
export async function parseMultiCardImage(
  file: File,
  onProgress?: (progress: number) => void
): Promise<CardParseResult[]> {
  // Step 1 — preprocess the full image once
  const fullProcessed = await preprocessImage(file);

  // Step 2 — detect grid regions using PSM 11 (sparse text)
  onProgress?.(5);
  const regions = await detectCardRegions(fullProcessed, file);
  onProgress?.(20);

  if (regions.length <= 1) {
    // Single card path — use the already-processed image
    const fullUrl = URL.createObjectURL(file);
    const result = await runOcrOnDataUrl(fullProcessed, p =>
      onProgress?.(20 + Math.round(p * 0.8))
    );
    return [{ ...result, cropUrl: fullUrl }];
  }

  // Multiple cards — process each crop in sequence
  const results: CardParseResult[] = [];
  for (let i = 0; i < regions.length; i++) {
    const { cropDataUrl, cropBlob } = regions[i];
    const processed = await preprocessImage(cropDataUrl);
    const result = await runOcrOnDataUrl(processed, p =>
      onProgress?.(20 + Math.round(((i + p / 100) / regions.length) * 80))
    );
    const cropUrl = URL.createObjectURL(cropBlob);
    // Fallback label by position when card ID was not detected
    results.push({
      ...result,
      cardId: result.cardId ?? `Card ${i + 1}`,
      cropUrl,
    });
  }

  return results;
}

type OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
type TokenItem = { cx: number; cy: number; x0: number; y0: number; x1: number; y1: number };
// X-position and bottom-edge of each detected BINGO column header letter
type BingoAnchor = { col: number; cx: number; x0: number; x1: number; headerBottom: number };

// Minimal representation of the Tesseract Page
type TesseractPage = {
  text: string;
  tsv: string | null;
  blocks?: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: OcrWord[];
      }>;
    }>;
  }> | null;
};

// Split a compound Tesseract token (e.g. '|17|37|58|75') into individual
// sub-tokens, distributing the bbox proportionally by position.
function splitCompoundToken(text: string, bbox: OcrWord['bbox']): OcrWord[] {
  const parts = text.match(/[A-Za-z]+|\d+/g);
  if (!parts || parts.length === 0) return [];
  if (parts.length === 1) {
    const single = parts[0];
    // Try splitting bare 3–4 digit run into two valid bingo numbers (e.g. "2141" → 21, 41)
    if (/^\d{3,4}$/.test(single)) {
      for (let s = 1; s < single.length; s++) {
        const a = parseInt(single.slice(0, s), 10);
        const b = parseInt(single.slice(s), 10);
        if (a >= 1 && a <= 75 && b >= 1 && b <= 75) {
          const mid = Math.round(bbox.x0 + (bbox.x1 - bbox.x0) / 2);
          return [
            { text: String(a), bbox: { x0: bbox.x0, y0: bbox.y0, x1: mid,    y1: bbox.y1 } },
            { text: String(b), bbox: { x0: mid,    y0: bbox.y0, x1: bbox.x1, y1: bbox.y1 } },
          ];
        }
      }
    }
    return [{ text: single, bbox }];
  }
  const totalWidth = bbox.x1 - bbox.x0;
  const partWidth = totalWidth / parts.length;
  return parts.map((part, i) => ({
    text: part,
    bbox: {
      x0: Math.round(bbox.x0 + i * partWidth),
      y0: bbox.y0,
      x1: Math.round(bbox.x0 + (i + 1) * partWidth),
      y1: bbox.y1,
    },
  }));
}

// Parse Tesseract TSV output into a flat word list (level 5 = word, conf >= 0).
function parseWordsFromTsv(tsv: string): OcrWord[] {
  const words: OcrWord[] = [];
  const lines = tsv.split('\n');
  for (let i = 1; i < lines.length; i++) { // skip header row
    const parts = lines[i].split('\t');
    if (parts.length < 12) continue;
      if (parseInt(parts[0], 10) !== 5) continue;
      if (parseFloat(parts[10]) < 0) continue;
    const left   = parseInt(parts[6], 10);
    const top    = parseInt(parts[7], 10);
    const width  = parseInt(parts[8], 10);
    const height = parseInt(parts[9], 10);
    const text   = parts.slice(11).join('\t').trim();
    if (text) words.push(...splitCompoundToken(text, { x0: left, y0: top, x1: left + width, y1: top + height }));
  }
  return words;
}

// Extract all word bounding boxes from a Tesseract Page.
// Prefers TSV (works across PSM modes); falls back to the block hierarchy.
function extractWords(page: TesseractPage): OcrWord[] {
  if (page.tsv) {
    const tsvWords = parseWordsFromTsv(page.tsv);
    if (tsvWords.length > 0) return tsvWords;
  }
  // Fallback: traverse block → paragraph → line → word hierarchy
  const words: OcrWord[] = [];
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          const t = word.text?.trim();
          if (t) words.push(...splitCompoundToken(t, word.bbox));
        }
      }
    }
  }
  return words;
}

const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;

// Locate BINGO column-header letters; returns one anchor per column or null
// if fewer than 3 letters are found. Handles both single-token "BINGO" and
// individual letter reads from Tesseract.
function detectBingoAnchors(words: OcrWord[]): BingoAnchor[] | null {
  // Case 1: "BINGO" as one token
  const bingoWord = words.find(w => /^bingo$/i.test(w.text));
  if (bingoWord) {
    const { x0, x1, y1 } = bingoWord.bbox;
    const colW = (x1 - x0) / 5;
    return BINGO_LETTERS.map((_, col) => ({
      col,
      cx: x0 + colW * col + colW / 2,
      x0: x0 + colW * col,
      x1: x0 + colW * (col + 1),
      headerBottom: y1,
    }));
  }

  // Case 2: individual letters
  const anchors: BingoAnchor[] = [];
  for (let col = 0; col < 5; col++) {
    const letter = BINGO_LETTERS[col];
    const w = words.find(w => w.text.toUpperCase() === letter);
    if (w) {
      anchors.push({
        col,
        cx: (w.bbox.x0 + w.bbox.x1) / 2,
        x0: w.bbox.x0,
        x1: w.bbox.x1,
        headerBottom: w.bbox.y1,
      });
    }
  }
  return anchors.length >= 3 ? anchors : null;
}

// Compute pixel x0/x1 bounds for each BINGO column from anchor data,
// interpolating or extrapolating missing columns at equal width.
function computeColumnBounds(
  anchors: BingoAnchor[],
  imageWidth: number
): { x0: number; x1: number }[] {
  const colCx: (number | null)[] = [null, null, null, null, null];
  for (const a of anchors) colCx[a.col] = a.cx;

  // Estimate cell width from average gap between adjacent detected columns
  let cellW = 0;
  let pairs = 0;
  for (let c = 1; c < 5; c++) {
    if (colCx[c] !== null && colCx[c - 1] !== null) {
      cellW += (colCx[c] as number) - (colCx[c - 1] as number);
      pairs++;
    }
  }
  if (pairs === 0) {
    // Try non-adjacent pairs
    outer: for (let a = 0; a < 4; a++) {
      for (let b = a + 2; b < 5; b++) {
        if (colCx[a] !== null && colCx[b] !== null) {
          cellW = ((colCx[b] as number) - (colCx[a] as number)) / (b - a);
          pairs = 1;
          break outer;
        }
      }
    }
  } else {
    cellW /= pairs;
  }

  if (cellW <= 0) {
    // Last resort: equal columns across image width
    cellW = imageWidth / 5;
    for (let c = 0; c < 5; c++) colCx[c] = cellW * c + cellW / 2;
  } else {
    // Fill missing centers by extrapolation from the nearest known column
    for (let c = 0; c < 5; c++) {
      if (colCx[c] !== null) continue;
      for (let k = c - 1; k >= 0; k--) {
        if (colCx[k] !== null) { colCx[c] = (colCx[k] as number) + (c - k) * cellW; break; }
      }
      if (colCx[c] === null) {
        for (let k = c + 1; k < 5; k++) {
          if (colCx[k] !== null) { colCx[c] = (colCx[k] as number) - (k - c) * cellW; break; }
        }
      }
    }
  }

  return (colCx as number[]).map(cx => ({
    x0: Math.max(0, Math.round(cx - cellW / 2)),
    x1: Math.min(imageWidth, Math.round(cx + cellW / 2)),
  }));
}

// OCR each of the 24 non-FREE cells individually (PSM 8 + digit whitelist).
// Returns null if more than 8 cells fail, signalling fallback to spatial parse.
async function ocrPerCell(
  dataUrl: string,
  anchors: BingoAnchor[],
  worker: Tesseract.Worker
): Promise<{ grid: number[][]; warnings: string[] } | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = async () => {
      try {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const headerBottom = Math.max(...anchors.map(a => a.headerBottom));
        const gridH = ih - headerBottom;
        if (gridH < 20) { resolve(null); return; }

        const rowH = gridH / 5;
        const colBounds = computeColumnBounds(anchors, iw);

        const grid: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
        const warnings: string[] = [];
        let emptyCount = 0;

        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 5; col++) {
            if (row === 2 && col === 2) continue; // FREE cell — always 0

            const { x0: cx0, x1: cx1 } = colBounds[col];
            const cy0 = headerBottom + row * rowH;
            const cy1 = headerBottom + (row + 1) * rowH;

            // Inset by 8% on each side to exclude grid lines from the crop
            const px = (cx1 - cx0) * 0.08;
            const py = (cy1 - cy0) * 0.08;
            const cropX = Math.max(0, Math.round(cx0 + px));
            const cropY = Math.max(0, Math.round(cy0 + py));
            const cropW = Math.min(iw - cropX, Math.round((cx1 - cx0) - 2 * px));
            const cropH = Math.min(ih - cropY, Math.round((cy1 - cy0) - 2 * py));

            if (cropW < 4 || cropH < 4) { emptyCount++; continue; }

            // Upscale 3× — small crops of single-digit numbers need larger images
            // for Tesseract to distinguish e.g. "2" vs "5", "3" vs "8"
            const CELL_SCALE = 3;
            const cell = document.createElement('canvas');
            cell.width = Math.round(cropW * CELL_SCALE);
            cell.height = Math.round(cropH * CELL_SCALE);
            const cellCtx = cell.getContext('2d')!;
            cellCtx.imageSmoothingEnabled = true;
            cellCtx.imageSmoothingQuality = 'high';
            cellCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cell.width, cell.height);

            const res = await worker.recognize(cell.toDataURL('image/png'), {}, { text: true } as never);
            const raw = ((res.data as unknown as TesseractPage).text ?? '').replace(/\s+/g, '');
            const n = parseInt(raw, 10);

            if (!isNaN(n) && n >= 1 && n <= 75) {
              const expectedCol = COL_RANGES.findIndex(([lo, hi]) => n >= lo && n <= hi);
              if (expectedCol === col) {
                grid[row][col] = n;
              } else {
                // Recognized digit belongs to the wrong column — boundary estimation off
                emptyCount++;
              }
            } else {
              emptyCount++;
            }
          }
        }

        // Too many failures → spatial fallback will be more reliable
        if (emptyCount > 8) { resolve(null); return; }

        if (emptyCount > 0) {
          warnings.push('Some cells could not be read — please fill in the blanks.');
        }

        resolve({ grid, warnings });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Crop a preprocessed data URL to just the number grid below the BINGO header.
// Returns the original dataUrl unchanged if anything fails.
function cropToNumberGrid(dataUrl: string, anchors: BingoAnchor[]): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const headerBottom = Math.max(...anchors.map(a => a.headerBottom));
        const colSpan = Math.max(...anchors.map(a => a.x1)) - Math.min(...anchors.map(a => a.x0));
        const pad = colSpan / 10; // ~half-cell padding on each side

        const left  = Math.max(0, Math.min(...anchors.map(a => a.x0)) - pad);
        const right = Math.min(img.naturalWidth, Math.max(...anchors.map(a => a.x1)) + pad);
        const top   = Math.max(0, headerBottom);
        const bottom = img.naturalHeight;

        const w = Math.round(right - left);
        const h = Math.round(bottom - top);
        if (w < 10 || h < 10) { resolve(dataUrl); return; }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, left, top, w, h, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function runOcrOnDataUrl(
  dataUrl: string,
  onProgress?: (progress: number) => void
): Promise<{ numbers: number[][]; warnings: string[]; cardId?: string }> {
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(Math.round(m.progress * 100));
      }
    },
  });
  try {
    // PSM 11 sparse pass: locates FREE-cell serial for card ID detection
    await worker.setParameters({
      tessedit_pageseg_mode: '11' as never,
    });
    const sparseResult = await worker.recognize(dataUrl, {}, { text: true, blocks: true, tsv: true } as never);
    const sparsePage = sparseResult.data as unknown as TesseractPage;
    const sparseWords = extractWords(sparsePage);

    // PSM 6 pass: detect BINGO column-header anchors and card ID
    await worker.setParameters({
      tessedit_pageseg_mode: '6' as never,
    });
    const result1 = await worker.recognize(dataUrl, {}, { text: true, blocks: true, tsv: true } as never);
    const page1 = result1.data as unknown as TesseractPage;
    const words1 = extractWords(page1);
    const anchors = detectBingoAnchors(words1);

    // Extract card ID (serial > 75 in FREE-cell area, or number in header)
    const { cardId } = parseOcrResult(page1, sparseWords);

    if (anchors) {
      // PSM 8 per-cell pass: crop each of the 24 non-FREE cells and read individually.
      // Eliminates serial-number digits and row mis-ordering from bbox-sort inaccuracies.
      await worker.setParameters({
        tessedit_pageseg_mode: '8' as never,
        tessedit_char_whitelist: '0123456789' as never,
      });
      const perCellResult = await ocrPerCell(dataUrl, anchors, worker);
      if (perCellResult) {
        return { numbers: perCellResult.grid, warnings: perCellResult.warnings, cardId };
      }
    }

    // Fallback spatial parse — used when anchors not found or per-cell OCR fails.
    // Run with digit whitelist on the cropped grid to cut down on noise.
    await worker.setParameters({
      tessedit_pageseg_mode: '6' as never,
      tessedit_char_whitelist: '0123456789' as never,
    });
    let gridPage = page1;
    if (anchors) {
      const gridDataUrl = await cropToNumberGrid(dataUrl, anchors);
      const result2 = await worker.recognize(gridDataUrl, {}, { text: true, blocks: true, tsv: true } as never);
      gridPage = result2.data as unknown as TesseractPage;
    }
    const gridResult = parseOcrResult(gridPage, sparseWords);
    return { ...gridResult, cardId: cardId ?? gridResult.cardId };
  } finally {
    await worker.terminate();
  }
}

interface Region {
  cropDataUrl: string;
  cropBlob: Blob;
}

// Detect all bingo card regions in a full image via sparse-text clustering,
// then return a cropped data URL and blob for each card found.
async function detectCardRegions(
  processedDataUrl: string,
  originalFile: File
): Promise<Region[]> {
  const worker = await Tesseract.createWorker('eng', 1);
  let words: OcrWord[] = [];
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '11' as never,
      tessedit_char_whitelist: '0123456789' as never,
    });
    const result = await worker.recognize(processedDataUrl, {}, { text: true, blocks: true, tsv: true } as never);
    words = extractWords(result.data as unknown as TesseractPage);
  } finally {
    await worker.terminate();
  }

  // Filter to valid bingo tokens only
  const tokens = words
    .filter(w => {
      const t = w.text.trim();
      if (/^free$/i.test(t)) return true;
      const n = parseInt(t, 10);
      return !isNaN(n) && n >= 1 && n <= 75;
    })
    .map(w => ({
      cx: (w.bbox.x0 + w.bbox.x1) / 2,
      cy: (w.bbox.y0 + w.bbox.y1) / 2,
      x0: w.bbox.x0, y0: w.bbox.y0,
      x1: w.bbox.x1, y1: w.bbox.y1,
    }));

  if (tokens.length < 20) return []; // can't cluster with too few tokens

  // Estimate typical cell size from median word width
  const widths = tokens.map(t => t.x1 - t.x0).sort((a, b) => a - b);
  const medianWidth = widths[Math.floor(widths.length / 2)];
  const clusterDist = medianWidth * 4; // tokens within 4 cell-widths → same card

  // Greedy proximity clustering
  const clusters: TokenItem[][] = [];
  for (const token of tokens) {
    let placed = false;
    for (const cluster of clusters) {
      const inside = cluster.some(
        (ct: TokenItem) => Math.hypot(ct.cx - token.cx, ct.cy - token.cy) < clusterDist
      );
      if (inside) { cluster.push(token); placed = true; break; }
    }
    if (!placed) clusters.push([token]);
  }

  // Only keep clusters large enough to be a real card (at least 20 tokens)
  const cardClusters = clusters.filter(c => c.length >= 20);

  if (cardClusters.length <= 1) return []; // let single-card path handle it

  // Sort top-to-bottom, left-to-right for consistent ordering
  cardClusters.sort((a, b) => {
    const ay = Math.min(...a.map(t => t.y0));
    const by = Math.min(...b.map(t => t.y0));
    if (Math.abs(ay - by) > medianWidth * 3) return ay - by;
    return Math.min(...a.map(t => t.x0)) - Math.min(...b.map(t => t.x0));
  });

  // Crop each cluster from the original image
  return cropRegions(cardClusters, originalFile);
}

async function cropRegions(
  clusters: TokenItem[][],
  file: File
): Promise<Region[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const results: Region[] = [];

        // preprocessImage scales uniformly based on width, so use a single
        // coordScale to map processed-image coords back to original-image coords.
        const coordScale = img.naturalWidth < MIN_OCR_WIDTH
          ? img.naturalWidth / MIN_OCR_WIDTH
          : 1;

        for (const cluster of clusters) {
          const padX = (cluster[0].x1 - cluster[0].x0) * 0.5;
          const padY = (cluster[0].y1 - cluster[0].y0) * 0.5;

          // Convert processed-image bbox coords → original-image coords
          const ox0 = Math.max(0, (Math.min(...cluster.map(t => t.x0)) - padX) * coordScale);
          const oy0 = Math.max(0, (Math.min(...cluster.map(t => t.y0)) - padY) * coordScale);
          const ox1 = Math.min(img.naturalWidth,  (Math.max(...cluster.map(t => t.x1)) + padX) * coordScale);
          const oy1 = Math.min(img.naturalHeight, (Math.max(...cluster.map(t => t.y1)) + padY) * coordScale);

          const ow = Math.round(ox1 - ox0);
          const oh = Math.round(oy1 - oy0);

          if (ow < 10 || oh < 10) continue; // skip degenerate crops

          const canvas = document.createElement('canvas');
          canvas.width = ow;
          canvas.height = oh;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, ox0, oy0, ow, oh, 0, 0, ow, oh);

          const cropDataUrl = canvas.toDataURL('image/png');
          const byteStr = atob(cropDataUrl.split(',')[1]);
          const arr = new Uint8Array(byteStr.length);
          for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
          const cropBlob = new Blob([arr], { type: 'image/png' });

          results.push({ cropDataUrl, cropBlob });
        }
        resolve(results);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Crop failed')); };
    img.src = url;
  });
}

// Build a 5×5 bingo grid: bucket numbers by column range, deduplicate,
// sort by Y position, and fill the grid top-to-bottom.
function buildGridFromNumbers(entries: { n: number; cy: number }[]): { grid: number[][], missing: boolean } {
  const buckets: { n: number; cy: number }[][] = [[], [], [], [], []];
  for (const e of entries) {
    const col = COL_RANGES.findIndex(([lo, hi]) => e.n >= lo && e.n <= hi);
    if (col === -1) continue;
    if (!buckets[col].some(x => x.n === e.n)) buckets[col].push(e);
  }
  for (const b of buckets) b.sort((a, b) => a.cy - b.cy);
  const grid: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
  grid[2][2] = 0;
  let missing = false;
  for (let col = 0; col < 5; col++) {
    let bi = 0;
    for (let row = 0; row < 5; row++) {
      if (row === 2 && col === 2) continue;
      const entry = buckets[col][bi++];
      if (entry) { grid[row][col] = entry.n; } else { missing = true; }
    }
  }
  return { grid, missing };
}

// Extract {n, cy} entries from OCR text lines when spatial bboxes are unavailable.
// Uses synthetic cy from line index; also splits compound digit tokens.
function entriesFromText(text: string): { n: number; cy: number }[] {
  const entries: { n: number; cy: number }[] = [];
  text.split(/\r?\n/).forEach((line, lineIdx) => {
    const cy = lineIdx * 100;
    // Normalise OCR noise: L/l misread as 1, then strip non-digit separators
    const cleaned = line
      .replace(/\bL\b/g, '10')  // standalone L → 10 (Tesseract reads "10" as "L" in bingo card fonts)
      .replace(/[|/\\.,;:\[\](){}]/g, ' '); // separators → spaces
    for (const token of (cleaned.match(/\d+/g) ?? [])) {
      // Split bare 3–4 digit compound tokens (e.g. "2141" → 21, 41)
      if (/^\d{3,4}$/.test(token)) {
        let split = false;
        for (let s = 1; s < token.length; s++) {
          const a = parseInt(token.slice(0, s), 10);
          const b = parseInt(token.slice(s), 10);
          if (a >= 1 && a <= 75 && b >= 1 && b <= 75) {
            entries.push({ n: a, cy }, { n: b, cy });
            split = true; break;
          }
        }
        if (!split) { const n = parseInt(token, 10); if (n >= 1 && n <= 75) entries.push({ n, cy }); }
      } else {
        const n = parseInt(token, 10);
        if (n >= 1 && n <= 75) entries.push({ n, cy });
      }
    }
  });
  return entries;
}

// Parse a Tesseract word as a bingo number (1–75). Handles 'L'/'l' → '10' misread.
function parseBingoNum(text: string): number | null {
  const norm = /^[Ll]$/.test(text) ? '10' : text;
  const n = parseInt(norm, 10);
  return (!isNaN(n) && n >= 1 && n <= 75) ? n : null;
}

function parseOcrResult(data: TesseractPage, extraWords: OcrWord[] = []): {
  numbers: number[][];
  warnings: string[];
  cardId?: string;
} {
  // Merge PSM6 and PSM11 word lists; PSM11 extraWords supply the FREE-cell serial
  // that PSM6 often misses. Deduplication by lowercase text prevents double-counting.
  const seen = new Set<string>();
  const allRawWords: OcrWord[] = [];
  for (const w of [...extractWords(data), ...extraWords]) {
    const key = w.text.toLowerCase();
    if (!seen.has(key)) { seen.add(key); allRawWords.push(w); }
  }
  const allWords = allRawWords.map(w => ({
    text: w.text,
    cx: (w.bbox.x0 + w.bbox.x1) / 2,
    cy: (w.bbox.y0 + w.bbox.y1) / 2,
    x0: w.bbox.x0, y0: w.bbox.y0,
    x1: w.bbox.x1, y1: w.bbox.y1,
    height: w.bbox.y1 - w.bbox.y0,
    width:  w.bbox.x1 - w.bbox.x0,
  }));

  const imgW = allWords.length ? Math.max(...allWords.map(w => w.x1)) : 1;
  const imgH = allWords.length ? Math.max(...allWords.map(w => w.y1)) : 1;

  // Card ID: prefer a FREE-cell serial (number > 75 near image centre);
  // fall back to a long number in the top 15% header area.
  const cx30L = imgW * 0.35, cx30R = imgW * 0.65;
  const cy30T = imgH * 0.35, cy30B = imgH * 0.65;

  // Prefer the longest candidate — PSM 6 often reads serials as shorter fragments.
  const freeCellId = allWords
    .filter(w => {
      const n = parseInt(w.text, 10);
      return (
        !isNaN(n) && n > 75 && w.text.length >= 3 && w.text.length <= 6 &&
        w.cx >= cx30L && w.cx <= cx30R &&
        w.cy >= cy30T && w.cy <= cy30B
      );
    })
    .sort((a, b) => b.text.length - a.text.length)[0];
  const headerId = !freeCellId
    ? allWords.find(w => {
        const n = parseInt(w.text, 10);
        return !isNaN(n) && w.text.length >= 4 && w.text.length <= 8 && w.cy <= imgH * 0.15;
      })
    : undefined;
  const cardId = freeCellId?.text ?? headerId?.text;

  // Build per-column buckets from PSM6 words, then fill any short column from
  // PSM11 extras. Reject PSM11 additions once a column is already full to
  // prevent spurious partial-misread tokens from corrupting clean columns.
  const colNeed = [5, 5, 4, 5, 5];
  const colBuckets: Map<number, { n: number; cy: number }>[] = Array.from({ length: 5 }, () => new Map());

  for (const w of extractWords(data)) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    const n = parseBingoNum(w.text);
    if (n === null) continue;
    const col = COL_RANGES.findIndex(([lo, hi]) => n >= lo && n <= hi);
    if (col !== -1 && !colBuckets[col].has(n)) colBuckets[col].set(n, { n, cy });
  }

  for (const w of extraWords) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    const n = parseBingoNum(w.text);
    if (n === null) continue;
    const col = COL_RANGES.findIndex(([lo, hi]) => n >= lo && n <= hi);
    if (col === -1) continue;
    if (colBuckets[col].has(n)) continue;               // already have this number
    if (colBuckets[col].size >= colNeed[col]) continue;  // column full — reject spurious extras
    colBuckets[col].set(n, { n, cy });
  }

  const spatialEntries = colBuckets.flatMap(b => [...b.values()]);

  const spatialResult = buildGridFromNumbers(spatialEntries);
  if (!spatialResult.missing) {
    return { numbers: spatialResult.grid, warnings: [], cardId };
  }

  // PSM11 text is intentionally skipped — sparse mode output is not guaranteed
  // top-to-bottom, so synthetic line-index cy values would mis-sort numbers.
  const textEntries = entriesFromText(data.text);
  const textResult = buildGridFromNumbers(textEntries);
  if (!textResult.missing) {
    return { numbers: textResult.grid, warnings: ['Spatial OCR incomplete — please review any missing cells.'], cardId };
  }

  const combined = [...spatialEntries];
  for (const e of textEntries) {
    if (!combined.some(s => s.n === e.n)) combined.push(e);
  }
  const combinedResult = buildGridFromNumbers(combined);
  const combinedWarnings: string[] = combinedResult.missing
    ? ['Some cells could not be read — please fill in the blanks.']
    : ['Please review OCR result.'];
  return { numbers: combinedResult.grid, warnings: combinedWarnings, cardId };
}

/** Make a fresh blank 5×5 markedCells array with only the FREE center marked */
export function makeInitialMarkedCells(): boolean[][] {
  return Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (__, c) => r === 2 && c === 2)
  );
}
