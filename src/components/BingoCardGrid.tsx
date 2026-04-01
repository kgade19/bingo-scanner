import type { BingoCard, WinResult } from '../types';
import { isCellInWin, winLabel } from '../utils/winDetector';

const COLUMNS = ['B', 'I', 'N', 'G', 'O'];

interface Props {
  card: BingoCard;
  wins: WinResult[];
  onDelete: () => void;
  onClearMarks: () => void;
}

export default function BingoCardGrid({ card, wins, onDelete, onClearMarks }: Props) {
  const hasWin = wins.length > 0;
  const isBlackout = wins.some(w => w.isBlackout);

  return (
    <div
      className={`rounded-2xl border-2 shadow-md p-4 flex flex-col gap-3 transition-all ${
        isBlackout
          ? 'border-yellow-400 bg-yellow-50'
          : hasWin
          ? 'border-green-400 bg-green-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-gray-800 text-sm truncate">{card.label}</span>
        <div className="flex gap-1">
          <button
            onClick={onClearMarks}
            title="Clear marks on this card"
            className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onDelete}
            title="Delete this card"
            className="text-xs px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Win badge */}
      {hasWin && (
        <div
          className={`text-center text-sm font-bold rounded-lg py-1 ${
            isBlackout
              ? 'bg-yellow-400 text-yellow-900'
              : 'bg-green-500 text-white'
          }`}
        >
          {isBlackout ? '🎉 BLACKOUT!' : `🎉 BINGO! — ${wins.map(winLabel).join(', ')}`}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-5 gap-0.5">
        {/* Column headers */}
        {COLUMNS.map(col => (
          <div
            key={col}
            className="text-center font-extrabold text-blue-700 text-sm py-1 bg-blue-100 rounded"
          >
            {col}
          </div>
        ))}

        {/* Cells */}
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 5 }, (__, c) => {
            const isFree = r === 2 && c === 2;
            const isMarked = card.markedCells[r][c];
            const isWinCell = isCellInWin(wins, r, c);

            let cellClass =
              'flex items-center justify-center rounded text-sm font-semibold h-10 transition-all ';

            if (isFree) {
              cellClass += 'bg-green-200 text-green-800 text-xs';
            } else if (isWinCell && isMarked) {
              cellClass += isBlackout
                ? 'bg-yellow-400 text-yellow-900 scale-105'
                : 'bg-green-500 text-white scale-105';
            } else if (isMarked) {
              cellClass += 'bg-blue-500 text-white';
            } else {
              cellClass += 'bg-gray-100 text-gray-700';
            }

            return (
              <div key={`${r}-${c}`} className={cellClass}>
                {isFree ? 'FREE' : card.numbers[r][c] || '—'}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
