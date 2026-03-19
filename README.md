# Disaster detection software · Orbital mission console

Static **SPA** (Vite + TypeScript): a **mission-control style** training shell for Earth-centered **NEO-style** surveillance — not operational planetary defense or public alerting.

**Product framing:** the UI presents the idea that *this system connects humanity to the advancement of space* — shared vigilance near Earth (detection, rehearsal, narrative) alongside exploration. See the in-app **Humanity safeguard — program vision** panel for the full statement.

**Detailed status (features, limits, Hebrew notes):** [`STATUS_REPORT.txt`](./STATUS_REPORT.txt).

---

## Flow

1. **HACHAL gate** — access code entry; session remembered in `sessionStorage` until the tab closes, **Sign out**, or site data cleared. Demo code value is documented in `STATUS_REPORT.txt` (constant `HACHAL_ACCESS_CODE` in `src/orbitalMonitor.ts`).
2. **Earth intro** — canvas; tap/click or **Enter / Space** to enter the field.
3. **Mission field** — six tracks (MET/AST by size class), radar canvas, telemetry sidebar:
   - **Simulation control** — sim rate ×, velocity cap  
   - **Simulation modifiers** — precision, fallout overlay on Earth, chaos surge, multi-band fallout  
   - **Status strip** — time / sim× / cap  
   - **Protect Earth — magnetospheric pulse** — always visible in mission mode; **L1 / L2 / L3** unlock when an Earth **collision-alert** window is active; synthetic deflection + **deflection intercept report** on success; sustained **magnetic shield** rings around Earth until the threat exits the alert window (plus celebration rings after a successful clear)  
   - **Fleet** — per-track display lights (persisted in `sessionStorage`)  
   - **NEO corridor occupancy** — live table (class, |v|, corridor LOS, |B|, EM–V); **card layout on narrow viewports** (no horizontal scroll) for phones (~Galaxy S22+ target)  
4. **Surface impact** — modal + optional fallout list; **Restart / Continue** per buttons.

**Persistence:** provisional designations (`localStorage`), track lights (`sessionStorage`), gate session (`sessionStorage`).

---

## Requirements

- [Node.js](https://nodejs.org/) **20.19+** or **22.12+** (Vite 8 — see `.nvmrc`)

## Scripts

| Command | Description |
| -------- | ----------- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server |
| `npm run build` | Production build (Vercel uses this) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:usb` | Build with **relative** `./` base for USB / `file://` |
| `npm run preview` | Preview `dist/` |

## Vercel

`vite.config.ts` uses **`base: '/'`** when `VERCEL` is set. `vercel.json` → `outputDirectory: dist`. Use Node **20.x+** on the project.

## USB / offline

```bash
npm run build:usb
```

Copy contents of **`dist/`** only. Prefer hosting `dist` on HTTPS for consistent behavior vs `file://`.

---

## Project layout

| Path | Role |
|------|------|
| `index.html` | Entry, fonts, theme-color, meta description |
| `src/main.ts` | Loads CSS, starts monitor |
| `src/orbitalMonitor.ts` | Gate, intro, canvas sim, UI, modals, waves, table |
| `src/style.css` | Global + orbital / HACHAL / responsive table |
| `vite.config.ts` | `base` from `VERCEL` |
| `STATUS_REPORT.txt` | Long-form software status (Hebrew + technical detail) |

**Legacy (not mounted by default):** `src/app.ts`, `src/types.ts`, `src/data/sampleObjects.ts`.

---

## Limits (read before demoing)

- **2-D** display-plane simulation; not real **TCA** or miss distance.  
- **Magnetic pulses** and intercept reports are **training fiction**.  
- **No backend** — all logic runs in the browser.
