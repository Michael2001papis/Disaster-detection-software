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

## Build for USB or offline copy (static site)

This project is a **static web app**. After a production build, only the output folder is needed to run it—no `node_modules`, no `src/`, no `package.json` on the USB.

### Step 1 — Build

```bash
npm run build
```

Vite writes the site to **`dist/`** (Create React App would use `build/` instead).

### Step 2 — What to copy

**Copy everything inside `dist/`** — you can place those files at the **root of a USB stick** (no extra folder required).

**Do not** copy `src/`, `node_modules/`, or `package.json` for a simple offline handoff; they are not needed to view the built site.

### Step 3 — How to open it

- Try opening **`index.html`** (double-click may work depending on the browser).
- If scripts or styles fail to load (common with `file://` and browser security rules), **drag `index.html` into a browser window** or use a tiny local static server.
- For demos and grading (**recommended**): deploy the same `dist` output to **[Vercel](https://vercel.com/)** (or similar). You get a stable URL, no `file://` quirks, and it behaves like a normal website.

This repo’s Vite config uses **`base: './'`** so asset paths stay **relative**, which improves compatibility when opening the built files from disk or a USB path.

## Demo query parameters

- `?mode=empty` — empty monitoring feed
- `?mode=error` — simulated load failure (with retry)

## Project layout

- `src/app.ts` — UI state, rendering, demo flow
- `src/types.ts` — shared types
- `src/data/sampleObjects.ts` — sample alert data
- `public/` — static assets (`favicon.svg`, `icons.svg`)
