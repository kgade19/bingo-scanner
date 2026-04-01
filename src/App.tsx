import { useMemo, useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { detectWins } from './utils/winDetector';
import CardUploader from './components/CardUploader';
import BingoCardGrid from './components/BingoCardGrid';
import CallerPanel from './components/CallerPanel';
import type { BingoCard } from './types';

export default function App() {
  const {
    state,
    addCard,
    deleteCard,
    deleteAllCards,
    callNumber,
    clearAllMarks,
    clearCardMarks,
    setBlackoutRound,
  } = useGameState();

  const [showUploader, setShowUploader] = useState(false);

  const winsMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof detectWins>> = {};
    for (const card of state.cards) {
      map[card.id] = detectWins(card, state.isBlackoutRound);
    }
    return map;
  }, [state.cards, state.isBlackoutRound]);

  const totalWins = Object.values(winsMap).flat().length;

  function handleCardReady(card: BingoCard) {
    addCard(card);
    setShowUploader(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-blue-700 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">KG Bingo Scanner</h1>
            <p className="text-xs text-blue-200">{state.cards.length} card{state.cards.length !== 1 ? 's' : ''} loaded</p>
          </div>
          <button
            onClick={() => setShowUploader(v => !v)}
            className="px-4 py-2 bg-white text-blue-700 font-bold rounded-xl text-sm hover:bg-blue-50 active:scale-95 transition-all"
          >
            {showUploader ? 'Cancel' : '+ Add Card'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
          <CallerPanel
            calledNumbers={state.calledNumbers}
            isBlackoutRound={state.isBlackoutRound}
            onCallNumber={callNumber}
            onClearAllMarks={clearAllMarks}
            onDeleteAllCards={deleteAllCards}
            onSetBlackout={setBlackoutRound}
          />
          <div className={showUploader ? 'block' : 'hidden lg:block'}>
            <CardUploader onCardReady={handleCardReady} existingCards={state.cards} />
          </div>
        </div>

        <div className="flex-1">
          {state.cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
              <div className="text-6xl">??</div>
              <p className="text-lg font-semibold">No cards yet</p>
              <p className="text-sm text-center">Tap Add Card to upload your first bingo card</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {state.cards.map(card => (
                <BingoCardGrid
                  key={card.id}
                  card={card}
                  wins={winsMap[card.id] ?? []}
                  onDelete={() => deleteCard(card.id)}
                  onClearMarks={() => clearCardMarks(card.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400 py-4">
        &copy; {new Date().getFullYear()} Kiran Gade (KG). All rights reserved.
      </footer>

      {totalWins > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
          <div className="max-w-5xl mx-auto px-4 pb-4">
            {Object.entries(winsMap)
              .filter(([, wins]) => wins.length > 0)
              .map(([cardId, wins]) => {
                const card = state.cards.find(c => c.id === cardId);
                if (!card) return null;
                const isBlackout = wins.some(w => w.isBlackout);
                return (
                  <div
                    key={cardId}
                    className={`mt-2 rounded-2xl px-5 py-3 text-center font-extrabold text-lg shadow-xl animate-bounce pointer-events-auto ${
                      isBlackout ? 'bg-yellow-400 text-yellow-900' : 'bg-green-500 text-white'
                    }`}
                  >
                    {isBlackout
                      ? `BLACKOUT on "${card.label}"!`
                      : `BINGO on "${card.label}"!`}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
