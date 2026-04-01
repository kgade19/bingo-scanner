# Bingo Scanner — Copilot Instructions

Mobile-friendly PWA for tracking physical bingo cards digitally. Players scan cards with OCR (Tesseract.js), call numbers, and wins are detected in real-time.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · tesseract.js 7 · uuid · vite-plugin-pwa  
No backend. No routing. No test framework.

## Build & Dev

```sh
npm run dev       # Vite dev server with HMR
npm run build     # tsc -b && vite build  (type-check + bundle)
npm run lint      # eslint .
npm run preview   # serve production build locally
```

## Architecture

All client state lives in a **single hook** — `src/hooks/useGameState.ts`. Components are purely presentational; they receive state and callbacks as props. Do not introduce React Context or an external state library.

```
App.tsx              # root layout; computes winsMap via useMemo
├── useGameState.ts  # entire GameState + all mutations + localStorage sync
├── CallerPanel.tsx  # number input, history, round controls, blackout toggle
├── CardUploader.tsx # file/drag-drop → OCR → opens CardEditor modal
│    └── CardEditor.tsx   # review/correct OCR results before saving
└── BingoCardGrid.tsx     # read-only card display + win highlighting
```

Win detection is **never stored in state** — `detectWins()` is called inside `useMemo` in `App.tsx` on every render.

## Key Conventions

**FREE cell:** `numbers[2][2] === 0` and `markedCells[2][2] === true` always. Enforce this in any code that initializes or clears a card. Use `makeInitialMarkedCells()` from `src/utils/ocrParser.ts` when creating a fresh `markedCells` grid.

**BINGO column ranges:** B=1–15, I=16–30, N=31–45, G=46–60, O=61–75. Validated in `ocrParser.ts` (warning) and `CardEditor.tsx` (blocking). Any new feature that accepts or stores card numbers must also respect these ranges.

**Immutable state updates:** Every mutation in `useGameState` creates new arrays/objects and spreads rows before mutation. Follow the same pattern.

**Two-step destructive actions:** Destructive UI actions (e.g. "Delete All Cards") require a confirmation click before executing. Always apply this pattern to new destructive actions.

**object URL lifecycle:** `URL.createObjectURL()` results must be revoked after use (`URL.revokeObjectURL()`). See `CardUploader.tsx` for the pattern.

## Types

Central types are in `src/types/index.ts`. Import with `import type`. The `WinResult.index` field is: row/col index (0–4), `0`/`1` for diag/anti-diag, `-1` for blackout.

## Tailwind CSS v4

Loaded via `@tailwindcss/vite` plugin — **not** via a PostCSS config. Do not add a `tailwind.config.js`.
