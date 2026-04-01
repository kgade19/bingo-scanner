import { useState } from 'react';
import type { BingoCard } from '../types';

const COLUMNS = ['B', 'I', 'N', 'G', 'O'];
const COL_RANGES: [number, number][] = [
  [1, 15], [16, 30], [31, 45], [46, 60], [61, 75],
];

interface Props {
  card: BingoCard;
  warnings: string[];
  onConfirm: (card: BingoCard) => void;
  onCancel: () => void;
  cardIndex?: number;  // 0-based
  totalCards?: number;
}

export default function CardEditor({ card, warnings, onConfirm, onCancel, cardIndex, totalCards }: Props) {
  const [label, setLabel] = useState(card.label);
  const [numbers, setNumbers] = useState<number[][]>(
    card.numbers.map(row => [...row])
  );
  const [errors, setErrors] = useState<string[]>([]);

  function handleChange(row: number, col: number, value: string) {
    const num = parseInt(value, 10);
    const next = numbers.map(r => [...r]);
    next[row][col] = isNaN(num) ? 0 : num;
    setNumbers(next);
  }

  function validate(): boolean {
    const errs: string[] = [];
    for (let c = 0; c < 5; c++) {
      const [min, max] = COL_RANGES[c];
      for (let r = 0; r < 5; r++) {
        if (r === 2 && c === 2) continue; // FREE
        const n = numbers[r][c];
        if (n < min || n > max) {
          errs.push(`${COLUMNS[c]}${r + 1}: ${n || 'empty'} (needs ${min}–${max})`);
        }
      }
    }
    setErrors(errs);
    return errs.length === 0;
  }

  function handleConfirm() {
    if (!validate()) return;
    onConfirm({
      ...card,
      label,
      numbers,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">Review Card</h2>
          {totalCards !== undefined && totalCards > 1 && (
            <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              {(cardIndex ?? 0) + 1} / {totalCards}
            </span>
          )}
        </div>

        {/* Preview image */}
        <img
          src={card.imageUrl}
          alt="Bingo card"
          className="w-full h-40 object-contain rounded-xl border border-gray-200 bg-gray-50"
        />

        {/* Card label */}
        <div>
          <label className="text-sm font-semibold text-gray-600 block mb-1">Card Label</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="e.g. My Card, Blue Card…"
          />
        </div>

        {/* OCR warnings */}
        {warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-xs text-yellow-800 space-y-1">
            <p className="font-semibold">⚠️ OCR Warnings — please review:</p>
            {warnings.map((w, i) => <p key={i}>• {w}</p>)}
          </div>
        )}

        {/* Grid editor */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Tap any cell to correct a number.</p>
          <div className="grid grid-cols-5 gap-1">
            {COLUMNS.map((col) => (
              <div key={col} className="text-center font-bold text-blue-700 text-sm py-1 bg-blue-50 rounded">
                {col}
              </div>
            ))}
            {Array.from({ length: 5 }, (_, r) =>
              Array.from({ length: 5 }, (__, c) => {
                const isFree = r === 2 && c === 2;
                return (
                  <div key={`${r}-${c}`}>
                    {isFree ? (
                      <div className="text-center font-bold text-green-700 text-xs bg-green-100 rounded p-2 h-10 flex items-center justify-center">
                        FREE
                      </div>
                    ) : (
                      <input
                        type="number"
                        value={numbers[r][c] || ''}
                        onChange={e => handleChange(r, c, e.target.value)}
                        className="w-full text-center border border-gray-200 rounded p-1 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        min={COL_RANGES[c][0]}
                        max={COL_RANGES[c][1]}
                        placeholder="—"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-xs text-red-700 space-y-1">
            <p className="font-semibold">❌ Fix these before saving:</p>
            {errors.map((e, i) => <p key={i}>• {e}</p>)}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-gray-300 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            Save Card
          </button>
        </div>
      </div>
    </div>
  );
}
