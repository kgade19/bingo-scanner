import { useState, useEffect } from 'react';
import type { GameState, BingoCard } from '../types';

const STORAGE_KEY = 'bingo-scanner-state';

const makeInitialState = (): GameState => ({
  cards: [],
  calledNumbers: [],
  isBlackoutRound: false,
});

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeInitialState();
    return JSON.parse(raw) as GameState;
  } catch {
    return makeInitialState();
  }
}

function saveState(state: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore write failures (e.g. private browsing storage quota)
  }
}

export function useGameState() {
  const [state, setState] = useState<GameState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const addCard = (card: BingoCard) => {
    setState(s => ({ ...s, cards: [...s.cards, card] }));
  };

  const updateCard = (card: BingoCard) => {
    setState(s => ({
      ...s,
      cards: s.cards.map(c => (c.id === card.id ? card : c)),
    }));
  };

  const deleteCard = (id: string) => {
    setState(s => ({ ...s, cards: s.cards.filter(c => c.id !== id) }));
  };

  const deleteAllCards = () => {
    setState(s => ({ ...s, cards: [], calledNumbers: [], isBlackoutRound: false }));
  };

  const callNumber = (num: number) => {
    setState(s => {
      if (s.calledNumbers.includes(num)) return s;
      // Mark all cards
      const updatedCards = s.cards.map(card => {
        const newMarked = card.markedCells.map(row => [...row]);
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (card.numbers[r][c] === num) {
              newMarked[r][c] = true;
            }
          }
        }
        return { ...card, markedCells: newMarked };
      });
      return { ...s, calledNumbers: [...s.calledNumbers, num], cards: updatedCards };
    });
  };

  const clearAllMarks = () => {
    setState(s => ({
      ...s,
      calledNumbers: [],
      cards: s.cards.map(card => ({
        ...card,
        markedCells: card.markedCells.map((row, r) =>
          row.map((_, c) => r === 2 && c === 2) // only FREE stays marked
        ),
      })),
    }));
  };

  const clearCardMarks = (id: string) => {
    setState(s => ({
      ...s,
      cards: s.cards.map(card =>
        card.id !== id
          ? card
          : {
              ...card,
              markedCells: card.markedCells.map((row, r) =>
                row.map((_, c) => r === 2 && c === 2)
              ),
            }
      ),
    }));
  };

  const setBlackoutRound = (val: boolean) => {
    setState(s => ({ ...s, isBlackoutRound: val }));
  };

  return {
    state,
    addCard,
    updateCard,
    deleteCard,
    deleteAllCards,
    callNumber,
    clearAllMarks,
    clearCardMarks,
    setBlackoutRound,
  };
}
