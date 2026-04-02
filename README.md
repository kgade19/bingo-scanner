# Bingo Scanner
Live demo: https://bingo-scanner.pages.dev/

A mobile-first Progressive Web App for tracking physical bingo cards digitally. Photograph a card with your phone, let OCR read the numbers, then call numbers and watch wins highlight across all cards in real time.

## Features

- Scan bingo cards using your device camera — Tesseract.js reads numbers automatically
- Review and correct OCR results before saving any card
- Call numbers (1–75); all loaded cards are marked instantly
- Win detection for rows, columns, diagonals, and full-card blackout
- Blackout mode toggle for all-cell win requirement
- Track any number of cards simultaneously
- Game state persists across page reloads via `localStorage`
- Installable PWA — works offline and can be added to a home screen

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript |
| Build | Vite 8 |
| Styles | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| OCR | tesseract.js 7 |
| PWA | vite-plugin-pwa |

No backend. No routing. No test framework.

## Getting Started

```sh
npm install
npm run dev        # dev server at http://localhost:5173
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check then production bundle |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint across the whole project |

## How to Use

1. **Add a card** — tap **+ Add Card**, then take a photo or upload an image. Multiple cards side-by-side in one photo are detected automatically.
2. **Review OCR** — a grid editor opens so you can correct any misread numbers before saving.
3. **Call numbers** — type a number (1–75) in the caller panel and press **Call**. All matching cells across every card are marked.
4. **Win alerts** — winning lines animate at the bottom of the screen. Individual card wins are also highlighted in the card grid.
5. **New round** — press **Clear All Marks** to reset marks while keeping cards loaded.
6. **Blackout mode** — toggle to require all 25 cells to be called for a win.

## Architecture

All app state lives in a single hook (`src/hooks/useGameState.ts`). Components are purely presentational and receive state and callbacks as props.

```
App.tsx                   # root layout; derives winsMap via useMemo
├── useGameState.ts       # GameState + all mutations + localStorage sync
├── CallerPanel.tsx       # number input, call history, round controls
├── CardUploader.tsx      # file/drag-drop → OCR pipeline
│    └── CardEditor.tsx   # review/correct OCR results before saving
└── BingoCardGrid.tsx     # read-only card display + win highlighting
```

Win detection is never stored in state — `detectWins()` runs inside `useMemo` on every render.

## OCR Pipeline

Each card image goes through a multi-pass process:

1. **Preprocess** — scale up small images, convert to greyscale, boost contrast.
2. **Anchor detection** — locate the B I N G O header letters to establish column boundaries.
3. **Per-cell OCR** (PSM 8) — crop and read each of the 24 non-FREE cells individually using a digit-only character whitelist.
4. **Spatial fallback** — if per-cell fails, parse all words using their bounding-box positions.
5. **Text fallback** — last resort using raw OCR text lines when spatial data is unavailable.

## BINGO Column Ranges

| Column | Range |
|---|---|
| B | 1–15 |
| I | 16–30 |
| N | 31–45 |
| G | 46–60 |
| O | 61–75 |

The centre cell (N3) is always the FREE space — `numbers[2][2] === 0`, `markedCells[2][2] === true`.

## License

&copy; 2026 Kiran Gade (KG). All rights reserved.
