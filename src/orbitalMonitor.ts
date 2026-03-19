/**
 * Three-stage flow: Earth intro → galactic view (6 asteroids) → live intercept table.
 * "Resistance corridor" = forward trajectory passes within danger distance of Earth.
 */

const ASTEROID_NAMES = [
  '2026-EV1',
  '2026-HX4',
  '2026-MK2',
  '2026-QB7',
  '2026-TY9',
  '2026-WZ3',
] as const

type Phase = 'intro' | 'space'

interface Asteroid {
  name: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

interface ThreatRow {
  name: string
  speedKmS: number
  collisionLabel: string
  magneticNT: number
}

interface Star {
  x: number
  y: number
  s: number
  o: number
}

let phase: Phase = 'intro'
let canvas: HTMLCanvasElement
let ctx: CanvasRenderingContext2D
let stars: Star[] = []
let asteroids: Asteroid[] = []
let earthX = 0
let earthY = 0
const EARTH_R = 28
const AST_R = 7
/** Corridor half-width: trajectory must pass this close to Earth center */
const CORRIDOR_R = EARTH_R + AST_R + 14
/** Display scale: px/s → km/s */
const KM_SCALE = 0.052
/** Earth dipole reference (nT) scaled for visualization */
const B_SURFACE_NT = 47_000
let lastTs = 0
let raf = 0
let tableBody: HTMLTableSectionElement | null = null
let phaseLine: HTMLElement | null = null
let appMountEl: HTMLElement | null = null
/** Logical size (matches drawing coords after DPR transform) */
let logicalW = 800
let logicalH = 600

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

function wrap(v: number, min: number, max: number): number {
  const w = max - min
  while (v < min) v += w
  while (v >= max) v -= w
  return v
}

function initStars(w: number, h: number): void {
  stars = []
  const n = Math.min(220, Math.floor((w * h) / 9000))
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      s: Math.random() * 1.8 + 0.3,
      o: Math.random() * 0.5 + 0.35,
    })
  }
}

function spawnAsteroids(w: number, h: number): void {
  asteroids = []
  const cx = w / 2
  const cy = h / 2
  const margin = 80

  for (let i = 0; i < 6; i++) {
    const edge = Math.floor(Math.random() * 4)
    let x = 0
    let y = 0
    if (edge === 0) {
      x = rand(margin, w - margin)
      y = margin
    } else if (edge === 1) {
      x = w - margin
      y = rand(margin, h - margin)
    } else if (edge === 2) {
      x = rand(margin, w - margin)
      y = h - margin
    } else {
      x = margin
      y = rand(margin, h - margin)
    }

    const tx = cx + rand(-120, 120)
    const ty = cy + rand(-120, 120)
    const dx = tx - x
    const dy = ty - y
    const len = Math.hypot(dx, dy) || 1
    const speed = rand(38, 95)
    asteroids.push({
      name: ASTEROID_NAMES[i]!,
      x,
      y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      r: AST_R,
    })
  }
}

function magneticAlongPath(ax: number, ay: number, ex: number, ey: number, t: number): number {
  const dKm =
    (Math.hypot(ax - ex, ay - ey) / Math.max(logicalW, logicalH)) * 150_000_000
  const d = Math.max(dKm, 6_500)
  const dipole = B_SURFACE_NT * Math.pow(6_371 / d, 3)
  const coupling = 1 + 0.08 * Math.sin(t * 0.002 + ax * 0.01)
  return dipole * coupling
}

function analyzeThreat(a: Asteroid, ex: number, ey: number, timeMs: number): ThreatRow | null {
  const vx = a.vx
  const vy = a.vy
  const vv = vx * vx + vy * vy
  if (vv < 1e-4) return null

  const wx = ex - a.x
  const wy = ey - a.y
  const t = (wx * vx + wy * vy) / vv
  if (t < 0) return null

  const cx = a.x + t * vx
  const cy = a.y + t * vy
  const dist = Math.hypot(ex - cx, ey - cy)
  if (dist > CORRIDOR_R) return null

  const speedPx = Math.sqrt(vv)
  const speedKmS = speedPx * KM_SCALE
  const ang = (Math.atan2(cy - ey, cx - ex) * (180 / Math.PI) + 360) % 360
  const rAu = (dist / (logicalW * 0.45)) * 0.25 + 0.0001
  const collisionLabel = `θ ${ang.toFixed(1)}° · intercept r ${rAu.toFixed(3)} AU`
  const magneticNT = magneticAlongPath(a.x, a.y, ex, ey, timeMs)

  return {
    name: a.name,
    speedKmS,
    collisionLabel,
    magneticNT,
  }
}

function drawStars(): void {
  for (const s of stars) {
    ctx.fillStyle = `rgba(230,240,255,${s.o})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawEarth(cx: number, cy: number, r: number, pulse: number): void {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r * 1.2)
  g.addColorStop(0, '#5eb3d4')
  g.addColorStop(0.35, '#2a6b8f')
  g.addColorStop(0.55, '#1d4d3a')
  g.addColorStop(0.72, '#2d6b4a')
  g.addColorStop(1, '#0a1f2e')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = `rgba(120, 200, 255, ${0.25 + pulse * 0.15})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, r + 4 + pulse * 6, 0, Math.PI * 2)
  ctx.stroke()
}

function drawAsteroid(a: Asteroid, spacePhase: boolean): void {
  ctx.fillStyle = spacePhase ? 'rgba(167, 243, 208, 0.95)' : '#6b7280'
  ctx.beginPath()
  ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = spacePhase ? 'rgba(16, 185, 129, 0.9)' : '#374151'
  ctx.lineWidth = spacePhase ? 1.25 : 1.5
  ctx.stroke()
}

function drawIntro(animT: number): void {
  const w = logicalW
  const h = logicalH
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#070b14')
  g.addColorStop(0.5, '#0c1224')
  g.addColorStop(1, '#050810')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  drawStars()

  const cx = w / 2
  const cy = h * 0.42
  const r = Math.min(w, h) * 0.14
  const pulse = (Math.sin(animT * 0.003) + 1) * 0.5
  drawEarth(cx, cy, r, pulse)

  ctx.fillStyle = 'rgba(248, 250, 252, 0.92)'
  ctx.font = `700 ${Math.max(22, w * 0.045)}px system-ui, Segoe UI, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('Earth — primary object', cx, cy + r + 48)

  ctx.fillStyle = 'rgba(148, 163, 184, 0.95)'
  ctx.font = `400 ${Math.max(14, w * 0.024)}px system-ui, Segoe UI, sans-serif`
  ctx.fillText('Galactic monitoring deploys after you continue', cx, cy + r + 78)

  ctx.fillStyle = 'rgba(96, 165, 250, 0.9)'
  ctx.font = `600 ${Math.max(13, w * 0.022)}px system-ui, Segoe UI, sans-serif`
  ctx.fillText('Click or tap anywhere to enter deep space', cx, h - 56)
}

function drawCorridorLine(ax: number, ay: number, ex: number, ey: number): void {
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.65)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawRadarGrille(cx: number, cy: number, radius: number, animT: number): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  g.addColorStop(0, 'rgba(6, 12, 10, 0.15)')
  g.addColorStop(0.85, 'rgba(6, 20, 14, 0.35)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(52, 211, 153, 0.22)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy, (radius * i) / 4, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.moveTo(cx - radius, cy)
  ctx.lineTo(cx + radius, cy)
  ctx.moveTo(cx, cy - radius)
  ctx.lineTo(cx, cy + radius)
  ctx.stroke()

  const sweep = (animT * 0.0012) % (Math.PI * 2)
  const grd = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius)
  grd.addColorStop(0, 'rgba(52, 211, 153, 0.14)')
  grd.addColorStop(0.35, 'rgba(52, 211, 153, 0.04)')
  grd.addColorStop(1, 'rgba(52, 211, 153, 0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, radius, sweep - 0.45, sweep + 0.02)
  ctx.closePath()
  ctx.fill()
}

function drawSpace(animT: number): void {
  const w = logicalW
  const h = logicalH
  ctx.fillStyle = '#040a08'
  ctx.fillRect(0, 0, w, h)
  drawStars()

  earthX = w / 2
  earthY = h / 2
  const radarR = Math.min(w, h) / 2 - 6
  drawRadarGrille(earthX, earthY, radarR, animT)

  drawEarth(earthX, earthY, EARTH_R, (Math.sin(animT * 0.002) + 1) * 0.5)

  const threats: ThreatRow[] = []
  for (const a of asteroids) {
    const row = analyzeThreat(a, earthX, earthY, animT)
    if (row) {
      threats.push(row)
      drawCorridorLine(a.x, a.y, earthX, earthY)
    }
    drawAsteroid(a, true)
  }

  updateTable(threats, animT)
}

function updateTable(threats: ThreatRow[], animT: number): void {
  if (!tableBody) return

  if (threats.length === 0) {
    tableBody.innerHTML = `
      <tr class="orbital-table__empty">
        <td colspan="4">No asteroid in the Earth resistance corridor</td>
      </tr>`
    return
  }

  const rows = threats
    .map(
      (t) => `
      <tr>
        <td class="orbital-mono">${escapeHtml(t.name)}</td>
        <td class="orbital-mono">${t.speedKmS.toFixed(2)}</td>
        <td>${escapeHtml(t.collisionLabel)}</td>
        <td class="orbital-mono">${t.magneticNT.toFixed(1)}</td>
      </tr>`,
    )
    .join('')
  tableBody.innerHTML = rows

  if (phaseLine) {
    phaseLine.textContent = `Live · corridor scan · ${(animT / 1000).toFixed(1)} s mission time`
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function step(ts: number): void {
  if (!lastTs) lastTs = ts
  const dt = Math.min((ts - lastTs) / 1000, 0.05)
  lastTs = ts

  if (phase === 'space') {
    const w = logicalW
    const h = logicalH
    for (const a of asteroids) {
      a.x += a.vx * dt
      a.y += a.vy * dt
      a.x = wrap(a.x, -40, w + 40)
      a.y = wrap(a.y, -40, h + 40)
    }
  }

  ctx.clearRect(0, 0, logicalW, logicalH)
  if (phase === 'intro') {
    drawIntro(ts)
  } else {
    drawSpace(ts)
  }

  raf = requestAnimationFrame(step)
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(320, rect.width)
  const h = Math.max(400, rect.height)
  logicalW = w
  logicalH = h
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  initStars(w, h)
  if (phase === 'space') {
    earthX = w / 2
    earthY = h / 2
  }
}

function goSpace(): void {
  phase = 'space'
  appMountEl?.classList.add('orbital-app--space')
  document.getElementById('orbital-workspace')?.classList.remove('orbital-workspace--intro')
  document.getElementById('orbital-workspace')?.classList.add('orbital-workspace--split')
  resize()
  spawnAsteroids(logicalW, logicalH)
  if (phaseLine) phaseLine.textContent = 'Galactic field · 6 objects · Earth-centered'
  document.querySelector('.orbital-balloon')?.classList.remove('orbital-balloon--hidden')
}

function restart(): void {
  if (phase !== 'space') return
  spawnAsteroids(logicalW, logicalH)
  lastTs = 0
}

function mount(root: HTMLElement): void {
  appMountEl = root
  root.classList.add('orbital-app')
  root.innerHTML = `
    <div class="orbital-root">
      <div class="orbital-workspace orbital-workspace--intro" id="orbital-workspace">
        <aside class="orbital-balloon orbital-balloon--hidden" aria-label="Intercept telemetry">
          <div class="orbital-balloon__tail" aria-hidden="true"></div>
          <div class="orbital-balloon__inner">
            <div class="orbital-balloon__header">
              <span class="orbital-balloon__badge">TELEMETRY</span>
              <button type="button" class="orbital-btn orbital-btn--radar" id="orbital-restart">Restart</button>
            </div>
            <p class="orbital-phase" id="orbital-phase">Galactic field · 6 objects · Earth-centered</p>
            <div class="orbital-table-wrap">
              <table class="orbital-table" aria-live="polite">
                <caption class="orbital-caption">Resistance corridor vs Earth</caption>
                <thead>
                  <tr>
                    <th scope="col">Object</th>
                    <th scope="col">v (km/s)</th>
                    <th scope="col">Corridor</th>
                    <th scope="col">B (nT)</th>
                  </tr>
                </thead>
                <tbody id="orbital-tbody"></tbody>
              </table>
            </div>
          </div>
        </aside>
        <div class="orbital-radar-panel">
          <div class="orbital-radar-bezel">
            <span class="orbital-radar-label" aria-hidden="true">RADAR</span>
            <canvas class="orbital-canvas" aria-label="Radar scope"></canvas>
          </div>
        </div>
      </div>
    </div>
  `

  canvas = root.querySelector<HTMLCanvasElement>('.orbital-canvas')!
  const c = canvas.getContext('2d')
  if (!c) return
  ctx = c

  tableBody = root.querySelector('#orbital-tbody')
  phaseLine = root.querySelector('#orbital-phase')

  root.querySelector('#orbital-restart')?.addEventListener('click', () => restart())

  canvas.addEventListener('click', () => {
    if (phase === 'intro') goSpace()
  })

  window.addEventListener('keydown', (e) => {
    if (phase === 'intro' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      goSpace()
    }
  })

  const ro = new ResizeObserver(() => resize())
  ro.observe(root.querySelector('.orbital-radar-bezel') ?? root)
  resize()

  lastTs = 0
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(step)
}

export function startOrbitalMonitor(): void {
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) return
  mount(app)
}
