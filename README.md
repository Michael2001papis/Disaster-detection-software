# Disaster detection software · Orbital mission console

Static **SPA** (Vite + TypeScript): a **mission-control style** training shell for Earth-centered **NEO-style** surveillance — not operational planetary defense or public alerting.

**Product framing:** the UI presents the idea that *this system connects humanity to the advancement of space* — shared vigilance near Earth (detection, rehearsal, narrative) alongside exploration. See the in-app **Humanity safeguard — program vision** panel for the full statement.

---

## Flow

1. **HACHAL gate** — access code entry; **Sign in** stores an authenticated flag in `sessionStorage` for this tab. Wrong codes are counted; after **5** failures the gate **locks for 2 minutes** (same tab). **Log out** returns to the gate and does **not** reset lockout or failure history (so lockout cannot be bypassed by logging out). Optional production code: set **`VITE_HACHAL_ACCESS_CODE`** at build time; otherwise a fallback constant in `src/orbitalMonitor.ts` is used (still visible in browser sources — client-only UX gate, not real cryptography).
2. **Earth intro** — canvas; tap/click or **Enter / Space** to enter the field.
3. **Mission field** — six numbered tracks (**Track 1–6**); table shows **smaller vs larger object** by radar size (training labels, not weather meteors), radar canvas, telemetry sidebar:
   - **Training pace** — sim speed ×, top speed (velocity cap)  
   - **Simulation modifiers** — precision, fallout overlay on Earth, chaos surge, multi-band fallout  
   - **Status strip** — time / sim× / cap  
   - **Protect Earth — magnetospheric pulse** — always visible in mission mode; **L1 / L2 / L3** unlock when an Earth **collision-alert** window is active; synthetic deflection + **deflection intercept report** on success; sustained **magnetic shield** rings around Earth until the threat exits the alert window (plus celebration rings after a successful clear)  
   - **Fleet** — per-track display lights (persisted in `sessionStorage`)  
   - **Objects near Earth** — default table: track, size, speed, simple status (**OK / Watch / Priority**); **Extra decimal places** adds direction, mag field, and signature. Same table layout on phone and desktop; narrow screens may **scroll horizontally** inside the sheet.  
4. **Surface impact** — modal + optional fallout list; **Restart / Continue** per buttons.

**Persistence:** provisional designations (`localStorage`), track lights (`sessionStorage`), gate session + lockout/fail counters (`sessionStorage`).

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
| `src/main.ts` | Loads CSS, `bootstrapMissionSystem()` |
| `src/app/bootstrap.ts` | Builds `MissionSystemCore`, calls `mountOrbitalShell(core)` |
| `src/core/MissionSystemCore.ts` | Orchestrates detection spawn, tracking sub-steps, threat→protection→intelligence telemetry |
| `src/core/pipelineTypes.ts` | Shared pipeline types (`TrackingContext`, telemetry snapshots) |
| `src/orbitalMonitor.ts` | Gate, intro, canvas **view**, DOM, modals; receives core via `mountOrbitalShell` |
| `src/modules/detection/` | Six-track spawn + body geometry |
| `src/modules/tracking/` | Self-destruct velocity + position integration (sub-steps) |
| `src/modules/protection/` | Safety snapshot from primary threat |
| `src/modules/intelligence/` | In-memory event log (threat-window transitions) |
| `src/modules/threat/` | Threat / collision analysis |
| `src/style.css` | Global + orbital / HACHAL / responsive table |
| `vite.config.ts` | `base` from `VERCEL` |

---

## Limits (read before demoing)

- **2-D** display-plane simulation; not real **TCA** or miss distance.  
- **Magnetic pulses** and intercept reports are **training fiction**.  
- **No backend** — all logic runs in the browser.
