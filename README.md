# Disaster detection software

Interactive **Earth → galactic monitor** built with [Vite](https://vite.dev/) and TypeScript:

1. **Earth screen** — primary planet and short briefing; click/tap or press Enter to continue.  
2. **Galactic view** — six asteroids in continuous motion around a central Earth.  
3. **Intercept table** — when an asteroid’s forward path passes through the **resistance corridor** (near-Earth intercept tube), a row shows **speed (km/s)**, **collision / corridor geometry**, and **magnetic field (nT)** along the Earth–asteroid path. Use **Restart** to respawn all six bodies.

## Requirements

- [Node.js](https://nodejs.org/) **20.19+** or **22.12+** (required by Vite 8 — see `.nvmrc` for Vercel)

## Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `npm install`  | Install dependencies     |
| `npm run dev`  | Start dev server         |
| `npm run build`| Production build (Vite; used on Vercel) |
| `npm run typecheck` | TypeScript only (`tsc --noEmit`) |
| `npm run build:usb` | Same + **relative** asset paths for USB / `file://` |
| `npm run preview` | Preview production build |

## Vercel

The build uses **`base: '/'`** when the `VERCEL` env var is set (automatic on Vercel) so JS/CSS load correctly from `*.vercel.app`. **`vercel.json`** sets `outputDirectory` to `dist`.

In the Vercel project, set **Node.js** to **20.x** (or newer) if builds fail on an older runtime.

## Build for USB or offline copy (static site)

This project is a **static web app**. After a production build, only the output folder is needed to run it—no `node_modules`, no `src/`, no `package.json` on the USB.

### Step 1 — Build

For **USB / offline** (relative paths):

```bash
npm run build:usb
```

For **Vercel** or normal hosting from domain root, use `npm run build` (or let Vercel run it).

Vite writes the site to **`dist/`** (Create React App would use `build/` instead).

### Step 2 — What to copy

**Copy everything inside `dist/`** — you can place those files at the **root of a USB stick** (no extra folder required).

**Do not** copy `src/`, `node_modules/`, or `package.json` for a simple offline handoff; they are not needed to view the built site.

### Step 3 — How to open it

- Try opening **`index.html`** (double-click may work depending on the browser).
- If scripts or styles fail to load (common with `file://` and browser security rules), **drag `index.html` into a browser window** or use a tiny local static server.
- For demos and grading (**recommended**): deploy the same `dist` output to **[Vercel](https://vercel.com/)** (or similar). You get a stable URL, no `file://` quirks, and it behaves like a normal website.

**`npm run build:usb`** (or any build without `VERCEL=1`) emits **relative** asset paths for disk/USB. Vercel builds use **`/`** automatically.

## Demo query parameters

- `?mode=empty` — empty monitoring feed
- `?mode=error` — simulated load failure (with retry)

## Project layout

- `src/orbitalMonitor.ts` — intro + canvas simulation + threat table + restart
- `src/main.ts` — app entry
- `src/app.ts` — earlier list-style demo (not mounted by default)
- `src/types.ts` — shared types (legacy demo)
- `src/data/sampleObjects.ts` — sample data (legacy demo)
- `public/` — static assets (`favicon.svg`, `icons.svg`)
