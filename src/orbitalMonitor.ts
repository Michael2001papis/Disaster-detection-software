/**
 * Earth intro → split radar UI. Six numbered asteroids, speed limiter + per-body speeds,
 * self-destruct-style variable velocity, surface impact modal, fallout zones, combinable modes.
 */

const HACHAL_SESSION_KEY = 'hachal-system-session'
const HACHAL_ACCESS_CODE = '102030'

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
  num: number
  name: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  /** Base cruise speed magnitude (px/s), unique per body */
  baseSpeed: number
  /** Phase for oscillating “self-destruct” surge */
  destructPhase: number
  /** 0→1 fuse ramp (amplifies surge) */
  fuse: number
}

interface ThreatRow {
  label: string
  speedKmS: number
  collisionLabel: string
  magneticNT: number
}

interface FalloutZone {
  label: string
  innerKm: number
  outerKm: number
  bearingDeg: number
  arcDeg: number
}

interface ImpactSnapshot {
  num: number
  name: string
  speedKmS: number
  latStr: string
  lonStr: string
  zones: FalloutZone[]
  bearingDeg: number
}

interface Star {
  x: number
  y: number
  s: number
  o: number
}

interface MagicalModes {
  precision: boolean
  falloutMap: boolean
  chaosVelocity: boolean
  multiZone: boolean
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
const CORRIDOR_R = EARTH_R + AST_R + 14
const KM_SCALE = 0.052
const B_SURFACE_NT = 47_000

let lastTs = 0
let raf = 0
let tableBody: HTMLTableSectionElement | null = null
let fleetEl: HTMLElement | null = null
let phaseLine: HTMLElement | null = null
let appMountEl: HTMLElement | null = null
let logicalW = 800
let logicalH = 600

/** Simulation time multiplier (speed limiter) */
let simTimeScale = 1
/** Hard cap on velocity magnitude (px/s) */
let velocityCapPx = 130
let simulationPaused = false
let magical: MagicalModes = {
  precision: false,
  falloutMap: false,
  chaosVelocity: false,
  multiZone: false,
}

/** Last surface impact for Earth overlay + modal copy */
let lastImpactOverlay: ImpactSnapshot | null = null

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
    const baseSpeed = rand(34, 102)
    asteroids.push({
      num: i + 1,
      name: ASTEROID_NAMES[i]!,
      x,
      y,
      vx: (dx / len) * baseSpeed,
      vy: (dy / len) * baseSpeed,
      r: AST_R,
      baseSpeed,
      destructPhase: rand(0, Math.PI * 2),
      fuse: 0,
    })
  }
  lastImpactOverlay = null
}

function magneticAlongPath(ax: number, ay: number, ex: number, ey: number, t: number): number {
  const dKm =
    (Math.hypot(ax - ex, ay - ey) / Math.max(logicalW, logicalH)) * 150_000_000
  const d = Math.max(dKm, 6_500)
  const dipole = B_SURFACE_NT * Math.pow(6_371 / d, 3)
  const coupling = 1 + 0.08 * Math.sin(t * 0.002 + ax * 0.01)
  return dipole * coupling
}

function formatSpeed(v: number): string {
  return magical.precision ? v.toFixed(4) : v.toFixed(2)
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
  const dec = magical.precision ? 3 : 1
  const ang = (Math.atan2(cy - ey, cx - ex) * (180 / Math.PI) + 360) % 360
  const rAu = (dist / (logicalW * 0.45)) * 0.25 + 0.0001
  const collisionLabel = `θ ${ang.toFixed(dec)}° · r ${rAu.toFixed(dec + 2)} AU`
  const magneticNT = magneticAlongPath(a.x, a.y, ex, ey, timeMs)

  return {
    label: `#${a.num} ${a.name}`,
    speedKmS,
    collisionLabel,
    magneticNT,
  }
}

/** Bearing (deg) from Earth center to point; 0 = east, 90 = south (canvas y+) */
function bearingToPoint(ex: number, ey: number, px: number, py: number): number {
  return (Math.atan2(py - ey, px - ex) * (180 / Math.PI) + 360) % 360
}

/** Fake lat/lon from strike bearing + variability */
function strikeToLatLon(bearingDeg: number, variability: number): { lat: string; lon: string } {
  const br = (bearingDeg * Math.PI) / 180
  const latN = 62 * Math.sin(br) + (Math.random() - 0.5) * variability
  const lonE = 179 * Math.cos(br * 1.07) + (Math.random() - 0.5) * variability
  const ns = latN >= 0 ? 'N' : 'S'
  const ew = lonE >= 0 ? 'E' : 'W'
  const p = magical.precision ? 4 : 2
  return {
    lat: `${Math.abs(latN).toFixed(p)}°${ns}`,
    lon: `${Math.abs(lonE).toFixed(p)}°${ew}`,
  }
}

function buildFalloutZones(bearingDeg: number, kinetic: number): FalloutZone[] {
  const arc = magical.precision ? 18 + rand(0, 14) : 22 + rand(0, 18)
  const wobble = () => (Math.random() - 0.5) * (magical.chaosVelocity ? 14 : 7)
  const k = 1 + kinetic / 80
  const z0: FalloutZone = {
    label: 'Thermal / fireball',
    innerKm: 0,
    outerKm: Math.max(40, 95 * k + wobble()),
    bearingDeg: bearingDeg + wobble() * 0.15,
    arcDeg: arc,
  }
  const z1: FalloutZone = {
    label: 'Blast & ejecta',
    innerKm: z0.outerKm,
    outerKm: z0.outerKm + (280 + 420 * k + wobble()),
    bearingDeg: bearingDeg + wobble() * 0.2,
    arcDeg: arc + 6,
  }
  const zones = [z0, z1]
  if (magical.multiZone) {
    zones.push({
      label: 'Radiation / ionospheric arc',
      innerKm: z1.outerKm,
      outerKm: z1.outerKm + (900 + 1800 * k + wobble() * 2),
      bearingDeg: bearingDeg + wobble() * 0.25,
      arcDeg: arc + 14,
    })
  }
  return zones
}

function openImpactModal(snapshot: ImpactSnapshot): void {
  simulationPaused = true
  lastImpactOverlay = snapshot
  const modal = document.getElementById('orbital-impact-modal')
  const text = document.getElementById('orbital-impact-summary')
  const list = document.getElementById('orbital-fallout-list')
  if (!modal || !text || !list) return

  const prec = magical.precision ? 4 : 2
  text.innerHTML = `
    <strong>#${snapshot.num} ${escapeHtml(snapshot.name)}</strong> reached the surface at
    <span class="orbital-mono">${escapeHtml(snapshot.latStr)}</span>,
    <span class="orbital-mono">${escapeHtml(snapshot.lonStr)}</span>
    (strike bearing <span class="orbital-mono">${snapshot.bearingDeg.toFixed(prec)}°</span>,
    speed <span class="orbital-mono">${formatSpeed(snapshot.speedKmS)} km/s</span>).
  `

  const rows = snapshot.zones
    .map(
      (z) => `
      <li>
        <strong>${escapeHtml(z.label)}</strong> —
        ${z.innerKm.toFixed(0)}–${z.outerKm.toFixed(0)} km ·
        θ ${z.bearingDeg.toFixed(prec)}° ± ${z.arcDeg.toFixed(0)}° arc
      </li>`,
    )
    .join('')
  list.innerHTML = `<p class="orbital-modal__zones-title">Fallout footprint (variable bands)</p><ul class="orbital-modal__zones">${rows}</ul>`

  modal.classList.remove('orbital-modal--hidden')
  document.getElementById('orbital-impact-continue')?.focus()
}

function closeImpactModal(): void {
  document.getElementById('orbital-impact-modal')?.classList.add('orbital-modal--hidden')
}

function drawStars(): void {
  for (const s of stars) {
    ctx.fillStyle = `rgba(230,240,255,${s.o})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFalloutOnEarth(cx: number, cy: number, r: number, snap: ImpactSnapshot): void {
  const op = magical.falloutMap ? 1.15 : 1
  const colors = [
    `rgba(251, 146, 60, ${0.38 * op})`,
    `rgba(239, 68, 68, ${0.3 * op})`,
    `rgba(168, 85, 247, ${0.26 * op})`,
  ]
  let i = 0
  for (const z of snap.zones) {
    const br = (z.bearingDeg * Math.PI) / 180
    const half = ((z.arcDeg / 2) * Math.PI) / 180
    ctx.fillStyle = colors[i % colors.length]!
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r * 0.98, br - half, br + half)
    ctx.closePath()
    ctx.fill()
    if (magical.falloutMap) {
      ctx.strokeStyle = 'rgba(254, 243, 199, 0.35)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    i++
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

  if (spacePhase) {
    ctx.fillStyle = 'rgba(6, 24, 18, 0.92)'
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)'
    ctx.lineWidth = 1
    const label = String(a.num)
    ctx.font = 'bold 11px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(label).width
    const bx = a.x - tw / 2 - 3
    const by = a.y - a.r - 14
    const bw = tw + 6
    const bh = 14
    const rad = 3
    ctx.beginPath()
    ctx.moveTo(bx + rad, by)
    ctx.lineTo(bx + bw - rad, by)
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rad)
    ctx.lineTo(bx + bw, by + bh - rad)
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rad, by + bh)
    ctx.lineTo(bx + rad, by + bh)
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rad)
    ctx.lineTo(bx, by + rad)
    ctx.quadraticCurveTo(bx, by, bx + rad, by)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#a7f3d0'
    ctx.fillText(label, a.x, a.y - a.r - 7)
  }
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

  if (lastImpactOverlay) {
    drawFalloutOnEarth(earthX, earthY, EARTH_R, lastImpactOverlay)
  }

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
  updateFleetReadout()
}

function updateTable(threats: ThreatRow[], animT: number): void {
  if (!tableBody) return

  if (threats.length === 0) {
    tableBody.innerHTML = `
      <tr class="orbital-table__empty">
        <td colspan="4">
          <div class="orbital-table__empty-inner">
            <span class="orbital-table__empty-title">No intercept condition</span>
            <span class="orbital-table__empty-detail">No track satisfies resistance-corridor criteria at this update.</span>
          </div>
        </td>
      </tr>`
  } else {
    const rows = threats
      .map(
        (t) => `
      <tr class="orbital-table__row">
        <td class="orbital-table__cell orbital-table__cell--designator orbital-mono">${escapeHtml(t.label)}</td>
        <td class="orbital-table__cell orbital-table__cell--numeric orbital-mono">${formatSpeed(t.speedKmS)}</td>
        <td class="orbital-table__cell orbital-table__cell--geometry">${escapeHtml(t.collisionLabel)}</td>
        <td class="orbital-table__cell orbital-table__cell--numeric orbital-mono">${magical.precision ? t.magneticNT.toFixed(2) : t.magneticNT.toFixed(1)}</td>
      </tr>`,
      )
      .join('')
    tableBody.innerHTML = rows
  }

  if (phaseLine) {
    const prec = magical.precision ? 3 : 1
    phaseLine.textContent = `t=${(animT / 1000).toFixed(prec)}s · sim×${simTimeScale.toFixed(2)} · v̄cap ${velocityCapPx.toFixed(0)} px/s`
  }
}

function updateFleetReadout(): void {
  if (!fleetEl) return
  const prec = magical.precision ? 3 : 1
  const lines = asteroids.map((a) => {
    const kms = Math.hypot(a.vx, a.vy) * KM_SCALE
    const fuseP = (a.fuse * 100).toFixed(magical.precision ? 1 : 0)
    return `<div class="orbital-fleet__row">
      <span class="orbital-mono">#${a.num}</span>
      <span>${escapeHtml(a.name)}</span>
      <span class="orbital-mono">${formatSpeed(kms)} km/s</span>
      <span class="orbital-mono">fuse ${fuseP}%</span>
    </div>`
  })
  fleetEl.innerHTML = lines.join('')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function applySelfDestructVelocity(a: Asteroid, dt: number): void {
  const chaos = magical.chaosVelocity ? 1.65 : 1
  a.destructPhase += dt * (2.1 * chaos)
  a.fuse = Math.min(1, a.fuse + dt * (0.014 + (magical.chaosVelocity ? 0.01 : 0)))
  const surge =
    1 +
    0.38 * Math.sin(a.destructPhase) * (0.55 + a.fuse) +
    0.42 * a.fuse * a.fuse * chaos
  let spd = a.baseSpeed * surge
  spd = Math.min(spd, velocityCapPx)
  const mag = Math.hypot(a.vx, a.vy) || 1
  a.vx = (a.vx / mag) * spd
  a.vy = (a.vy / mag) * spd
}

function checkSurfaceImpact(): void {
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i]!
    const d = Math.hypot(a.x - earthX, a.y - earthY)
    if (d <= EARTH_R + a.r * 0.92) {
      const speedKmS = Math.hypot(a.vx, a.vy) * KM_SCALE
      const bearing = bearingToPoint(earthX, earthY, a.x, a.y)
      const variability = magical.chaosVelocity ? 5.5 : 2.8
      const { lat, lon } = strikeToLatLon(bearing, variability)
      const zones = buildFalloutZones(bearing, speedKmS)
      const snapshot: ImpactSnapshot = {
        num: a.num,
        name: a.name,
        speedKmS,
        latStr: lat,
        lonStr: lon,
        zones,
        bearingDeg: bearing,
      }
      asteroids.splice(i, 1)
      openImpactModal(snapshot)
      return
    }
  }
}

function step(ts: number): void {
  if (!lastTs) lastTs = ts
  let dt = Math.min((ts - lastTs) / 1000, 0.05)
  lastTs = ts
  dt *= simTimeScale

  if (phase === 'space' && !simulationPaused) {
    const w = logicalW
    const h = logicalH
    for (const a of asteroids) {
      applySelfDestructVelocity(a, dt)
      a.x += a.vx * dt
      a.y += a.vy * dt
      a.x = wrap(a.x, -40, w + 40)
      a.y = wrap(a.y, -40, h + 40)
    }
    checkSurfaceImpact()
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
  simulationPaused = false
  closeImpactModal()
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
  simulationPaused = false
  closeImpactModal()
  spawnAsteroids(logicalW, logicalH)
  lastTs = 0
}

function respawnOneSlot(num: number): void {
  const w = logicalW
  const h = logicalH
  const cx = w / 2
  const cy = h / 2
  const margin = 80
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
  const baseSpeed = rand(34, 102)
  const idx = num - 1
  const name = ASTEROID_NAMES[idx] ?? `OBJ-${num}`
  const neo: Asteroid = {
    num,
    name,
    x,
    y,
    vx: (dx / len) * baseSpeed,
    vy: (dy / len) * baseSpeed,
    r: AST_R,
    baseSpeed,
    destructPhase: rand(0, Math.PI * 2),
    fuse: 0,
  }
  asteroids.push(neo)
  asteroids.sort((a, b) => a.num - b.num)
}

function readModeCheckboxes(): void {
  magical.precision = !!(document.getElementById('mode-precision') as HTMLInputElement)?.checked
  magical.falloutMap = !!(document.getElementById('mode-fallout') as HTMLInputElement)?.checked
  magical.chaosVelocity = !!(document.getElementById('mode-chaos') as HTMLInputElement)?.checked
  magical.multiZone = !!(document.getElementById('mode-multizone') as HTMLInputElement)?.checked
}

function showHachalGate(root: HTMLElement, onUnlocked: () => void): void {
  root.innerHTML = `
    <div class="hachal-gate">
      <div class="hachal-gate__panel">
        <p class="hachal-gate__eyebrow">Restricted · HACHAL</p>
        <h1 class="hachal-gate__title">מערכת חי״ל</h1>
        <p class="hachal-gate__title-en">HACHAL System</p>
        <p class="hachal-gate__sub">הזן קוד גישה להפעלת המערכת / Enter access code to activate</p>
        <form class="hachal-gate__form" id="hachal-login-form" autocomplete="off">
          <label class="hachal-gate__label" for="hachal-password">קוד גישה · Access code</label>
          <input
            id="hachal-password"
            name="hachal-password"
            type="password"
            class="hachal-gate__input"
            inputmode="numeric"
            maxlength="32"
            required
            aria-describedby="hachal-login-error"
          />
          <p id="hachal-login-error" class="hachal-gate__error" role="alert" aria-live="polite"></p>
          <button type="submit" class="hachal-gate__submit">הפעל מערכת · Activate</button>
        </form>
      </div>
    </div>
  `

  const form = root.querySelector<HTMLFormElement>('#hachal-login-form')
  const input = root.querySelector<HTMLInputElement>('#hachal-password')
  const errEl = root.querySelector<HTMLElement>('#hachal-login-error')
  input?.focus()

  form?.addEventListener('submit', (e) => {
    e.preventDefault()
    const val = input?.value.trim() ?? ''
    if (val === HACHAL_ACCESS_CODE) {
      if (errEl) errEl.textContent = ''
      onUnlocked()
      return
    }
    if (errEl) errEl.textContent = 'קוד שגוי · Invalid access code'
    input?.select()
  })
}

function mountApplication(root: HTMLElement): void {
  phase = 'intro'
  simulationPaused = false
  lastImpactOverlay = null
  asteroids = []
  cancelAnimationFrame(raf)

  root.innerHTML = `
    <div class="orbital-root">
      <div class="orbital-workspace orbital-workspace--intro" id="orbital-workspace">
        <aside class="orbital-balloon orbital-balloon--hidden" aria-label="Intercept telemetry">
          <div class="orbital-balloon__tail" aria-hidden="true"></div>
          <div class="orbital-balloon__inner">
            <div class="orbital-balloon__header">
              <span class="orbital-balloon__badge">חי״ל · HACHAL</span>
              <div class="orbital-balloon__header-actions">
                <button type="button" class="orbital-btn orbital-btn--radar" id="orbital-restart">Restart</button>
                <button type="button" class="orbital-btn orbital-btn--signout" id="orbital-signout" title="Sign out">יציאה</button>
              </div>
            </div>
            <div class="orbital-controls">
              <label class="orbital-control">
                <span>Sim speed ×</span>
                <input type="range" id="orbital-sim-scale" min="0.15" max="2" step="0.05" value="1" />
                <span class="orbital-mono" id="orbital-sim-scale-val">1.00</span>
              </label>
              <label class="orbital-control">
                <span>Velocity cap</span>
                <input type="range" id="orbital-vcap" min="55" max="175" step="1" value="130" />
                <span class="orbital-mono" id="orbital-vcap-val">130</span>
              </label>
            </div>
            <fieldset class="orbital-modes">
              <legend>Magical modes <span class="orbital-modes__hint">(combine freely)</span></legend>
              <label class="orbital-mode"><input type="checkbox" id="mode-precision" /> Precision readout</label>
              <label class="orbital-mode"><input type="checkbox" id="mode-fallout" /> Fallout map on Earth</label>
              <label class="orbital-mode"><input type="checkbox" id="mode-chaos" /> Chaos / self-destruct surge</label>
              <label class="orbital-mode"><input type="checkbox" id="mode-multizone" /> Multi-band fallout</label>
            </fieldset>
            <p class="orbital-phase" id="orbital-phase">Galactic field · 6 objects · Earth-centered</p>
            <div class="orbital-fleet" id="orbital-fleet" aria-label="Fleet speeds"></div>
            <section class="orbital-data-sheet" aria-labelledby="orbital-sheet-title">
              <header class="orbital-data-sheet__head">
                <div class="orbital-data-sheet__head-top">
                  <h2 class="orbital-data-sheet__title" id="orbital-sheet-title">Intercept assessment</h2>
                  <span class="orbital-data-sheet__stamp">LIVE</span>
                </div>
                <p class="orbital-data-sheet__subtitle">
                  Resistance corridor · Earth-centered frame · provisional kinematics
                </p>
              </header>
              <div class="orbital-table-wrap">
                <table
                  class="orbital-table orbital-table--assessment"
                  aria-live="polite"
                  aria-describedby="orbital-sheet-title"
                >
                  <caption class="orbital-sr-only">
                    Objects whose trajectories intersect the Earth resistance corridor; columns are designator,
                    scalar speed, corridor geometry, and magnetic field along the line of sight.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" class="orbital-th">
                        <span class="orbital-th__main">Designator</span>
                        <span class="orbital-th__sub">track · catalogue ID</span>
                      </th>
                      <th scope="col" class="orbital-th orbital-th--numeric">
                        <span class="orbital-th__main">Scalar speed</span>
                        <span class="orbital-th__sub">km · s<sup>−1</sup></span>
                      </th>
                      <th scope="col" class="orbital-th">
                        <span class="orbital-th__main">Corridor geometry</span>
                        <span class="orbital-th__sub">bearing θ · range ρ (AU)</span>
                      </th>
                      <th scope="col" class="orbital-th orbital-th--numeric">
                        <span class="orbital-th__main">B-field (path)</span>
                        <span class="orbital-th__sub">nanotesla</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody id="orbital-tbody"></tbody>
                </table>
              </div>
            </section>
          </div>
        </aside>
        <div class="orbital-radar-panel">
          <div class="orbital-radar-bezel">
            <span class="orbital-radar-label" aria-hidden="true">RADAR</span>
            <canvas class="orbital-canvas" aria-label="Radar scope"></canvas>
          </div>
        </div>
      </div>
      <div id="orbital-impact-modal" class="orbital-modal orbital-modal--hidden" role="dialog" aria-modal="true" aria-labelledby="orbital-impact-title">
        <div class="orbital-modal__panel">
          <h2 id="orbital-impact-title" class="orbital-modal__title">Surface impact</h2>
          <p class="orbital-modal__body" id="orbital-impact-summary"></p>
          <div id="orbital-fallout-list"></div>
          <div class="orbital-modal__actions">
            <button type="button" class="orbital-btn orbital-btn--primary" id="orbital-impact-continue">Continue system</button>
            <button type="button" class="orbital-btn orbital-btn--muted" id="orbital-impact-reset">Reset simulation</button>
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
  fleetEl = root.querySelector('#orbital-fleet')
  phaseLine = root.querySelector('#orbital-phase')

  root.querySelector('#orbital-restart')?.addEventListener('click', () => restart())

  root.querySelector('#orbital-signout')?.addEventListener('click', () => {
    sessionStorage.removeItem(HACHAL_SESSION_KEY)
    window.location.reload()
  })

  const simEl = root.querySelector<HTMLInputElement>('#orbital-sim-scale')
  const simVal = root.querySelector('#orbital-sim-scale-val')
  simEl?.addEventListener('input', () => {
    simTimeScale = Number(simEl.value)
    if (simVal) simVal.textContent = simTimeScale.toFixed(2)
  })

  const vcapEl = root.querySelector<HTMLInputElement>('#orbital-vcap')
  const vcapVal = root.querySelector('#orbital-vcap-val')
  vcapEl?.addEventListener('input', () => {
    velocityCapPx = Number(vcapEl.value)
    if (vcapVal) vcapVal.textContent = String(Math.round(velocityCapPx))
  })

  for (const id of ['mode-precision', 'mode-fallout', 'mode-chaos', 'mode-multizone']) {
    document.getElementById(id)?.addEventListener('change', readModeCheckboxes)
  }

  document.getElementById('orbital-impact-continue')?.addEventListener('click', () => {
    const n = lastImpactOverlay?.num
    closeImpactModal()
    simulationPaused = false
    if (n !== undefined) respawnOneSlot(n)
    lastImpactOverlay = null
  })

  document.getElementById('orbital-impact-reset')?.addEventListener('click', () => {
    closeImpactModal()
    restart()
  })

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

function mount(root: HTMLElement): void {
  appMountEl = root
  root.classList.add('orbital-app')

  if (sessionStorage.getItem(HACHAL_SESSION_KEY) === '1') {
    mountApplication(root)
    return
  }

  showHachalGate(root, () => {
    sessionStorage.setItem(HACHAL_SESSION_KEY, '1')
    mountApplication(root)
  })
}

export function startOrbitalMonitor(): void {
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) return
  mount(app)
}
