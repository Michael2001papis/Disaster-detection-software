/**
 * Earth intro → split radar UI. Six numbered asteroids, speed limiter + per-body speeds,
 * self-destruct-style variable velocity, surface impact modal, fallout zones, combinable modes.
 * Each track gets a random provisional designation; designations are unique per browser and never reused.
 */

const HACHAL_SESSION_KEY = 'hachal-system-session'
const HACHAL_ACCESS_CODE = '102030'

/** Issued NEO-style designations — persisted so the same string never appears twice for this profile. */
const USED_DESIGNATIONS_KEY = 'hachal-neo-designations'
const DESIGNATION_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

const TRACK_LIGHT_STORAGE_KEY = 'hachal-track-lights'

/** Per-track display “light” (radar blip, label, corridor line, table marker). */
interface TrackLightPreset {
  id: number
  name: string
  fill: string
  stroke: string
  glow: string
  badgeBg: string
  badgeFg: string
  badgeStroke: string
}

/** Display lights: black / green / gray / red / blue only (blue for range tracks; Earth keeps its own gradient). */
const TRACK_LIGHT_PRESETS: readonly TrackLightPreset[] = [
  {
    id: 0,
    name: 'Green',
    fill: 'rgba(34, 197, 94, 0.92)',
    stroke: 'rgba(21, 128, 61, 1)',
    glow: 'rgba(34, 197, 94, 0.42)',
    badgeBg: 'rgba(6, 40, 22, 0.94)',
    badgeFg: '#d1fae5',
    badgeStroke: 'rgba(34, 197, 94, 0.72)',
  },
  {
    id: 1,
    name: 'Forest',
    fill: 'rgba(22, 101, 52, 0.95)',
    stroke: 'rgba(20, 83, 45, 1)',
    glow: 'rgba(34, 197, 94, 0.28)',
    badgeBg: 'rgba(5, 24, 14, 0.94)',
    badgeFg: '#bbf7d0',
    badgeStroke: 'rgba(22, 101, 52, 0.82)',
  },
  {
    id: 2,
    name: 'Range blue',
    fill: 'rgba(59, 130, 246, 0.9)',
    stroke: 'rgba(29, 78, 216, 1)',
    glow: 'rgba(59, 130, 246, 0.38)',
    badgeBg: 'rgba(15, 30, 60, 0.94)',
    badgeFg: '#dbeafe',
    badgeStroke: 'rgba(37, 99, 235, 0.72)',
  },
  {
    id: 3,
    name: 'Deep blue',
    fill: 'rgba(30, 64, 175, 0.92)',
    stroke: 'rgba(23, 37, 84, 1)',
    glow: 'rgba(59, 130, 246, 0.32)',
    badgeBg: 'rgba(10, 20, 45, 0.94)',
    badgeFg: '#e2e8f0',
    badgeStroke: 'rgba(30, 64, 175, 0.78)',
  },
  {
    id: 4,
    name: 'Alert red',
    fill: 'rgba(220, 38, 38, 0.9)',
    stroke: 'rgba(153, 27, 27, 1)',
    glow: 'rgba(220, 38, 38, 0.38)',
    badgeBg: 'rgba(50, 10, 10, 0.94)',
    badgeFg: '#fecaca',
    badgeStroke: 'rgba(248, 113, 113, 0.68)',
  },
  {
    id: 5,
    name: 'Crimson',
    fill: 'rgba(127, 29, 29, 0.92)',
    stroke: 'rgba(69, 10, 10, 1)',
    glow: 'rgba(185, 28, 28, 0.32)',
    badgeBg: 'rgba(30, 8, 8, 0.94)',
    badgeFg: '#fca5a5',
    badgeStroke: 'rgba(220, 38, 38, 0.78)',
  },
  {
    id: 6,
    name: 'Steel',
    fill: 'rgba(100, 116, 139, 0.92)',
    stroke: 'rgba(51, 65, 85, 1)',
    glow: 'rgba(148, 163, 184, 0.32)',
    badgeBg: 'rgba(15, 23, 42, 0.94)',
    badgeFg: '#e2e8f0',
    badgeStroke: 'rgba(100, 116, 139, 0.72)',
  },
  {
    id: 7,
    name: 'Slate',
    fill: 'rgba(71, 85, 105, 0.94)',
    stroke: 'rgba(30, 41, 59, 1)',
    glow: 'rgba(100, 116, 139, 0.26)',
    badgeBg: 'rgba(15, 23, 42, 0.94)',
    badgeFg: '#cbd5e1',
    badgeStroke: 'rgba(71, 85, 105, 0.78)',
  },
] as const

function getTrackLight(id: number): TrackLightPreset {
  const n = TRACK_LIGHT_PRESETS.length
  return TRACK_LIGHT_PRESETS[((id % n) + n) % n]!
}

function loadPersistedLightId(trackNum: number): number {
  try {
    const raw = sessionStorage.getItem(TRACK_LIGHT_STORAGE_KEY)
    if (!raw) return (trackNum - 1) % TRACK_LIGHT_PRESETS.length
    const m = JSON.parse(raw) as Record<string, number>
    const v = m[String(trackNum)]
    return typeof v === 'number' && v >= 0 && v < TRACK_LIGHT_PRESETS.length
      ? v
      : (trackNum - 1) % TRACK_LIGHT_PRESETS.length
  } catch {
    return (trackNum - 1) % TRACK_LIGHT_PRESETS.length
  }
}

function persistLightId(trackNum: number, lightId: number): void {
  try {
    const raw = sessionStorage.getItem(TRACK_LIGHT_STORAGE_KEY)
    const m: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    m[String(trackNum)] = lightId
    sessionStorage.setItem(TRACK_LIGHT_STORAGE_KEY, JSON.stringify(m))
  } catch {
    /* ignore quota / private mode */
  }
}

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
  /** Display light preset id (radar + UI) */
  lightId: number
  /** Meteorite vs asteroid by estimated size class */
  bodyClass: 'MET' | 'AST'
  /** Static offset modeling compositional / remnant magnetization (nT) */
  magneticBiasNT: number
}

interface ThreatRow {
  label: string
  speedKmS: number
  collisionLabel: string
  magneticNT: number
  lightId: number
  bodyClass: 'MET' | 'AST'
  equivDiameterM: number
  emVelSignature: string
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
  bodyClass: 'MET' | 'AST'
  equivDiameterM: number
  emVelSignature: string
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
/** Radar dot radius range (px); mapped to estimated physical size in UI. */
const AST_R_MIN = 4.15
const AST_R_MAX = 11.6
const METEORITE_R_THRESHOLD = 6.9
const CORRIDOR_CLEARANCE_PX = 16
/** Show collision alert when intercept is this soon (simulation seconds) but not yet surface contact. */
const COLLISION_ALERT_TTI_MAX_S = 14
const COLLISION_ALERT_TTI_MIN_S = 0.06
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
let lastUtcUiMs = 0

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

let lastCollisionAlertHtml = ''

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

let designationsCache: Set<string> | null = null
let designationsStorageBroken = false

function loadDesignationSet(): Set<string> {
  if (designationsCache) return designationsCache
  try {
    const raw = localStorage.getItem(USED_DESIGNATIONS_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as unknown
      if (Array.isArray(arr)) {
        designationsCache = new Set(arr.filter((x): x is string => typeof x === 'string'))
        return designationsCache
      }
    }
    designationsCache = new Set()
    return designationsCache
  } catch {
    designationsCache = new Set()
    designationsStorageBroken = true
    return designationsCache
  }
}

/** Drop cache so the next load re-reads storage (e.g. after another tab wrote). */
function invalidateDesignationCache(): void {
  designationsCache = null
}

function persistDesignationSet(used: Set<string>): void {
  if (designationsStorageBroken) return
  try {
    localStorage.setItem(USED_DESIGNATIONS_KEY, JSON.stringify([...used]))
  } catch {
    try {
      const trimmed = [...used].slice(-2500)
      localStorage.setItem(USED_DESIGNATIONS_KEY, JSON.stringify(trimmed))
      designationsCache = new Set(trimmed)
    } catch {
      designationsStorageBroken = true
    }
  }
}

function randomProvisionalDesignation(): string {
  const y = new Date().getUTCFullYear()
  const a = DESIGNATION_LETTERS[Math.floor(Math.random() * DESIGNATION_LETTERS.length)]!
  const b = DESIGNATION_LETTERS[Math.floor(Math.random() * DESIGNATION_LETTERS.length)]!
  const n = 1 + Math.floor(Math.random() * 999)
  return `${y}-${a}${b}${n}`
}

/**
 * Reserve `count` fresh designations (random, never before issued in this browser when storage works).
 */
function reserveUniqueDesignations(count: number): string[] {
  invalidateDesignationCache()
  const used = loadDesignationSet()
  const out: string[] = []
  for (let k = 0; k < count; k++) {
    let placed = false
    for (let attempt = 0; attempt < 120; attempt++) {
      const d = randomProvisionalDesignation()
      if (!used.has(d)) {
        used.add(d)
        out.push(d)
        placed = true
        break
      }
    }
    if (!placed) {
      let d = `${new Date().getUTCFullYear()}-ID${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 999)}`
      while (used.has(d)) d = `${d}X`
      used.add(d)
      out.push(d)
    }
  }
  persistDesignationSet(used)
  return out
}

function wrap(v: number, min: number, max: number): number {
  const w = max - min
  while (v < min) v += w
  while (v >= max) v -= w
  return v
}

function randomBodyGeometry(): { r: number; bodyClass: 'MET' | 'AST'; magneticBiasNT: number } {
  const r = rand(AST_R_MIN, AST_R_MAX)
  const bodyClass: 'MET' | 'AST' = r < METEORITE_R_THRESHOLD ? 'MET' : 'AST'
  const magneticBiasNT = rand(-3200, 3200)
  return { r, bodyClass, magneticBiasNT }
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
  const names = reserveUniqueDesignations(6)

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
    const { r, bodyClass, magneticBiasNT } = randomBodyGeometry()
    asteroids.push({
      num: i + 1,
      name: names[i]!,
      x,
      y,
      vx: (dx / len) * baseSpeed,
      vy: (dy / len) * baseSpeed,
      r,
      baseSpeed,
      destructPhase: rand(0, Math.PI * 2),
      fuse: 0,
      lightId: loadPersistedLightId(i + 1),
      bodyClass,
      magneticBiasNT,
    })
  }
  lastImpactOverlay = null
}

function magneticAlongPath(
  ax: number,
  ay: number,
  ex: number,
  ey: number,
  t: number,
  biasNT = 0,
): number {
  const dKm =
    (Math.hypot(ax - ex, ay - ey) / Math.max(logicalW, logicalH)) * 150_000_000
  const d = Math.max(dKm, 6_500)
  const dipole = B_SURFACE_NT * Math.pow(6_371 / d, 3)
  const coupling = 1 + 0.08 * Math.sin(t * 0.002 + ax * 0.01)
  return dipole * coupling + biasNT
}

function equivDiameterMFromRadarR(rPx: number): number {
  return Math.round(95 + rPx * 118)
}

function formatEmVelSignature(BnT: number, vKmS: number): string {
  const bDec = magical.precision ? 2 : 0
  const vDec = magical.precision ? 4 : 2
  return `M${BnT.toFixed(bDec)}·V${vKmS.toFixed(vDec)}`
}

function formatBodyClassLabel(c: 'MET' | 'AST'): string {
  return c === 'MET' ? 'Meteorite' : 'Asteroid'
}

/** Corridor gate radius in display plane (Earth + body + margin). */
function corridorGateRadiusPx(a: Asteroid): number {
  return EARTH_R + a.r + CORRIDOR_CLEARANCE_PX
}

/**
 * Smallest t > 0 such that |P + t v - E| = earthR + bodyR (2-D intercept), if any.
 * Times are in the same units as velocity (px per second → seconds).
 */
function timeToEarthImpact(
  px: number,
  py: number,
  vx: number,
  vy: number,
  ex: number,
  ey: number,
  earthR: number,
  bodyR: number,
): number | null {
  const R = earthR + bodyR
  const ox = px - ex
  const oy = py - ey
  const a = vx * vx + vy * vy
  if (a < 1e-8) return null
  const b = 2 * (ox * vx + oy * vy)
  const c = ox * ox + oy * oy - R * R
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  const t1 = (-b - s) / (2 * a)
  const t2 = (-b + s) / (2 * a)
  const roots = [t1, t2].filter((t) => t > COLLISION_ALERT_TTI_MIN_S)
  if (roots.length === 0) return null
  return Math.min(...roots)
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
  if (dist > corridorGateRadiusPx(a)) return null

  const speedPx = Math.sqrt(vv)
  const speedKmS = speedPx * KM_SCALE
  const dec = magical.precision ? 3 : 1
  const ang = (Math.atan2(cy - ey, cx - ex) * (180 / Math.PI) + 360) % 360
  const rAu = (dist / (logicalW * 0.45)) * 0.25 + 0.0001
  const collisionLabel = `ψ = ${ang.toFixed(dec)}°   ρ = ${rAu.toFixed(dec + 2)} AU`
  const magneticNT = magneticAlongPath(a.x, a.y, ex, ey, timeMs, a.magneticBiasNT)
  const equivDiameterM = equivDiameterMFromRadarR(a.r)
  const emVelSignature = formatEmVelSignature(magneticNT, speedKmS)

  return {
    label: `#${a.num} · ${a.name}`,
    speedKmS,
    collisionLabel,
    magneticNT,
    lightId: a.lightId,
    bodyClass: a.bodyClass,
    equivDiameterM,
    emVelSignature,
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
  const cls = formatBodyClassLabel(snapshot.bodyClass)
  text.innerHTML = `
    <strong>#${snapshot.num} ${escapeHtml(snapshot.name)}</strong> (${cls}, estimated Ø <span class="orbital-mono">${snapshot.equivDiameterM}</span> m,
    EM–V ID <span class="orbital-mono">${escapeHtml(snapshot.emVelSignature)}</span>) reached the surface at
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
    ctx.fillStyle = `rgba(226, 232, 240, ${s.o})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFalloutOnEarth(cx: number, cy: number, r: number, snap: ImpactSnapshot): void {
  const op = magical.falloutMap ? 1.15 : 1
  const colors = [
    `rgba(220, 38, 38, ${0.34 * op})`,
    `rgba(185, 28, 28, ${0.28 * op})`,
    `rgba(100, 116, 139, ${0.26 * op})`,
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
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.32)'
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
  const L = getTrackLight(a.lightId)

  if (!spacePhase) {
    ctx.fillStyle = '#6b7280'
    ctx.beginPath()
    ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 1.5
    ctx.stroke()
    return
  }

  ctx.save()
  ctx.shadowColor = L.glow
  ctx.shadowBlur = 14
  ctx.fillStyle = L.fill
  ctx.beginPath()
  ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = L.stroke
  ctx.lineWidth = 1.35
  ctx.beginPath()
  ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = L.badgeBg
  ctx.strokeStyle = L.badgeStroke
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
  ctx.fillStyle = L.badgeFg
  ctx.fillText(label, a.x, a.y - a.r - 7)
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

  ctx.fillStyle = 'rgba(59, 130, 246, 0.88)'
  ctx.font = `600 ${Math.max(13, w * 0.022)}px system-ui, Segoe UI, sans-serif`
  ctx.fillText('Click or tap anywhere to enter deep space', cx, h - 56)
}

function drawCorridorLine(ax: number, ay: number, ex: number, ey: number, lightId: number): void {
  const L = getTrackLight(lightId)
  ctx.save()
  ctx.globalAlpha = 0.78
  ctx.strokeStyle = L.stroke
  ctx.lineWidth = 2
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
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

  ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)'
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
  grd.addColorStop(0, 'rgba(34, 197, 94, 0.12)')
  grd.addColorStop(0.35, 'rgba(34, 197, 94, 0.035)')
  grd.addColorStop(1, 'rgba(34, 197, 94, 0)')
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
      drawCorridorLine(a.x, a.y, earthX, earthY, a.lightId)
    }
    drawAsteroid(a, true)
  }

  updateTable(threats, animT)
  updateFleetReadout(animT)
  updateCollisionAlertBanner(animT)
}

function updateTable(threats: ThreatRow[], animT: number): void {
  if (!tableBody) return

  if (threats.length === 0) {
    tableBody.innerHTML = `
      <tr class="orbital-table__empty">
        <td colspan="6">
          <div class="orbital-table__empty-inner">
            <span class="orbital-table__empty-title">No corridor occupancy</span>
            <span class="orbital-table__empty-detail">No track passes the Earth-fixed resistance-corridor gate at this update cycle.</span>
          </div>
        </td>
      </tr>`
  } else {
    const rows = threats
      .map(
        (t) => `
      <tr class="orbital-table__row">
        <td class="orbital-table__cell orbital-table__cell--designator orbital-mono orbital-table__cell--with-light">
          <span class="orbital-table-light" style="background:${escapeHtml(getTrackLight(t.lightId).fill)}" title="Track display light" aria-hidden="true"></span>
          <span class="orbital-table__designator-text">${escapeHtml(t.label)}</span>
        </td>
        <td class="orbital-table__cell orbital-table__cell--class">
          <span class="orbital-table__class-main">${t.bodyClass === 'MET' ? 'Meteorite' : 'Asteroid'}</span>
          <span class="orbital-table__class-sub orbital-mono">Ø<sub>est</sub> ${t.equivDiameterM} m</span>
        </td>
        <td class="orbital-table__cell orbital-table__cell--numeric orbital-mono">${formatSpeed(t.speedKmS)}</td>
        <td class="orbital-table__cell orbital-table__cell--geometry orbital-mono">${escapeHtml(t.collisionLabel)}</td>
        <td class="orbital-table__cell orbital-table__cell--numeric orbital-mono">${magical.precision ? t.magneticNT.toFixed(2) : t.magneticNT.toFixed(1)}</td>
        <td class="orbital-table__cell orbital-table__cell--sig orbital-mono">${escapeHtml(t.emVelSignature)}</td>
      </tr>`,
      )
      .join('')
    tableBody.innerHTML = rows
  }

  const utcEl = document.getElementById('orbital-sheet-utc')
  if (utcEl && animT - lastUtcUiMs >= 1000) {
    lastUtcUiMs = animT
    const d = new Date()
    utcEl.setAttribute('datetime', d.toISOString())
    utcEl.textContent = d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
  }

  if (phaseLine) {
    const prec = magical.precision ? 3 : 1
    phaseLine.textContent = `t=${(animT / 1000).toFixed(prec)}s · sim×${simTimeScale.toFixed(2)} · v̄cap ${velocityCapPx.toFixed(0)} px/s`
  }
}

function updateCollisionAlertBanner(animT: number): void {
  const el = document.getElementById('orbital-collision-alert')
  if (!el) return

  if (simulationPaused || phase !== 'space') {
    el.classList.add('orbital-collision-alert--hidden')
    el.setAttribute('hidden', '')
    el.innerHTML = ''
    lastCollisionAlertHtml = ''
    return
  }

  let best: {
    tti: number
    a: Asteroid
    speedKmS: number
    magneticNT: number
  } | null = null

  const vScale = simTimeScale
  for (const a of asteroids) {
    const tti = timeToEarthImpact(
      a.x,
      a.y,
      a.vx * vScale,
      a.vy * vScale,
      earthX,
      earthY,
      EARTH_R,
      a.r,
    )
    if (tti === null || tti > COLLISION_ALERT_TTI_MAX_S) continue
    const speedKmS = Math.hypot(a.vx, a.vy) * KM_SCALE
    const magneticNT = magneticAlongPath(a.x, a.y, earthX, earthY, animT, a.magneticBiasNT)
    if (!best || tti < best.tti) best = { tti, a, speedKmS, magneticNT }
  }

  if (!best) {
    el.classList.add('orbital-collision-alert--hidden')
    el.setAttribute('hidden', '')
    el.innerHTML = ''
    lastCollisionAlertHtml = ''
    return
  }

  const sig = formatEmVelSignature(best.magneticNT, best.speedKmS)
  const cls = formatBodyClassLabel(best.a.bodyClass)
  const dM = equivDiameterMFromRadarR(best.a.r)
  const ttiStr = best.tti.toFixed(magical.precision ? 2 : 1)
  const bPrec = magical.precision ? 2 : 1
  const html = `<span class="orbital-collision-alert__label">Earth collision alert</span> · Track <span class="orbital-mono">#${best.a.num}</span> <span class="orbital-mono">${escapeHtml(best.a.name)}</span> · ${cls} · Ø<sub>est</sub> <span class="orbital-mono">${dM}</span> m · TTI <span class="orbital-mono">≈${ttiStr}</span> s (wall, at current sim×) · <span class="orbital-mono">|v| ${formatSpeed(best.speedKmS)} km/s</span> · <span class="orbital-mono">|B| ${best.magneticNT.toFixed(bPrec)} nT</span> · EM–V ID <span class="orbital-mono">${escapeHtml(sig)}</span>`

  if (html !== lastCollisionAlertHtml) {
    el.innerHTML = html
    lastCollisionAlertHtml = html
  }
  el.classList.remove('orbital-collision-alert--hidden')
  el.removeAttribute('hidden')
}

function updateFleetReadout(animT: number): void {
  if (!fleetEl) return
  const lines = asteroids.map((a) => {
    const kms = Math.hypot(a.vx, a.vy) * KM_SCALE
    const fuseP = (a.fuse * 100).toFixed(magical.precision ? 1 : 0)
    const Bnow = magneticAlongPath(a.x, a.y, earthX, earthY, animT, a.magneticBiasNT)
    const sig = formatEmVelSignature(Bnow, kms)
    const cls = a.bodyClass === 'MET' ? 'MET' : 'AST'
    const diam = equivDiameterMFromRadarR(a.r)
    const swatches = TRACK_LIGHT_PRESETS.map((p) => {
      const active = a.lightId === p.id
      return `<button type="button" class="orbital-light-swatch${active ? ' is-active' : ''}" data-light-track="${a.num}" data-light-id="${p.id}" title="${escapeHtml(p.name)}" aria-label="${escapeHtml(p.name)}" aria-pressed="${active ? 'true' : 'false'}" style="--swatch-fill:${p.fill};--swatch-stroke:${p.stroke}"></button>`
    }).join('')
    return `<div class="orbital-fleet__row" data-track="${a.num}">
      <div class="orbital-fleet__lights" role="toolbar" aria-label="Display light · track ${a.num}">
        ${swatches}
      </div>
      <div class="orbital-fleet__metrics">
        <span class="orbital-mono">#${a.num}</span>
        <span class="orbital-fleet__name">${escapeHtml(a.name)}</span>
        <span class="orbital-mono">${formatSpeed(kms)} km/s</span>
        <span class="orbital-mono">fuse ${fuseP}%</span>
      </div>
      <div class="orbital-fleet__telemetry orbital-mono" aria-label="Class, estimated diameter, EM–velocity signature">${cls} · Ø~${diam} m · ${escapeHtml(sig)}</div>
    </div>`
  })
  fleetEl.innerHTML = lines.join('')
}

function onFleetLightPointer(e: Event): void {
  const t = (e.target as HTMLElement).closest('[data-light-track][data-light-id]')
  if (!t || !(t instanceof HTMLButtonElement)) return
  const num = Number(t.getAttribute('data-light-track'))
  const lid = Number(t.getAttribute('data-light-id'))
  if (!Number.isFinite(num) || !Number.isFinite(lid)) return
  if (lid < 0 || lid >= TRACK_LIGHT_PRESETS.length) return
  const a = asteroids.find((x) => x.num === num)
  if (!a) return
  a.lightId = lid
  persistLightId(num, lid)
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

function checkSurfaceImpact(animT: number): void {
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i]!
    const d = Math.hypot(a.x - earthX, a.y - earthY)
    if (d <= EARTH_R + a.r * 0.92) {
      const speedKmS = Math.hypot(a.vx, a.vy) * KM_SCALE
      const bearing = bearingToPoint(earthX, earthY, a.x, a.y)
      const variability = magical.chaosVelocity ? 5.5 : 2.8
      const { lat, lon } = strikeToLatLon(bearing, variability)
      const zones = buildFalloutZones(bearing, speedKmS)
      const magneticNT = magneticAlongPath(a.x, a.y, earthX, earthY, animT, a.magneticBiasNT)
      const snapshot: ImpactSnapshot = {
        num: a.num,
        name: a.name,
        speedKmS,
        latStr: lat,
        lonStr: lon,
        zones,
        bearingDeg: bearing,
        bodyClass: a.bodyClass,
        equivDiameterM: equivDiameterMFromRadarR(a.r),
        emVelSignature: formatEmVelSignature(magneticNT, speedKmS),
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
    checkSurfaceImpact(ts)
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
  const name = reserveUniqueDesignations(1)[0] ?? `OBJ-${num}`
  const { r, bodyClass, magneticBiasNT } = randomBodyGeometry()
  const neo: Asteroid = {
    num,
    name,
    x,
    y,
    vx: (dx / len) * baseSpeed,
    vy: (dy / len) * baseSpeed,
    r,
    baseSpeed,
    destructPhase: rand(0, Math.PI * 2),
    fuse: 0,
    lightId: loadPersistedLightId(num),
    bodyClass,
    magneticBiasNT,
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
        <h1 class="hachal-gate__title">HACHAL System</h1>
        <p class="hachal-gate__sub">Enter access code to activate the console.</p>
        <form class="hachal-gate__form" id="hachal-login-form" autocomplete="off">
          <label class="hachal-gate__label" for="hachal-password">Access code</label>
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
          <button type="submit" class="hachal-gate__submit">Activate system</button>
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
    if (errEl) errEl.textContent = 'Invalid access code'
    input?.select()
  })
}

function mountApplication(root: HTMLElement): void {
  phase = 'intro'
  simulationPaused = false
  lastImpactOverlay = null
  lastCollisionAlertHtml = ''
  asteroids = []
  cancelAnimationFrame(raf)

  root.innerHTML = `
    <div class="orbital-root">
      <div class="orbital-workspace orbital-workspace--intro" id="orbital-workspace">
        <aside class="orbital-balloon orbital-balloon--hidden" aria-label="Intercept telemetry">
          <div class="orbital-balloon__tail" aria-hidden="true"></div>
          <div class="orbital-balloon__inner">
            <div class="orbital-balloon__header">
              <span class="orbital-balloon__badge">HACHAL · SSA console</span>
              <div class="orbital-balloon__header-actions">
                <button type="button" class="orbital-btn orbital-btn--radar" id="orbital-restart">Restart</button>
                <button type="button" class="orbital-btn orbital-btn--signout" id="orbital-signout" title="Sign out">Sign out</button>
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
            <div
              id="orbital-collision-alert"
              class="orbital-collision-alert orbital-collision-alert--hidden"
              role="alert"
              aria-live="assertive"
              hidden
            ></div>
            <p class="orbital-fleet__legend">Track display light · radar blip, corridor line, table marker</p>
            <div class="orbital-fleet" id="orbital-fleet" aria-label="Fleet status and per-track lights"></div>
            <section class="orbital-data-sheet orbital-data-sheet--s3" aria-labelledby="orbital-sheet-title">
              <div class="orbital-data-sheet__ribbon" aria-hidden="true"></div>
              <header class="orbital-data-sheet__head">
                <div class="orbital-data-sheet__head-top">
                  <h2 class="orbital-data-sheet__title" id="orbital-sheet-title">
                    NEO corridor occupancy
                  </h2>
                  <span class="orbital-data-sheet__stamp" title="Live telemetry refresh">LIVE · REFRESH</span>
                </div>
                <p class="orbital-data-sheet__subtitle">
                  Earth-fixed gate · geocentric inertial (GCRS) · 2-D radar-plane projection
                </p>
                <div class="orbital-data-sheet__meta">
                  <time id="orbital-sheet-utc" class="orbital-data-sheet__utc orbital-mono" datetime=""
                    >— UTC</time
                  >
                  <span class="orbital-data-sheet__sep" aria-hidden="true">|</span>
                  <span class="orbital-data-sheet__frame">Units: SI · angles deg · ρ in AU</span>
                </div>
              </header>
              <div class="orbital-table-wrap">
                <table
                  class="orbital-table orbital-table--assessment"
                  aria-live="polite"
                  aria-describedby="orbital-sheet-title orbital-sheet-foot"
                >
                  <caption class="orbital-sr-only">
                    Near-Earth object tracks whose forward trajectories intersect the operational resistance corridor
                    about Earth. Columns: object identifier, meteorite or asteroid class with estimated diameter, speed
                    magnitude, corridor line-of-sight geometry, magnetic-field magnitude along the Earth–object path, and
                    a composite EM–velocity signature. Values are simulation outputs for operator training.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" class="orbital-th">
                        <abbr class="orbital-th__main" title="Object identifier">OBJ-ID</abbr>
                        <span class="orbital-th__sub">track · provisional designation</span>
                      </th>
                      <th scope="col" class="orbital-th">
                        <abbr class="orbital-th__main" title="Meteorite vs asteroid and estimated diameter">Class</abbr>
                        <span class="orbital-th__sub">body · Ø<sub>est</sub> (m)</span>
                      </th>
                      <th scope="col" class="orbital-th orbital-th--numeric">
                        <abbr class="orbital-th__main" title="Speed magnitude">|v|</abbr>
                        <span class="orbital-th__sub">km · s<sup>−1</sup> <span class="orbital-th__hint">(ISO 80000-3)</span></span>
                      </th>
                      <th scope="col" class="orbital-th">
                        <abbr class="orbital-th__main" title="Corridor geometry in the display plane">Corridor LOS</abbr>
                        <span class="orbital-th__sub">ψ azimuth · ρ range (AU)</span>
                      </th>
                      <th scope="col" class="orbital-th orbital-th--numeric">
                        <abbr class="orbital-th__main" title="Magnetic field magnitude along path">|B|</abbr>
                        <span class="orbital-th__sub">nT · dipole + bias</span>
                      </th>
                      <th scope="col" class="orbital-th orbital-th--sig">
                        <abbr class="orbital-th__main" title="Magnetic magnitude and speed composite key">EM–V ID</abbr>
                        <span class="orbital-th__sub">|B| (nT) · |v| (km/s)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody id="orbital-tbody"></tbody>
                  <tfoot>
                    <tr class="orbital-table__foot">
                      <td colspan="6" id="orbital-sheet-foot">
                        <span class="orbital-table__foot-line"
                          ><strong>Protocol</strong> · Simulated conjunction-style corridor filter with predictive Earth
                          intercept timing (display-plane geometry). Not a miss-distance or operational TCA solution. For
                          training / demonstration — not for operational hazard notification or public alert.</span
                        >
                      </td>
                    </tr>
                  </tfoot>
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

  fleetEl?.addEventListener('click', onFleetLightPointer)

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
