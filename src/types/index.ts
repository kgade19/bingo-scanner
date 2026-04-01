export interface BingoCard {
  id: string;
  label: string;
  imageUrl: string;
  numbers: number[][];
  markedCells: boolean[][];
}

export interface GameState {
  cards: BingoCard[];
  calledNumbers: number[];
  isBlackoutRound: boolean;
}

export type WinType = 'row' | 'col' | 'diag';

export interface WinResult {
  cardId: string;
  type: WinType;
  // row/col: 0–4; diag: 0 = main, 1 = anti-diagonal; blackout: -1
  index: number;
  isBlackout: boolean;
}
