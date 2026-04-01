import type { BingoCard, WinResult } from '../types';

/** Returns all active wins for a single card given the current called numbers */
export function detectWins(card: BingoCard, isBlackout: boolean): WinResult[] {
  const m = card.markedCells;
  const results: WinResult[] = [];

  if (isBlackout) {
    const allMarked = m.every(row => row.every(cell => cell));
    if (allMarked) {
      results.push({ cardId: card.id, type: 'row', index: -1, isBlackout: true });
    }
    return results;
  }

  // Check rows
  for (let r = 0; r < 5; r++) {
    if (m[r].every(cell => cell)) {
      results.push({ cardId: card.id, type: 'row', index: r, isBlackout: false });
    }
  }

  // Check columns
  for (let c = 0; c < 5; c++) {
    if (m.every(row => row[c])) {
      results.push({ cardId: card.id, type: 'col', index: c, isBlackout: false });
    }
  }

  // Main diagonal (top-left → bottom-right)
  if ([0, 1, 2, 3, 4].every(i => m[i][i])) {
    results.push({ cardId: card.id, type: 'diag', index: 0, isBlackout: false });
  }

  // Anti-diagonal (top-right → bottom-left)
  if ([0, 1, 2, 3, 4].every(i => m[i][4 - i])) {
    results.push({ cardId: card.id, type: 'diag', index: 1, isBlackout: false });
  }

  return results;
}

/** Returns true if a specific cell is part of any winning line */
export function isCellInWin(
  wins: WinResult[],
  row: number,
  col: number
): boolean {
  return wins.some(w => {
    if (w.isBlackout) return true;
    if (w.type === 'row') return w.index === row;
    if (w.type === 'col') return w.index === col;
    if (w.type === 'diag' && w.index === 0) return row === col;
    if (w.type === 'diag' && w.index === 1) return row + col === 4;
    return false;
  });
}

export function winLabel(win: WinResult): string {
  if (win.isBlackout) return 'BLACKOUT!';
  const cols = ['B', 'I', 'N', 'G', 'O'];
  if (win.type === 'row') return `Row ${win.index + 1}`;
  if (win.type === 'col') return `Column ${cols[win.index]}`;
  if (win.type === 'diag') return win.index === 0 ? 'Main diagonal' : 'Anti-diagonal';
  return 'BINGO!';
}
