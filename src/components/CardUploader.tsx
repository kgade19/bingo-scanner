import React, { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BingoCard } from '../types';
import { parseMultiCardImage, makeInitialMarkedCells } from '../utils/ocrParser';
import CardEditor from './CardEditor';

interface Props {
  onCardReady: (card: BingoCard) => void;
  existingCards: BingoCard[];
}

interface QueueItem {
  card: BingoCard;
  warnings: string[];
}

export default function CardUploader({ onCardReady, existingCards }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  const [dupWarning, setDupWarning] = useState<string | null>(null);

  function isDuplicate(numbers: number[][]): boolean {
    return existingCards.some(existing =>
      existing.numbers.every((row, r) => row.every((n, c) => n === numbers[r][c]))
    );
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    setProcessing(true);
    setProgress(0);
    setScanStatus('Analysing image…');

    try {
      let detectedCount = 0;
      const results = await parseMultiCardImage(file, p => {
        setProgress(p);
        if (p < 20) setScanStatus('Detecting cards…');
        else setScanStatus(`Reading card${detectedCount > 1 ? 's' : ''}… ${p}%`);
      });
      detectedCount = results.length;

      const items: QueueItem[] = results.map((r, i) => ({
        card: {
          id: uuidv4(),
          label: r.cardId ?? `Card ${i + 1}`,
          imageUrl: r.cropUrl,
          numbers: r.numbers,
          markedCells: makeInitialMarkedCells(),
        },
        warnings: r.warnings,
      }));

      if (items.length === 0) {
        // Completely failed — surface a blank card for manual entry
        const fallbackUrl = URL.createObjectURL(file);
        items.push({
          card: {
            id: uuidv4(),
            label: `Card ${Date.now()}`,
            imageUrl: fallbackUrl,
            numbers: Array.from({ length: 5 }, () => Array(5).fill(0)),
            markedCells: makeInitialMarkedCells(),
          },
          warnings: ['OCR failed. Please enter numbers manually.'],
        });
      }

      setQueue(items);
      setQueueIndex(0);
    } catch (err: unknown) {
      const fallbackUrl = URL.createObjectURL(file);
      setQueue([{
        card: {
          id: uuidv4(),
          label: `Card ${Date.now()}`,
          imageUrl: fallbackUrl,
          numbers: Array.from({ length: 5 }, () => Array(5).fill(0)),
          markedCells: makeInitialMarkedCells(),
        },
        warnings: ['OCR failed. Please enter numbers manually.'],
      }]);
      setQueueIndex(0);
    } finally {
      setProcessing(false);
      setScanStatus('');
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleConfirm(card: BingoCard) {
    if (isDuplicate(card.numbers)) {
      setDupWarning('This card is already loaded. Please add a different card.');
      return;
    }
    setDupWarning(null);
    onCardReady(card);
    advanceQueue();
  }

  function handleCancel() {
    URL.revokeObjectURL(queue[queueIndex]?.card.imageUrl ?? '');
    advanceQueue();
  }

  function advanceQueue() {
    const next = queueIndex + 1;
    if (next >= queue.length) {
      setQueue([]);
      setQueueIndex(0);
    } else {
      setQueueIndex(next);
    }
  }

  const current = queue[queueIndex] ?? null;

  if (current) {
    return (
      <CardEditor
        card={current.card}
        warnings={dupWarning ? [dupWarning, ...current.warnings] : current.warnings}
        cardIndex={queueIndex}
        totalCards={queue.length}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleInputChange}
        />
        {processing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-blue-600 font-semibold text-lg">{scanStatus || `Scanning… ${progress}%`}</div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500">Tesseract OCR is reading your card</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 pointer-events-none">
            <div className="text-5xl">📷</div>
            <p className="text-lg font-semibold text-gray-700">Upload Bingo Card(s)</p>
            <p className="text-sm text-gray-500">
              Tap to take a photo or choose from gallery
            </p>
            <p className="text-xs text-gray-400">Single card or multiple side-by-side · JPG, PNG, HEIC</p>
          </div>
        )}
      </div>
    </div>
  );
}
