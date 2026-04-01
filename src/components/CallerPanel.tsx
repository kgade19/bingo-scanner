import React, { useState } from 'react';

interface Props {
  calledNumbers: number[];
  isBlackoutRound: boolean;
  onCallNumber: (n: number) => void;
  onClearAllMarks: () => void;
  onDeleteAllCards: () => void;
  onSetBlackout: (val: boolean) => void;
}

export default function CallerPanel({
  calledNumbers,
  isBlackoutRound,
  onCallNumber,
  onClearAllMarks,
  onDeleteAllCards,
  onSetBlackout,
}: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  function handleCall() {
    const num = parseInt(input.trim(), 10);
    if (isNaN(num) || num < 1 || num > 75) {
      setError('Enter a number between 1 and 75');
      return;
    }
    if (calledNumbers.includes(num)) {
      setError(`${num} was already called`);
      return;
    }
    setError('');
    setInput('');
    onCallNumber(num);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleCall();
  }

  function bingoColumn(n: number) {
    if (n <= 15) return 'B';
    if (n <= 30) return 'I';
    if (n <= 45) return 'N';
    if (n <= 60) return 'G';
    return 'O';
  }

  function colColor(n: number) {
    const col = bingoColumn(n);
    return {
      B: 'bg-blue-500',
      I: 'bg-purple-500',
      N: 'bg-green-500',
      G: 'bg-orange-500',
      O: 'bg-red-500',
    }[col] ?? 'bg-gray-500';
  }

  return (
    <div className="bg-white rounded-2xl shadow-md p-5 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-gray-800">📢 Number Caller</h2>

      {/* Blackout toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => onSetBlackout(!isBlackoutRound)}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            isBlackoutRound ? 'bg-yellow-400' : 'bg-gray-300'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              isBlackoutRound ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </div>
        <span className="font-semibold text-sm text-gray-700">
          {isBlackoutRound ? '🌑 Blackout Round' : 'Normal Round'}
        </span>
      </label>

      {/* Number input */}
      <div className="flex gap-2">
        <input
          type="number"
          value={input}
          onChange={e => { setInput(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          min={1}
          max={75}
          placeholder="1–75"
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleCall}
          className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all"
        >
          Call
        </button>
      </div>

      {error && <p className="text-sm text-red-500 -mt-2">{error}</p>}

      {/* Called numbers history */}
      {calledNumbers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">
            Called ({calledNumbers.length}):
          </p>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
            {[...calledNumbers].reverse().map(n => (
              <span
                key={n}
                className={`${colColor(n)} text-white text-xs font-bold px-2 py-1 rounded-lg`}
              >
                {bingoColumn(n)}{n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={onClearAllMarks}
          className="w-full py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold text-sm transition-colors"
        >
          🧹 Clear All Marks (New Round)
        </button>

        {!confirmDeleteAll ? (
          <button
            onClick={() => setConfirmDeleteAll(true)}
            className="w-full py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 font-semibold text-sm transition-colors"
          >
            🗑️ Delete All Cards
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDeleteAll(false)}
              className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => { onDeleteAllCards(); setConfirmDeleteAll(false); }}
              className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm"
            >
              Yes, Delete All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
