# Disaster detection software

Initial demo: a **Disaster Detection & Astronomical Monitoring** console built with [Vite](https://vite.dev/) and TypeScript.

## Requirements

- [Node.js](https://nodejs.org/) (current LTS recommended)

## Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `npm install`  | Install dependencies     |
| `npm run dev`  | Start dev server         |
| `npm run build`| Typecheck + production build |
| `npm run preview` | Preview production build |

## Demo query parameters

- `?mode=empty` — empty monitoring feed
- `?mode=error` — simulated load failure (with retry)

## Project layout

- `src/app.ts` — UI state, rendering, demo flow
- `src/types.ts` — shared types
- `src/data/sampleObjects.ts` — sample alert data
- `public/` — static assets (`favicon.svg`, `icons.svg`)
