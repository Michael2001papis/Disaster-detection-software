/**
 * Earth intro → split radar UI. Six numbered asteroids, speed limiter + per-body speeds,
 * self-destruct-style variable velocity, surface impact modal, fallout zones, combinable modes.
 * Each track is numbered Track 1–6 on screen; an extra sim label (e.g. 2026-AB12) is unique per browser when storage works.
 */

import type {
  Asteroid,
  FalloutZone,
  ImpactSnapshot,
  MagicalModes,
  Phase,
  PrimaryEarthCollisionThreat,
  RescueReport,
  Star,
  ThreatRow,
  TrackLightPreset,
} from './types/domain'
import {
  B_SURFACE_NT,
  COLLISION_ALERT_TTI_MAX_S,
  COLLISION_ALERT_TTI_MIN_S,
  CORRIDOR_CLEARANCE_PX,
  EARTH_R,
  KM_SCALE,
  MAX_PHYS_SUBSTEP_S,
  TABLE_FLEET_DOM_MIN_MS,
  WAVE_DEFLECT_RAD,
} from './constants/simulation'
import type { AnalyzeThreatEnv } from './modules/threat/analyzeThreat'
import type { EarthThreatEnv } from './modules/threat/collisionThreat'
import {
  analyzeThreat,
  equivDiameterMFromRadarR,
  findPrimaryEarthCollisionThreat,
  formatEmVelSignature,
  magneticAlongPath,
  trajectoryClearedImmediateThreat,
} from './modules/threat'
import { rand } from './utils/random'
import { MissionSystemCore } from './core/MissionSystemCore'
import type { TrackingContext } from './core/pipelineTypes'
import { randomBodyGeometry } from './modules/detection'

type ActiveThreatSnapshot = PrimaryEarthCollisionThreat

let missionCore: MissionSystemCore | null = null

const HACHAL_SESSION_KEY = 'hachal-system-session'
/** Fallback when `VITE_HACHAL_ACCESS_CODE` is not set at build time. */
const HACHAL_ACCESS_CODE = '321321'
const HACHAL_FAIL_COUNT_KEY = 'hachal-auth-fail-count'
const HACHAL_LOCKOUT_UNTIL_KEY = 'hachal-auth-lockout-until'
const HACHAL_MAX_ATTEMPTS = 5
const HACHAL_LOCKOUT_MS = 120_000

function getExpectedAccessCode(): string {
  const fromEnv = import.meta.env.VITE_HACHAL_ACCESS_CODE
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim()
  }
  return HACHAL_ACCESS_CODE
}

function readHachalFailCount(): number {
  try {
    const v = sessionStorage.getItem(HACHAL_FAIL_COUNT_KEY)
    const n = v ? Number.parseInt(v, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeHachalFailCount(n: number): void {
  try {
    if (n <= 0) sessionStorage.removeItem(HACHAL_FAIL_COUNT_KEY)
    else sessionStorage.setItem(HACHAL_FAIL_COUNT_KEY, String(n))
  } catch {
    /* ignore */
  }
}

function readHachalLockoutUntil(): number {
  try {
    const v = sessionStorage.getItem(HACHAL_LOCKOUT_UNTIL_KEY)
    const n = v ? Number.parseInt(v, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeHachalLockoutUntil(ts: number): void {
  try {
    sessionStorage.setItem(HACHAL_LOCKOUT_UNTIL_KEY, String(ts))
  } catch {
    /* ignore */
  }
}

function clearHachalAuthPenalties(): void {
  try {
    sessionStorage.removeItem(HACHAL_FAIL_COUNT_KEY)
    sessionStorage.removeItem(HACHAL_LOCKOUT_UNTIL_KEY)
  } catch {
    /* ignore */
  }
}

function formatLockoutRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m <= 0) return `${s} second(s)`
  return `${m} min ${String(r).padStart(2, '0')} s`
}

let hachalGateTick: ReturnType<typeof setInterval> | null = null

function stopHachalGateTick(): void {
  if (hachalGateTick !== null) {
    clearInterval(hachalGateTick)
    hachalGateTick = null
  }
}

/** Onboarding: step-by-step tour; `skip` disables auto-launch; `rerun-next` shows tour once on next visit. */
const TUTORIAL_PREF_SKIP_KEY = 'hachal-tutorial-pref-skip'
const TUTORIAL_DONE_KEY = 'hachal-tutorial-completed'
const TUTORIAL_RERUN_NEXT_KEY = 'hachal-tutorial-rerun-next'

/** Issued NEO-style designations — persisted so the same string never appears twice for this profile. */
const USED_DESIGNATIONS_KEY = 'hachal-neo-designations'
const DESIGNATION_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

const TRACK_LIGHT_STORAGE_KEY = 'hachal-track-lights'

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

let phase: Phase = 'intro'
/** True while intro → mission handoff animation runs (blocks double triggers). */
let introHandoffActive = false
let canvas: HTMLCanvasElement
let ctx: CanvasRenderingContext2D
let stars: Star[] = []
let asteroids: Asteroid[] = []
let earthX = 0
let earthY = 0

let lastTs = 0
let raf = 0
let tableBody: HTMLTableSectionElement | null = null
let fleetEl: HTMLElement | null = null
let phaseLine: HTMLElement | null = null
let appMountEl: HTMLElement | null = null
let logicalW = 800
let logicalH = 600
let lastUtcUiMs = 0
let lastTableFleetDomMs = 0

function invalidateTelemetryDomSchedule(): void {
  lastTableFleetDomMs = 0
}

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

function getEarthThreatEnv(): EarthThreatEnv {
  return {
    earthR: EARTH_R,
    collisionAlertTtiMaxS: COLLISION_ALERT_TTI_MAX_S,
    collisionAlertTtiMinS: COLLISION_ALERT_TTI_MIN_S,
    kmScale: KM_SCALE,
    logicalW,
    logicalH,
    bSurfaceNT: B_SURFACE_NT,
  }
}

function getThreatTimingEnv(): Pick<EarthThreatEnv, 'earthR' | 'collisionAlertTtiMaxS' | 'collisionAlertTtiMinS'> {
  return {
    earthR: EARTH_R,
    collisionAlertTtiMaxS: COLLISION_ALERT_TTI_MAX_S,
    collisionAlertTtiMinS: COLLISION_ALERT_TTI_MIN_S,
  }
}

function getAnalyzeThreatEnv(): AnalyzeThreatEnv {
  return {
    logicalW,
    logicalH,
    precision: magical.precision,
    earthR: EARTH_R,
    corridorClearancePx: CORRIDOR_CLEARANCE_PX,
    kmScale: KM_SCALE,
    bSurfaceNT: B_SURFACE_NT,
  }
}

/** Last surface impact for Earth overlay + modal copy */
let lastImpactOverlay: ImpactSnapshot | null = null

let lastCollisionAlertText = ''
let lastEarthDefenseStandbyHtml = ''
/** Last animation time from draw loop (for wave actions between frames). */
let lastFrameAnimT = 0
/** Draw an Earth ring pulse until this animT (ms). */
let magneticWavePulseUntil = 0
/** Start time (anim ms) for the current outward burst — span = pulseUntil - burstStart */
let magneticWaveBurstStartAnimT = 0
let magneticWaveBurstSpanMs = 780
/** Sustained shield rings until this track leaves the collision-alert window (after a pulse that did not clear). */
let magneticWaveShieldTrackNum: number | null = null
/** After a successful deflection, keep shield-style rings until this anim time (ms). */
let magneticWaveCelebrationUntilAnimT = 0
/** When > 0, auto-clear `#orbital-wave-feedback` after this anim time (ms). */
let waveFeedbackClearAnimT = 0

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
  if (!missionCore) return
  const names = reserveUniqueDesignations(6)
  asteroids = missionCore.spawnSixTracks(w, h, names, loadPersistedLightId)
  missionCore.intelligence.reset()
  lastImpactOverlay = null
}

/** User-facing size band — avoids “meteorite” confusion (atmospheric vs radar-small). */
function formatBodyClassLabel(c: 'MET' | 'AST'): string {
  return c === 'MET' ? 'Smaller object' : 'Larger object'
}

/**
 * Magnetospheric pulse: rotate velocity in-plane to reduce Earth radial closing, preserving speed.
 */
function applyMagnetosphericWave(a: Asteroid, level: 1 | 2 | 3, ex: number, ey: number): void {
  const du = ex - a.x
  const dv = ey - a.y
  const d = Math.hypot(du, dv) || 1
  const uxd = du / d
  const uyd = dv / d
  const mag0 = Math.hypot(a.vx, a.vy) || 1
  const rot = WAVE_DEFLECT_RAD[level]
  let bestClosing = Infinity
  let bestC = 1
  let bestS = 0
  for (const r of [rot, -rot]) {
    const c = Math.cos(r)
    const s = Math.sin(r)
    const nvx = a.vx * c - a.vy * s
    const nvy = a.vx * s + a.vy * c
    const closing = nvx * uxd + nvy * uyd
    if (closing < bestClosing) {
      bestClosing = closing
      bestC = c
      bestS = s
    }
  }
  const vx0 = a.vx
  const vy0 = a.vy
  a.vx = vx0 * bestC - vy0 * bestS
  a.vy = vx0 * bestS + vy0 * bestC
  const mag1 = Math.hypot(a.vx, a.vy) || 1
  a.vx = (a.vx / mag1) * mag0
  a.vy = (a.vy / mag1) * mag0
  a.speedRelax = mag0
}

function formatSpeed(v: number): string {
  return magical.precision ? v.toFixed(4) : v.toFixed(2)
}

function tableColumnCount(): number {
  return magical.precision ? 6 : 4
}

/** Simple status for table rows — emphasizes speed / attention (not physics). */
function tableStatusForSpeed(speedKmS: number): { label: string; tone: 'calm' | 'watch' | 'hot' } {
  if (speedKmS >= 4.85) return { label: 'Priority', tone: 'hot' }
  if (speedKmS >= 3.55) return { label: 'Watch', tone: 'watch' }
  return { label: 'OK', tone: 'calm' }
}

function syncTableColumns(): void {
  const thead = document.getElementById('orbital-thead')
  const foot = document.getElementById('orbital-sheet-foot') as HTMLTableCellElement | null
  const tableWrap = document.getElementById('orbital-table-wrap')
  const sheet = document.getElementById('orbital-data-sheet')
  const cap = document.getElementById('orbital-table-caption')
  const tbl = document.querySelector('.orbital-table--assessment')
  if (!thead || !foot) return

  const n = tableColumnCount()
  foot.colSpan = n

  sheet?.classList.toggle('orbital-data-sheet--precision', magical.precision)
  tableWrap?.classList.toggle('orbital-table-wrap--detail', magical.precision)
  tbl?.classList.toggle('orbital-table--compact', !magical.precision)

  if (magical.precision) {
    thead.innerHTML = `
    <tr>
      <th scope="col" class="orbital-th" title="Which track (1–6) and its short label in this exercise.">
        <span class="orbital-th__main">Track</span>
        <span class="orbital-th__sub">number · label</span>
      </th>
      <th scope="col" class="orbital-th" title="Smaller or larger object by radar size in this demo, with an estimated width in meters.">
        <span class="orbital-th__main">Size</span>
        <span class="orbital-th__sub">smaller / larger · width est. (m)</span>
      </th>
      <th scope="col" class="orbital-th orbital-th--numeric">
        <abbr class="orbital-th__main" title="How fast the object moves in the simulation (kilometers per second).">Speed</abbr>
        <span class="orbital-th__sub">km/s</span>
      </th>
      <th scope="col" class="orbital-th">
        <abbr class="orbital-th__main" title="Direction and distance in the flat radar picture—training labels.">Direction</abbr>
        <span class="orbital-th__sub">bearing · distance (AU)</span>
      </th>
      <th scope="col" class="orbital-th orbital-th--numeric">
        <abbr class="orbital-th__main" title="Synthetic magnetic field strength along the path for this exercise (nanotesla).">Mag field</abbr>
        <span class="orbital-th__sub">nT</span>
      </th>
      <th scope="col" class="orbital-th orbital-th--sig">
        <abbr class="orbital-th__main" title="A short signature combining field and speed.">Signature</abbr>
        <span class="orbital-th__sub">field · speed id</span>
      </th>
    </tr>`
    if (cap) {
      cap.textContent =
        'Up to six practice tracks around Earth. Full table: track, size, speed, direction, synthetic magnetic field, and signature. Simulated only.'
    }
  } else {
    thead.innerHTML = `
    <tr>
      <th scope="col" class="orbital-th" title="Track number and short label.">
        <span class="orbital-th__main">Track</span>
        <span class="orbital-th__sub"># · label</span>
      </th>
      <th scope="col" class="orbital-th" title="Size band and estimated width in meters.">
        <span class="orbital-th__main">Size</span>
        <span class="orbital-th__sub">band · ~m</span>
      </th>
      <th scope="col" class="orbital-th orbital-th--numeric orbital-th--emph">
        <abbr class="orbital-th__main" title="Speed in the simulation (km/s).">Speed</abbr>
        <span class="orbital-th__sub">km/s</span>
      </th>
      <th scope="col" class="orbital-th orbital-th--emph">
        <span class="orbital-th__main">Status</span>
        <span class="orbital-th__sub">attention</span>
      </th>
    </tr>`
    if (cap) {
      cap.textContent =
        'Tracks near Earth in this exercise: track, size, speed, and a simple status. Turn on Extra decimal places for full technical columns.'
    }
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
    <strong>Track ${snapshot.num}</strong>
    <span class="orbital-mono">(${escapeHtml(snapshot.name)})</span>
    — ${cls}, estimated Ø <span class="orbital-mono">${snapshot.equivDiameterM}</span> m,
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

function pulseLevelPlain(level: 1 | 2 | 3): string {
  return level === 3 ? 'L3 (strong pulse)' : level === 2 ? 'L2 (medium pulse)' : 'L1 (gentle pulse)'
}

function pulseLevelLongLabel(level: 1 | 2 | 3): string {
  return level === 3 ? 'L3 — strong pulse' : level === 2 ? 'L2 — medium pulse' : 'L1 — gentle pulse'
}

function clearWaveFeedbackUi(): void {
  waveFeedbackClearAnimT = 0
  document.getElementById('orbital-wave-feedback')?.replaceChildren()
}

function openRescueModal(r: RescueReport): void {
  const modal = document.getElementById('orbital-rescue-modal')
  const body = document.getElementById('orbital-rescue-report-body')
  if (!modal || !body) return
  const lvlLabel =
    r.waveLevel === 3 ? 'Level 3 — strong' : r.waveLevel === 2 ? 'Level 2 — medium' : 'Level 1 — gentle'
  const lvlYou = pulseLevelPlain(r.waveLevel)
  const cls = formatBodyClassLabel(r.bodyClass)
  const bp = magical.precision ? 2 : 1
  const utcDisp = r.utcIso.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
  const ttiStr = r.ttiBeforeWallS.toFixed(magical.precision ? 2 : 1)
  const summaryPlain = magical.precision
    ? `<p class="orbital-rescue-plain__p"><strong>What changed</strong> · In this 2-D sim the pulse rotated the velocity toward the limb while keeping speed at <span class="orbital-mono">${formatSpeed(r.speedKmSAfter)} km/s</span>. Time to impact before the pulse was ≈<span class="orbital-mono">${ttiStr}</span>s (at your sim speed). Signature <span class="orbital-mono">${escapeHtml(r.sigBefore)}</span> → <span class="orbital-mono">${escapeHtml(r.sigAfter)}</span>.</p>`
    : `<p class="orbital-rescue-plain__p"><strong>What changed</strong> · The training pulse bent the path sideways; speed stayed <span class="orbital-mono">${formatSpeed(r.speedKmSAfter)} km/s</span>. Before the pulse, impact was ≈<span class="orbital-mono">${ttiStr}</span>s away at your current sim speed.</p>`

  body.innerHTML = `
    <div class="orbital-rescue-banner orbital-rescue-banner--success" role="status">
      <span class="orbital-rescue-banner__badge">Success</span>
      <p class="orbital-rescue-banner__lead">Earth collision-alert cleared for this track in the exercise.</p>
    </div>
    <div class="orbital-rescue-plain">
      <p class="orbital-rescue-plain__p"><strong>You</strong> · Fired <strong>${escapeHtml(lvlYou)}</strong> on <strong>Track ${r.num}</strong> <span class="orbital-mono">(${escapeHtml(r.name)})</span>.</p>
      ${summaryPlain}
    </div>
    <dl class="orbital-rescue-dl">
      <dt>Report time (UTC)</dt><dd class="orbital-mono">${escapeHtml(utcDisp)}</dd>
      <dt>Track</dt><dd><strong>Track ${r.num}</strong> · <span class="orbital-mono">${escapeHtml(r.name)}</span></dd>
      <dt>Class</dt><dd>${cls} · ~<span class="orbital-mono">${r.equivDiameterM}</span> m</dd>
      <dt>Pulse</dt><dd>${escapeHtml(lvlLabel)}</dd>
      <dt>Time to impact (before)</dt><dd class="orbital-mono">≈${ttiStr} s</dd>
      <dt>Signature (before → after)</dt><dd class="orbital-mono">${escapeHtml(r.sigBefore)} → ${escapeHtml(r.sigAfter)}</dd>
      <dt>Speed after</dt><dd class="orbital-mono">${formatSpeed(r.speedKmSAfter)} km/s</dd>
      <dt>Mag field after (model)</dt><dd class="orbital-mono">${r.magneticNTAfter.toFixed(bp)} nT</dd>
    </dl>
    <p class="orbital-rescue-outcome"><strong>Result</strong> · Training hazard for this approach is mitigated. Resume surveillance when you close this report.</p>
  `
  modal.classList.remove('orbital-modal--hidden')
  document.getElementById('orbital-rescue-dismiss')?.focus()
}

function closeRescueModal(): void {
  document.getElementById('orbital-rescue-modal')?.classList.add('orbital-modal--hidden')
}

function clearMagneticWaveShield(): void {
  magneticWaveShieldTrackNum = null
  magneticWaveCelebrationUntilAnimT = 0
}

function updateMagneticWaveShieldState(_animT: number): void {
  if (magneticWaveShieldTrackNum === null) return
  const a = asteroids.find((x) => x.num === magneticWaveShieldTrackNum)
  if (!a || trajectoryClearedImmediateThreat(a, earthX, earthY, simTimeScale, getThreatTimingEnv())) {
    magneticWaveShieldTrackNum = null
  }
}

function executeMagneticWavePulse(level: 1 | 2 | 3, threat: ActiveThreatSnapshot): void {
  const a = threat.a
  const ttiBefore = threat.tti
  const sigBefore = formatEmVelSignature(threat.magneticNT, threat.speedKmS, magical.precision)

  applyMagnetosphericWave(a, level, earthX, earthY)

  const speedAfter = Math.hypot(a.vx, a.vy) * KM_SCALE
  const Bafter = magneticAlongPath(
    a.x,
    a.y,
    earthX,
    earthY,
    lastFrameAnimT,
    logicalW,
    logicalH,
    a.magneticBiasNT,
    B_SURFACE_NT,
  )
  const sigAfter = formatEmVelSignature(Bafter, speedAfter, magical.precision)

  magneticWaveBurstStartAnimT = lastFrameAnimT
  lastCollisionAlertText = ''

  const fb = document.getElementById('orbital-wave-feedback')
  const youDid = escapeHtml(pulseLevelPlain(level))
  const tryHint =
    level < 3 ?
      'Try a <strong>stronger pulse (L3)</strong> while the buttons stay unlocked.'
    : 'Even <strong>L3</strong> was not enough for this geometry—the track is still inside the alert window. Keep watching; geometry may change.'

  if (trajectoryClearedImmediateThreat(a, earthX, earthY, simTimeScale, getThreatTimingEnv())) {
    magneticWaveBurstSpanMs = 2400
    magneticWavePulseUntil = lastFrameAnimT + magneticWaveBurstSpanMs
    magneticWaveCelebrationUntilAnimT = lastFrameAnimT + magneticWaveBurstSpanMs
    magneticWaveShieldTrackNum = null
    waveFeedbackClearAnimT = 0
    if (fb) fb.replaceChildren()
    const report: RescueReport = {
      utcIso: new Date().toISOString(),
      num: a.num,
      name: a.name,
      bodyClass: a.bodyClass,
      equivDiameterM: equivDiameterMFromRadarR(a.r),
      waveLevel: level,
      ttiBeforeWallS: ttiBefore,
      sigBefore,
      sigAfter,
      speedKmSAfter: speedAfter,
      magneticNTAfter: Bafter,
    }
    openRescueModal(report)
    simulationPaused = true
  } else {
    magneticWaveBurstSpanMs = 780
    magneticWavePulseUntil = lastFrameAnimT + magneticWaveBurstSpanMs
    magneticWaveShieldTrackNum = a.num
    waveFeedbackClearAnimT = lastFrameAnimT + 9000
    if (fb) {
      fb.innerHTML = `<div class="orbital-wave-feedback--result orbital-wave-feedback--failure" role="status">
        <p class="orbital-wave-feedback__verdict"><span class="orbital-wave-feedback__verdict-label">Result</span> · <strong>Not cleared</strong></p>
        <ul class="orbital-wave-feedback__facts">
          <li><span class="orbital-wave-feedback__fact-key">You</span> · Protect Earth <strong>${youDid}</strong> on <strong>Track ${a.num}</strong>.</li>
          <li><span class="orbital-wave-feedback__fact-key">What happened</span> · The path still crosses the collision-alert window in this training view—Earth remains at risk for this track.</li>
          <li><span class="orbital-wave-feedback__fact-key">Next</span> · ${tryHint}</li>
        </ul>
      </div>`
    }
  }
}

function deployMagneticWave(level: 1 | 2 | 3): void {
  if (simulationPaused || phase !== 'space') return
  const threat = findPrimaryEarthCollisionThreat(
    lastFrameAnimT,
    asteroids,
    earthX,
    earthY,
    simTimeScale,
    getEarthThreatEnv(),
  )
  if (!threat) return

  const panel = document.getElementById('orbital-earth-defense')
  const fb = document.getElementById('orbital-wave-feedback')
  panel?.setAttribute('aria-busy', 'true')
  waveFeedbackClearAnimT = 0

  if (fb) {
    fb.innerHTML = `<div class="orbital-wave-feedback--busy" role="status" aria-live="assertive">
      <span class="orbital-wave-feedback__phase">Now</span>
      <p class="orbital-wave-feedback__busy-text">Sending <strong>${escapeHtml(pulseLevelLongLabel(level))}</strong> toward <strong>Track ${threat.a.num}</strong>…</p>
    </div>`
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        executeMagneticWavePulse(level, threat)
      } finally {
        panel?.removeAttribute('aria-busy')
      }
    })
  })
}

function onMagneticWaveClick(e: Event): void {
  const btn = (e.target as HTMLElement).closest('[data-wave-level]')
  if (!btn || !(btn instanceof HTMLButtonElement)) return
  const lv = Number(btn.getAttribute('data-wave-level'))
  if (lv !== 1 && lv !== 2 && lv !== 3) return
  deployMagneticWave(lv as 1 | 2 | 3)
}

function drawStars(): void {
  for (const s of stars) {
    const cool = 0.72 + Math.sin(s.x * 0.01 + s.y * 0.01) * 0.08
    ctx.fillStyle = `rgba(${165 + cool * 40}, ${195 + cool * 35}, ${230}, ${s.o * 0.42})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.s * 0.92, 0, Math.PI * 2)
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
  const g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.36, r * 0.08, cx, cy, r * 1.15)
  g.addColorStop(0, '#6eb8d8')
  g.addColorStop(0.28, '#3a7a9e')
  g.addColorStop(0.5, '#1e4a5c')
  g.addColorStop(0.68, '#1a3d4a')
  g.addColorStop(1, '#0a1622')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  const rim = 0.18 + pulse * 0.12
  ctx.strokeStyle = `rgba(110, 185, 220, ${rim})`
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.arc(cx, cy, r + 2.5 + pulse * 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = `rgba(70, 140, 190, ${rim * 0.35})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, r + 5 + pulse * 5, 0, Math.PI * 2)
  ctx.stroke()
}

function drawMagneticWavePulse(cx: number, cy: number, earthR: number, animT: number): void {
  if (animT >= magneticWavePulseUntil) return
  const span = Math.max(1, magneticWavePulseUntil - magneticWaveBurstStartAnimT)
  const u = Math.max(0, 1 - (magneticWavePulseUntil - animT) / span)
  const alpha = 0.42 * (1 - u) * (1 - u)
  ctx.save()
  ctx.strokeStyle = `rgba(78, 205, 196, ${alpha})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, earthR + 6 + u * 28, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = `rgba(91, 159, 212, ${alpha * 0.65})`
  ctx.lineWidth = 1.35
  ctx.beginPath()
  ctx.arc(cx, cy, earthR + 4 + u * 20, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Standing magnetospheric waves around Earth while defending a track, or celebration after safe clearance. */
function drawMagneticWaveShield(cx: number, cy: number, earthR: number, animT: number): void {
  const celebrating = animT < magneticWaveCelebrationUntilAnimT
  if (magneticWaveShieldTrackNum === null && !celebrating) return
  const t = animT * 0.0022
  const radii = [9, 17, 25, 33, 41]
  const boost = celebrating ? 0.04 : 0
  ctx.save()
  ctx.lineCap = 'round'
  for (let i = 0; i < radii.length; i++) {
    const base = radii[i]!
    const phase = t + i * 1.05
    const breathe = 1 + 0.045 * Math.sin(phase)
    const alpha = boost + 0.1 + 0.07 * (0.5 + 0.5 * Math.sin(phase * 1.4))
    const r = (earthR + base) * breathe
    ctx.strokeStyle = `rgba(78, 205, 196, ${alpha * 0.85})`
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = `rgba(91, 159, 212, ${alpha * 0.45})`
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
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
  ctx.shadowBlur = 7
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
  const label = `T${a.num}`
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

function drawIntroHudFrame(x0: number, y0: number, x1: number, y1: number, len: number): void {
  ctx.strokeStyle = 'rgba(91, 159, 212, 0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x0, y0 + len)
  ctx.lineTo(x0, y0)
  ctx.lineTo(x0 + len, y0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x1 - len, y0)
  ctx.lineTo(x1, y0)
  ctx.lineTo(x1, y0 + len)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x1, y1 - len)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x1 - len, y1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x0 + len, y1)
  ctx.lineTo(x0, y1)
  ctx.lineTo(x0, y1 - len)
  ctx.stroke()
}

function drawIntro(animT: number): void {
  const w = logicalW
  const h = logicalH
  const cx = w / 2
  const cyIntro = h * 0.42
  const rg = ctx.createRadialGradient(cx, cyIntro * 0.85, 0, cx, cyIntro, Math.max(w, h) * 0.72)
  rg.addColorStop(0, 'rgba(12, 28, 52, 0.62)')
  rg.addColorStop(0.4, 'rgba(4, 10, 22, 1)')
  rg.addColorStop(1, '#010308')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, w, h)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(6, 18, 38, 0.95)')
  g.addColorStop(0.42, 'transparent')
  g.addColorStop(1, 'rgba(1, 4, 10, 1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  drawStars()

  const margin = 14
  drawIntroHudFrame(margin, margin, w - margin, h - margin, 18)

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  if (!reduceMotion) {
    const scanY = (animT * 0.045) % (h + 40)
    ctx.strokeStyle = 'rgba(91, 159, 212, 0.06)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, scanY)
    ctx.lineTo(w, scanY)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(110, 155, 195, 0.82)'
  ctx.font = '600 9px ui-monospace, "IBM Plex Mono", monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('HACHAL · STANDBY · AWAITING OPERATOR LINK', margin + 8, margin + 6)
  ctx.textAlign = 'right'
  ctx.fillText(`T+${(animT / 1000).toFixed(1)}s`, w - margin - 8, margin + 6)
  ctx.textAlign = 'left'

  const orbitR = Math.min(w, h) * 0.36
  ctx.save()
  ctx.strokeStyle = 'rgba(95, 150, 200, 0.11)'
  ctx.lineWidth = 1
  ctx.setLineDash([5, 12])
  if (!reduceMotion) ctx.lineDashOffset = -(animT * 0.018) % 17
  ctx.beginPath()
  ctx.ellipse(cx, cyIntro, orbitR * 1.02, orbitR * 0.88, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineDashOffset = 0
  ctx.restore()

  if (!reduceMotion) {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + animT * 0.00035
      const px = cx + Math.cos(ang) * orbitR * 0.96
      const py = cyIntro + Math.sin(ang) * orbitR * 0.83
      const alpha = 0.2 + 0.14 * Math.sin(animT * 0.0018 + i * 1.1)
      ctx.fillStyle = `rgba(130, 185, 225, ${alpha})`
      ctx.beginPath()
      ctx.arc(px, py, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const r = Math.min(w, h) * 0.14
  const pulse = (Math.sin(animT * 0.003) + 1) * 0.5
  drawEarth(cx, cyIntro, r, pulse)

  const titlePx = Math.max(21, w * 0.038)
  ctx.fillStyle = 'rgba(236, 242, 250, 0.96)'
  ctx.font = `600 ${titlePx}px "IBM Plex Sans", "Segoe UI", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Geocentric surveillance — primary body', cx, cyIntro + r + 46)

  ctx.fillStyle = 'rgba(155, 180, 208, 0.9)'
  ctx.font = `500 ${Math.max(12, w * 0.019)}px "IBM Plex Sans", "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Six-track correlation, Protect Earth channel, and mission console load on handshake.', cx, cyIntro + r + 74)

  ctx.fillStyle = 'rgba(130, 185, 225, 0.92)'
  ctx.font = `600 ${Math.max(11, w * 0.018)}px "IBM Plex Sans", "Segoe UI", system-ui, sans-serif`
  ctx.fillText('Touch Earth or press Enter / Space — establish mission link', cx, h - 50)
}

function drawCorridorLine(ax: number, ay: number, ex: number, ey: number, lightId: number): void {
  const L = getTrackLight(lightId)
  ctx.save()
  ctx.globalAlpha = 0.62
  ctx.strokeStyle = L.stroke
  ctx.lineWidth = 1.35
  ctx.setLineDash([5, 7])
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function drawRadarGrille(cx: number, cy: number, radius: number, animT: number): void {
  const g = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius)
  g.addColorStop(0, 'rgba(18, 40, 68, 0.22)')
  g.addColorStop(0.55, 'rgba(6, 14, 28, 0.38)')
  g.addColorStop(0.92, 'rgba(2, 6, 14, 0.72)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0.5)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(95, 145, 190, 0.14)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy, (radius * i) / 4, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(120, 165, 210, 0.1)'
  ctx.beginPath()
  ctx.moveTo(cx - radius, cy)
  ctx.lineTo(cx + radius, cy)
  ctx.moveTo(cx, cy - radius)
  ctx.lineTo(cx, cy + radius)
  ctx.stroke()

  const sweep = (animT * 0.00095) % (Math.PI * 2)
  const grd = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius)
  grd.addColorStop(0, 'rgba(91, 159, 212, 0.09)')
  grd.addColorStop(0.4, 'rgba(78, 205, 196, 0.04)')
  grd.addColorStop(1, 'rgba(91, 159, 212, 0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, radius, sweep - 0.38, sweep + 0.02)
  ctx.closePath()
  ctx.fill()
}

function drawSpace(animT: number): void {
  lastFrameAnimT = animT
  const w = logicalW
  const h = logicalH
  earthX = w / 2
  earthY = h / 2
  const radarR = Math.min(w, h) / 2 - 6

  const deep = ctx.createRadialGradient(earthX, earthY, radarR * 0.15, earthX, earthY, Math.max(w, h) * 0.72)
  deep.addColorStop(0, 'rgba(10, 28, 52, 0.5)')
  deep.addColorStop(0.5, 'rgba(3, 10, 22, 1)')
  deep.addColorStop(1, '#010308')
  ctx.fillStyle = deep
  ctx.fillRect(0, 0, w, h)
  const vignette = ctx.createRadialGradient(earthX, earthY, radarR * 0.4, earthX, earthY, Math.max(w, h) * 0.65)
  vignette.addColorStop(0, 'transparent')
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.38)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)

  drawStars()

  ctx.save()
  ctx.strokeStyle = 'rgba(80, 125, 170, 0.06)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 12])
  for (let k = 0; k < 3; k++) {
    const rr = radarR * (0.52 + k * 0.16)
    ctx.beginPath()
    ctx.arc(earthX, earthY, rr, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()

  drawRadarGrille(earthX, earthY, radarR, animT)

  if (lastImpactOverlay) {
    drawFalloutOnEarth(earthX, earthY, EARTH_R, lastImpactOverlay)
  }

  drawEarth(earthX, earthY, EARTH_R, (Math.sin(animT * 0.002) + 1) * 0.5)
  updateMagneticWaveShieldState(animT)
  drawMagneticWaveShield(earthX, earthY, EARTH_R, animT)
  drawMagneticWavePulse(earthX, earthY, EARTH_R, animT)

  const threats: ThreatRow[] = []
  for (const a of asteroids) {
    const row = analyzeThreat(a, earthX, earthY, animT, getAnalyzeThreatEnv())
    if (row) {
      threats.push(row)
      drawCorridorLine(a.x, a.y, earthX, earthY, a.lightId)
    }
    drawAsteroid(a, true)
  }

  if (!simulationPaused && animT - lastTableFleetDomMs >= TABLE_FLEET_DOM_MIN_MS) {
    lastTableFleetDomMs = animT
    updateTable(threats, animT)
    updateFleetReadout(animT)
  }

  if (phaseLine && phase === 'space' && !simulationPaused) {
    const prec = magical.precision ? 3 : 1
    phaseLine.textContent = `t=${(animT / 1000).toFixed(prec)}s · sim×${simTimeScale.toFixed(2)} · v̄cap ${velocityCapPx.toFixed(0)} px/s`
  }

  updateCollisionAlertBanner(animT)
}

function updateTable(threats: ThreatRow[], animT: number): void {
  if (!tableBody) return

  const ncol = tableColumnCount()

  if (threats.length === 0) {
    tableBody.innerHTML = `
      <tr class="orbital-table__empty">
        <td colspan="${ncol}">
          <div class="orbital-table__empty-inner">
            <span class="orbital-table__empty-title">No tracks in the watch ring</span>
            <span class="orbital-table__empty-detail">Nothing in the training zone around Earth right now—rows appear when a track enters.</span>
          </div>
        </td>
      </tr>`
  } else {
    const rows = threats
      .map((t) => {
        const hot = t.speedKmS >= 4.85
        const st = tableStatusForSpeed(t.speedKmS)
        const bp = magical.precision ? 2 : 1
        const tail = magical.precision
          ? `
        <td class="orbital-table__cell orbital-table__cell--geometry orbital-mono" data-label="Direction">
          <span class="orbital-table__stack-value">${escapeHtml(t.collisionLabel)}</span>
        </td>
        <td class="orbital-table__cell orbital-table__cell--numeric orbital-mono" data-label="Mag field (nT)">
          <span class="orbital-table__stack-value">${t.magneticNT.toFixed(bp)}</span>
        </td>
        <td class="orbital-table__cell orbital-table__cell--sig orbital-mono" data-label="Signature">
          <span class="orbital-table__stack-value">${escapeHtml(t.emVelSignature)}</span>
        </td>`
          : `
        <td class="orbital-table__cell orbital-table__cell--status orbital-table__cell--status--${st.tone}" data-label="Status">
          <span class="orbital-table__stack-value">${st.label}</span>
        </td>`
        return `
      <tr class="orbital-table__row${hot ? ' orbital-table__row--hot' : ''}">
        <td class="orbital-table__cell orbital-table__cell--designator" data-label="Track">
          <span class="orbital-table__stack-value orbital-table__cell--with-light">
            <span class="orbital-table-light" style="background:${escapeHtml(getTrackLight(t.lightId).fill)}" title="Color for this track on radar and map" aria-hidden="true"></span>
            <span class="orbital-table__designator-text">
              <span class="orbital-table__designator-main">${escapeHtml(t.trackLine)}</span>
              <span class="orbital-table__designator-sub orbital-mono">${escapeHtml(t.simRefLine)}</span>
            </span>
          </span>
        </td>
        <td class="orbital-table__cell orbital-table__cell--class" data-label="Size">
          <span class="orbital-table__stack-value">
            <span class="orbital-table__class-main">${t.bodyClass === 'MET' ? 'Smaller' : 'Larger'}</span>
            <span class="orbital-table__class-sub orbital-mono">~${t.equivDiameterM} m</span>
          </span>
        </td>
        <td class="orbital-table__cell orbital-table__cell--numeric orbital-mono orbital-table__cell--speed${hot ? ' orbital-table__cell--speed-hot' : ''}" data-label="Speed (km/s)">
          <span class="orbital-table__stack-value">${formatSpeed(t.speedKmS)}</span>
        </td>${tail}
      </tr>`
      })
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
}

function setWaveButtonsDisabled(disabled: boolean): void {
  const panel = document.getElementById('orbital-earth-defense')
  if (!panel) return
  for (const btn of panel.querySelectorAll<HTMLButtonElement>('[data-wave-level]')) {
    btn.disabled = disabled
  }
}

function updateCollisionAlertBanner(animT: number): void {
  const el = document.getElementById('orbital-earth-defense')
  const textEl = document.getElementById('orbital-earth-defense-status')
  if (!el || !textEl) return

  if (waveFeedbackClearAnimT > 0 && animT > waveFeedbackClearAnimT) {
    clearWaveFeedbackUi()
  }

  const clearSeverity = (): void => {
    el.classList.remove(
      'orbital-collision-alert--severity-warning',
      'orbital-collision-alert--severity-critical',
    )
  }

  if (simulationPaused || phase !== 'space') {
    clearSeverity()
    el.classList.add('orbital-earth-defense--dormant')
    el.classList.remove('orbital-earth-defense--standby')
    textEl.innerHTML = ''
    lastCollisionAlertText = ''
    lastEarthDefenseStandbyHtml = ''
    setWaveButtonsDisabled(true)
    return
  }

  el.classList.remove('orbital-earth-defense--dormant')

  const best = findPrimaryEarthCollisionThreat(
    animT,
    asteroids,
    earthX,
    earthY,
    simTimeScale,
    getEarthThreatEnv(),
  )

  if (!best) {
    clearSeverity()
    el.classList.add('orbital-earth-defense--standby')
    setWaveButtonsDisabled(true)
    lastCollisionAlertText = ''
    clearWaveFeedbackUi()
    const standbyHtml = `<span class="orbital-earth-defense__standby-label">Safety status</span> · <strong>All clear</strong> — no track is heading for Earth inside the next <span class="orbital-mono">${COLLISION_ALERT_TTI_MAX_S} s</span> of simulated time. <strong>Six tracks</strong> stay on radar; if risk rises, <strong>L1–L3</strong> unlock here so you can try a training pulse.`
    if (standbyHtml !== lastEarthDefenseStandbyHtml) {
      textEl.innerHTML = standbyHtml
      lastEarthDefenseStandbyHtml = standbyHtml
    }
    return
  }

  lastEarthDefenseStandbyHtml = ''
  el.classList.remove('orbital-earth-defense--standby')
  clearSeverity()
  if (best.tti <= 4.5) el.classList.add('orbital-collision-alert--severity-critical')
  else el.classList.add('orbital-collision-alert--severity-warning')

  setWaveButtonsDisabled(false)

  const sig = formatEmVelSignature(best.magneticNT, best.speedKmS, magical.precision)
  const cls = formatBodyClassLabel(best.a.bodyClass)
  const dM = equivDiameterMFromRadarR(best.a.r)
  const ttiStr = best.tti.toFixed(magical.precision ? 2 : 1)
  const bPrec = magical.precision ? 2 : 1
  const html = magical.precision
    ? `<span class="orbital-collision-alert__label">Earth at risk — choose a pulse</span> · <strong>Track ${best.a.num}</strong> <span class="orbital-mono">(${escapeHtml(best.a.name)})</span> · ${cls} · est. width <span class="orbital-mono">${dM}</span> m · time to impact <span class="orbital-mono">≈${ttiStr}</span> s (at your sim speed) · speed <span class="orbital-mono">${formatSpeed(best.speedKmS)} km/s</span> · mag field <span class="orbital-mono">${best.magneticNT.toFixed(bPrec)} nT</span> · signature <span class="orbital-mono">${escapeHtml(sig)}</span> · Tap <strong>L1–L3</strong> below.`
    : `<span class="orbital-collision-alert__label">Earth at risk</span> · <strong>Track ${best.a.num}</strong> · impact in ≈<span class="orbital-mono">${ttiStr}</span>s · speed <span class="orbital-mono">${formatSpeed(best.speedKmS)} km/s</span> · Tap <strong>L1–L3</strong> to deflect.`

  if (html !== lastCollisionAlertText) {
    textEl.innerHTML = html
    lastCollisionAlertText = html
  }
}

function updateFleetReadout(animT: number): void {
  if (!fleetEl) return
  const lines = asteroids.map((a) => {
    const kms = Math.hypot(a.vx, a.vy) * KM_SCALE
    const fuseP = (a.fuse * 100).toFixed(magical.precision ? 1 : 0)
    const Bnow = magneticAlongPath(
      a.x,
      a.y,
      earthX,
      earthY,
      animT,
      logicalW,
      logicalH,
      a.magneticBiasNT,
      B_SURFACE_NT,
    )
    const sig = formatEmVelSignature(Bnow, kms, magical.precision)
    const sizeBand = a.bodyClass === 'MET' ? 'Smaller' : 'Larger'
    const diam = equivDiameterMFromRadarR(a.r)
    const swatches = TRACK_LIGHT_PRESETS.map((p) => {
      const active = a.lightId === p.id
      return `<button type="button" class="orbital-light-swatch${active ? ' is-active' : ''}" data-light-track="${a.num}" data-light-id="${p.id}" title="Use ${escapeHtml(p.name)} for Track ${a.num} on radar, lines, and table" aria-label="Track ${a.num}: set color to ${escapeHtml(p.name)}" aria-pressed="${active ? 'true' : 'false'}" style="--swatch-fill:${p.fill};--swatch-stroke:${p.stroke}"></button>`
    }).join('')
    const fuseHtml =
      magical.chaosVelocity ?
        `<span class="orbital-fleet__fuse orbital-mono" title="Chaos surge level">${fuseP}%</span>`
      : ''
    const telemetryHtml =
      magical.precision ?
        `<div class="orbital-fleet__telemetry orbital-mono" aria-label="Size, width, signature">${sizeBand} · ~${diam} m · ${escapeHtml(sig)}</div>`
      : `<div class="orbital-fleet__telemetry orbital-fleet__telemetry--compact" aria-label="Size and width">${sizeBand} · ~${diam} m</div>`
    return `<div class="orbital-fleet__row" data-track="${a.num}">
      <div class="orbital-fleet__lights" role="toolbar" aria-label="Color choices for track ${a.num}">
        ${swatches}
      </div>
      <div class="orbital-fleet__metrics">
        <span class="orbital-fleet__track-label"><strong>Track ${a.num}</strong></span>
        <span class="orbital-fleet__name orbital-mono" title="Short label for this track in the table">${escapeHtml(a.name)}</span>
        <span class="orbital-fleet__speed orbital-mono" title="Speed in the simulation">${formatSpeed(kms)} km/s</span>
        ${fuseHtml}
      </div>
      ${telemetryHtml}
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
  invalidateTelemetryDomSchedule()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/** Inline “i” tooltip: keyboard-focusable, aria-describedby to bubble. */
function orbitalUxTip(idSuffix: string, buttonAria: string, bubble: string): string {
  const uid = `oux-${idSuffix}`
  return `<span class="orbital-tooltip">
    <button type="button" class="orbital-tooltip__btn" id="${uid}-b" aria-describedby="${uid}-t" aria-label="${escapeHtml(buttonAria)}">i</button>
    <span class="orbital-tooltip__bubble" id="${uid}-t" role="tooltip">${escapeHtml(bubble)}</span>
  </span>`
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
      const magneticNT = magneticAlongPath(
        a.x,
        a.y,
        earthX,
        earthY,
        animT,
        logicalW,
        logicalH,
        a.magneticBiasNT,
        B_SURFACE_NT,
      )
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
        emVelSignature: formatEmVelSignature(magneticNT, speedKmS, magical.precision),
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

  if (phase === 'space') {
    if (!simulationPaused) {
      let simRemain = dt
      const trackCtx: TrackingContext = {
        earthX,
        earthY,
        velocityCapPx,
        chaosVelocity: magical.chaosVelocity,
        logicalW,
        logicalH,
      }
      while (simRemain > 1e-9 && !simulationPaused) {
        const subDt = Math.min(MAX_PHYS_SUBSTEP_S, simRemain)
        if (missionCore) {
          missionCore.integrateSpaceSubstep(asteroids, subDt, trackCtx)
        }
        checkSurfaceImpact(ts)
        simRemain -= subDt
      }
    }
    missionCore?.runTelemetryAfterMotion({
      animT: ts,
      asteroids,
      earthX,
      earthY,
      simTimeScale,
      earthThreatEnv: getEarthThreatEnv(),
    })
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
  const prevW = logicalW
  const prevH = logicalH
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(320, rect.width)
  const h = Math.max(400, rect.height)

  // Keep tracks visually consistent when the radar is resized (avoids sudden jumps vs Earth).
  if (phase === 'space' && prevW > 0 && prevH > 0 && asteroids.length > 0) {
    const sx = w / prevW
    const sy = h / prevH
    for (const a of asteroids) {
      a.x *= sx
      a.y *= sy
      a.vx *= sx
      a.vy *= sy
      a.speedRelax = Math.max(1e-3, Math.hypot(a.vx, a.vy))
    }
  }

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

function finishGoSpaceHandoff(): void {
  phase = 'space'
  simulationPaused = false
  invalidateTelemetryDomSchedule()
  closeImpactModal()
  closeRescueModal()
  appMountEl?.classList.add('orbital-app--space')
  const ws = document.getElementById('orbital-workspace')
  ws?.classList.remove('orbital-workspace--intro', 'orbital-workspace--intro-exit')
  ws?.classList.add('orbital-workspace--split')
  document.getElementById('orbital-intro-cta')?.classList.add('orbital-intro-cta--hidden')
  resize()
  spawnAsteroids(logicalW, logicalH)
  if (phaseLine) phaseLine.textContent = 'Nominal · six-track field · Earth-centered'
  document.querySelector('.orbital-balloon')?.classList.remove('orbital-balloon--hidden')
  const tourBtn = document.getElementById('orbital-tour-btn')
  const headerActions = document.querySelector('.orbital-balloon__header-actions')
  if (tourBtn && headerActions && tourBtn.parentElement !== headerActions) {
    headerActions.insertBefore(tourBtn, headerActions.firstChild)
  }
  tourBtn?.classList.remove('orbital-tour-btn--floating')
  magneticWavePulseUntil = 0
  magneticWaveBurstStartAnimT = 0
  clearMagneticWaveShield()
}

function goSpace(): void {
  if (phase !== 'intro' || introHandoffActive) return
  introHandoffActive = true
  const ws = document.getElementById('orbital-workspace')
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  const holdMs = reduced ? 0 : 380

  if (!reduced) ws?.classList.add('orbital-workspace--intro-exit')

  window.setTimeout(() => {
    finishGoSpaceHandoff()
    introHandoffActive = false
    ws?.classList.remove('orbital-workspace--intro-exit')
    if (!reduced) {
      ws?.classList.add('orbital-workspace--split-enter')
      requestAnimationFrame(() => {
        ws?.classList.add('orbital-workspace--split-enter-active')
      })
      window.setTimeout(() => {
        ws?.classList.remove('orbital-workspace--split-enter', 'orbital-workspace--split-enter-active')
      }, 560)
    }
  }, holdMs)
}

let orbitalTutorialCleanup: (() => void) | null = null

function shouldAutoStartOrbitalTutorial(): boolean {
  try {
    if (localStorage.getItem(TUTORIAL_PREF_SKIP_KEY) === '1') return false
    if (localStorage.getItem(TUTORIAL_RERUN_NEXT_KEY) === '1') return true
    if (localStorage.getItem(TUTORIAL_DONE_KEY) !== '1') return true
  } catch {
    return true
  }
  return false
}

function persistTutorialCompletion(skipForever: boolean, rerunNextVisit: boolean): void {
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1')
    if (skipForever) {
      localStorage.setItem(TUTORIAL_PREF_SKIP_KEY, '1')
      localStorage.removeItem(TUTORIAL_RERUN_NEXT_KEY)
    } else if (rerunNextVisit) {
      localStorage.removeItem(TUTORIAL_PREF_SKIP_KEY)
      localStorage.setItem(TUTORIAL_RERUN_NEXT_KEY, '1')
    } else {
      localStorage.removeItem(TUTORIAL_PREF_SKIP_KEY)
      localStorage.removeItem(TUTORIAL_RERUN_NEXT_KEY)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

type OrbitalTutorialStep = {
  title: string
  body: string
  targetSelector: string | null
  /** Step advances only via this control (not primary Next). */
  primaryEnterMission?: boolean
}

const ORBITAL_TUTORIAL_STEPS: readonly OrbitalTutorialStep[] = [
  {
    title: 'HACHAL mission console',
    body: 'You are in a browser-based mission console: geocentric display, six correlated tracks, and a Protect Earth response channel. It does not connect to live satellites or public alerts. Use Next for a panel-by-panel briefing, or Skip to operate unguided.',
    targetSelector: null,
  },
  {
    title: 'Primary sensor plane',
    body: 'Earth is the reference. After you establish the mission link, six tracks appear as inbound contacts (Track 1–6). Each has a short designation for correlation with the live list.',
    targetSelector: '#orbital-radar-bezel',
  },
  {
    title: 'Establish mission link',
    body: 'Touch Earth or press Enter / Space to handshake into the full layout: radar, mission sidebar, fleet colors, and the near-Earth list. You can also use Enter mission below.',
    targetSelector: '#orbital-radar-bezel',
    primaryEnterMission: true,
  },
  {
    title: 'Header actions',
    body: 'Briefing — reopens this walkthrough. Restart — new track geometry for all six. Log out — ends the session in this tab and returns to secure access.',
    targetSelector: '.orbital-balloon__header-actions',
  },
  {
    title: 'Program vision',
    body: 'A short summary stays visible; open Full background for the long read. Same story and context as before — not live data from space.',
    targetSelector: '.orbital-mandate',
  },
  {
    title: 'Training pace',
    body: 'Sim speed changes how fast time runs in the exercise. Velocity cap limits how fast objects may move on the radar — handy when you want a calmer or tougher drill.',
    targetSelector: '.orbital-console-panel--sim',
  },
  {
    title: 'Optional screen overlays',
    body: 'Checkboxes add extra visuals or harder behavior. “Extra decimal places” also expands the table with direction, magnetic field, and signature. Other toggles add impact shading, random speed spikes, and layered impact zones.',
    targetSelector: '.orbital-console-panel--modes',
  },
  {
    title: 'Mission status',
    body: 'One live line summarizing what the simulation is doing right now (all clear, alert, etc.). It updates while the sim runs.',
    targetSelector: '.orbital-status-strip',
  },
  {
    title: 'Protect Earth',
    body: 'When a track is on a collision course inside the short countdown, L1–L3 unlock. You will see what the pulse is doing, then either a clear success report or a structured “not cleared” note (what you did, what happened, what to try next).',
    targetSelector: '#orbital-earth-defense',
  },
  {
    title: 'Track colors',
    body: 'Each track has a color on the radar dot, the line toward Earth, and the table. Swatches persist until you close the tab or log out.',
    targetSelector: '#orbital-fleet',
  },
  {
    title: 'Objects near Earth (table)',
    body: 'By default: track, size, speed, and a simple status (OK / Watch / Priority). Turn on Extra decimal places for the full technical columns. On a phone, each row becomes a short card.',
    targetSelector: '.orbital-data-sheet',
  },
  {
    title: 'Impact and deflection pop-ups',
    body: 'A surface strike opens a modal with optional fallout bands. A successful Protect Earth pulse opens the deflection report. Both are training aids — not real alerts.',
    targetSelector: null,
  },
]

function scrollOrbitalTutorialTargetIntoView(selector: string | null): void {
  if (!selector) return
  document.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function closeOrbitalTutorialOverlay(): void {
  orbitalTutorialCleanup?.()
  orbitalTutorialCleanup = null
}

function mountOrbitalTutorial(root: HTMLElement): void {
  if (document.getElementById('orbital-tutorial-root')) return

  const host = document.createElement('div')
  host.id = 'orbital-tutorial-root'
  host.className = 'orbital-tutorial'
  host.setAttribute('role', 'dialog')
  host.setAttribute('aria-modal', 'true')
  host.setAttribute('aria-labelledby', 'orbital-tutorial-title')

  host.innerHTML = `
    <div class="orbital-tutorial__backdrop" aria-hidden="true"></div>
    <div class="orbital-tutorial__spotlight orbital-tutorial__spotlight--hidden" aria-hidden="true"></div>
    <div class="orbital-tutorial__sheet">
      <p class="orbital-tutorial__step" id="orbital-tutorial-step-label" aria-live="polite"></p>
      <h2 class="orbital-tutorial__title" id="orbital-tutorial-title"></h2>
      <p class="orbital-tutorial__body"></p>
      <div class="orbital-tutorial__actions orbital-tutorial__actions--main">
        <button type="button" class="orbital-btn orbital-btn--muted orbital-tutorial__skip">Skip briefing</button>
        <div class="orbital-tutorial__nav">
          <button type="button" class="orbital-btn orbital-btn--muted orbital-tutorial__prev">Back</button>
          <button type="button" class="orbital-btn orbital-btn--primary orbital-tutorial__next">Next</button>
          <button type="button" class="orbital-btn orbital-btn--primary orbital-tutorial__enter" hidden>Enter mission</button>
        </div>
      </div>
      <div class="orbital-tutorial__finish orbital-tutorial__finish--hidden">
        <p class="orbital-tutorial__finish-lead">Briefing complete.</p>
        <p class="orbital-tutorial__finish-ask">How should we open the briefing on future visits?</p>
        <div class="orbital-tutorial__actions orbital-tutorial__actions--finish">
          <button type="button" class="orbital-btn orbital-btn--primary orbital-tutorial__again">Show briefing next time I open the console</button>
          <button type="button" class="orbital-btn orbital-btn--muted orbital-tutorial__noskip">Operate without the briefing</button>
        </div>
      </div>
    </div>
  `

  root.appendChild(host)

  const stepLabel = host.querySelector('#orbital-tutorial-step-label')!
  const titleEl = host.querySelector('#orbital-tutorial-title')!
  const bodyEl = host.querySelector('.orbital-tutorial__body')!
  const mainActions = host.querySelector('.orbital-tutorial__actions--main')!
  const finishBlock = host.querySelector('.orbital-tutorial__finish')!
  const btnPrev = host.querySelector<HTMLButtonElement>('.orbital-tutorial__prev')!
  const btnNext = host.querySelector<HTMLButtonElement>('.orbital-tutorial__next')!
  const btnEnter = host.querySelector<HTMLButtonElement>('.orbital-tutorial__enter')!
  const btnSkip = host.querySelector<HTMLButtonElement>('.orbital-tutorial__skip')!
  const btnAgain = host.querySelector<HTMLButtonElement>('.orbital-tutorial__again')!
  const btnNoSkip = host.querySelector<HTMLButtonElement>('.orbital-tutorial__noskip')!
  const backdropEl = host.querySelector<HTMLElement>('.orbital-tutorial__backdrop')!
  const spotlightEl = host.querySelector<HTMLElement>('.orbital-tutorial__spotlight')!

  let index = 0
  const total = ORBITAL_TUTORIAL_STEPS.length

  const updateSpotlightGeometry = (): void => {
    const step = ORBITAL_TUTORIAL_STEPS[index]
    if (!step?.targetSelector) {
      spotlightEl.classList.add('orbital-tutorial__spotlight--hidden')
      backdropEl.classList.add('orbital-tutorial__backdrop--dim')
      return
    }
    const el = document.querySelector(step.targetSelector)
    if (!el) {
      spotlightEl.classList.add('orbital-tutorial__spotlight--hidden')
      backdropEl.classList.add('orbital-tutorial__backdrop--dim')
      return
    }
    const r = el.getBoundingClientRect()
    const pad = 10
    const top = r.top - pad
    const left = r.left - pad
    const width = r.width + pad * 2
    const height = r.height + pad * 2
    spotlightEl.style.top = `${Math.max(0, top)}px`
    spotlightEl.style.left = `${Math.max(0, left)}px`
    spotlightEl.style.width = `${width}px`
    spotlightEl.style.height = `${height}px`
    spotlightEl.classList.remove('orbital-tutorial__spotlight--hidden')
    backdropEl.classList.remove('orbital-tutorial__backdrop--dim')
  }

  const showFinish = (): void => {
    mainActions.classList.add('orbital-tutorial__actions--hidden')
    finishBlock.classList.remove('orbital-tutorial__finish--hidden')
    spotlightEl.classList.add('orbital-tutorial__spotlight--hidden')
    backdropEl.classList.add('orbital-tutorial__backdrop--dim')
    stepLabel.textContent = ''
    titleEl.textContent = 'Briefing complete'
    bodyEl.textContent = ''
    btnAgain.focus()
  }

  const applyStep = (): void => {
    const step = ORBITAL_TUTORIAL_STEPS[index]!
    stepLabel.textContent = `Step ${index + 1} of ${total}`
    titleEl.textContent = step.title
    bodyEl.textContent = step.body

    const needEnterMission = !!step.primaryEnterMission && phase === 'intro'
    btnNext.hidden = needEnterMission
    btnEnter.hidden = !needEnterMission
    btnPrev.disabled = index === 0

    scrollOrbitalTutorialTargetIntoView(step.targetSelector)
    requestAnimationFrame(() => updateSpotlightGeometry())

    if (needEnterMission) btnEnter.focus()
    else btnNext.focus()
  }

  const goNext = (): void => {
    if (index < total - 1) {
      index += 1
      applyStep()
    } else {
      showFinish()
    }
  }

  const goPrev = (): void => {
    if (index > 0) {
      index -= 1
      applyStep()
    }
  }

  const onEnterMission = (): void => {
    if (phase === 'intro') goSpace()
    goNext()
  }

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      showFinish()
    }
  }

  btnNext.addEventListener('click', goNext)
  btnEnter.addEventListener('click', onEnterMission)
  btnPrev.addEventListener('click', goPrev)
  btnSkip.addEventListener('click', showFinish)

  btnAgain.addEventListener('click', () => {
    persistTutorialCompletion(false, true)
    closeOrbitalTutorialOverlay()
  })

  btnNoSkip.addEventListener('click', () => {
    persistTutorialCompletion(true, false)
    closeOrbitalTutorialOverlay()
  })

  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateSpotlightGeometry)

  orbitalTutorialCleanup = (): void => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', updateSpotlightGeometry)
    host.remove()
  }

  applyStep()
}

function restart(): void {
  if (phase !== 'space') return
  simulationPaused = false
  invalidateTelemetryDomSchedule()
  closeImpactModal()
  closeRescueModal()
  magneticWavePulseUntil = 0
  magneticWaveBurstStartAnimT = 0
  clearMagneticWaveShield()
  clearWaveFeedbackUi()
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
    speedRelax: baseSpeed,
    destructPhase: rand(0, Math.PI * 2),
    fuse: 0,
    lightId: loadPersistedLightId(num),
    bodyClass,
    magneticBiasNT,
  }
  const without = asteroids.filter((x) => x.num !== num)
  without.push(neo)
  without.sort((a, b) => a.num - b.num)
  asteroids = without
}

function readModeCheckboxes(): void {
  magical.precision = !!(document.getElementById('mode-precision') as HTMLInputElement)?.checked
  magical.falloutMap = !!(document.getElementById('mode-fallout') as HTMLInputElement)?.checked
  magical.chaosVelocity = !!(document.getElementById('mode-chaos') as HTMLInputElement)?.checked
  magical.multiZone = !!(document.getElementById('mode-multizone') as HTMLInputElement)?.checked
  syncTableColumns()
  invalidateTelemetryDomSchedule()
}

function showHachalGate(root: HTMLElement, onUnlocked: () => void): void {
  stopHachalGateTick()

  const syncLockUi = (): void => {
    let until = readHachalLockoutUntil()
    if (until > 0 && Date.now() >= until) {
      try {
        sessionStorage.removeItem(HACHAL_LOCKOUT_UNTIL_KEY)
      } catch {
        /* ignore */
      }
      until = 0
    }
    const remain = until > 0 ? until - Date.now() : 0
    const form = root.querySelector<HTMLFormElement>('#hachal-login-form')
    const input = root.querySelector<HTMLInputElement>('#hachal-password')
    const submit = root.querySelector<HTMLButtonElement>('.hachal-gate__submit')
    const lockBanner = root.querySelector<HTMLElement>('#hachal-lockout-banner')
    const errEl = root.querySelector<HTMLElement>('#hachal-login-error')

    if (remain > 0) {
      form?.classList.add('hachal-gate__form--locked')
      if (input) {
        input.disabled = true
        input.value = ''
      }
      if (submit) submit.disabled = true
      if (lockBanner) {
        lockBanner.hidden = false
        lockBanner.textContent = `Access temporarily locked after ${HACHAL_MAX_ATTEMPTS} failed attempts. Try again in ${formatLockoutRemaining(remain)}.`
      }
      if (errEl) errEl.textContent = ''
    } else {
      form?.classList.remove('hachal-gate__form--locked')
      if (input) input.disabled = false
      if (submit) submit.disabled = false
      if (lockBanner) {
        lockBanner.hidden = true
        lockBanner.textContent = ''
      }
    }
  }

  root.innerHTML = `
    <div class="hachal-gate">
      <div class="hachal-gate__panel">
        <p class="hachal-gate__eyebrow">HACHAL · secure access</p>
        <p class="hachal-gate__session-banner" role="status" aria-live="polite">
          <span class="hachal-gate__session-dot" aria-hidden="true"></span>
          No active session in this tab
        </p>
        <h1 class="hachal-gate__title">HACHAL orbital console</h1>
        <p class="hachal-gate__lead">Authenticate to open the mission interface for this browser tab.</p>
        <p class="hachal-gate__sub">Authorized personnel only. Session persists until you sign out or close the tab. Failed attempts are logged; repeated failures trigger a temporary lockout.</p>
        <p id="hachal-lockout-banner" class="hachal-gate__lockout" role="alert" aria-live="assertive" hidden></p>
        <div class="hachal-gate__guide" aria-label="Access sequence">
          <p class="hachal-gate__guide-title">Access sequence</p>
          <ol class="hachal-gate__guide-list">
            <li>Enter your <strong>issued access code</strong> (never displayed here).</li>
            <li>Select <strong>Sign in</strong> to bind a session to this tab.</li>
            <li>On the next screen, use <strong>Briefing</strong> for a walkthrough, or establish the mission link on the primary display.</li>
          </ol>
          <p class="hachal-gate__note">Deploy: optional <span class="hachal-gate__mono">VITE_HACHAL_ACCESS_CODE</span> at build. Browser-visible sources — operational discipline, not classified crypto.</p>
        </div>
        <form class="hachal-gate__form" id="hachal-login-form" autocomplete="off">
          <div class="hachal-gate__label-row">
            <label class="hachal-gate__label" for="hachal-password">Access code</label>
            ${orbitalUxTip(
              'gate-code',
              'Help: access code field',
              'Use the code issued to your organization. It is not displayed on this screen. Several wrong tries can temporarily lock sign-in.',
            )}
          </div>
          <input
            id="hachal-password"
            name="hachal-password"
            type="password"
            class="hachal-gate__input"
            inputmode="numeric"
            maxlength="32"
            required
            title="Enter the code you were given; it is not shown on this page."
            aria-describedby="hachal-login-error hachal-lockout-banner"
          />
          <p id="hachal-login-error" class="hachal-gate__error" role="alert" aria-live="polite"></p>
          <button type="submit" class="hachal-gate__submit">Sign in</button>
        </form>
      </div>
    </div>
  `

  const form = root.querySelector<HTMLFormElement>('#hachal-login-form')
  const input = root.querySelector<HTMLInputElement>('#hachal-password')
  const errEl = root.querySelector<HTMLElement>('#hachal-login-error')

  const maybeStartLockTick = (): void => {
    stopHachalGateTick()
    if (readHachalLockoutUntil() > Date.now()) {
      hachalGateTick = setInterval(() => {
        syncLockUi()
        if (readHachalLockoutUntil() <= Date.now()) {
          stopHachalGateTick()
          syncLockUi()
          input?.focus()
        }
      }, 1000)
    }
  }

  syncLockUi()
  maybeStartLockTick()
  if (!input?.disabled) input?.focus()

  form?.addEventListener('submit', (e) => {
    e.preventDefault()
    if (Date.now() < readHachalLockoutUntil()) {
      syncLockUi()
      return
    }

    const val = input?.value.trim() ?? ''
    const expected = getExpectedAccessCode()

    if (val === expected) {
      clearHachalAuthPenalties()
      stopHachalGateTick()
      if (errEl) errEl.textContent = ''
      sessionStorage.setItem(HACHAL_SESSION_KEY, '1')
      onUnlocked()
      return
    }

    const fails = readHachalFailCount() + 1
    writeHachalFailCount(fails)
    const remaining = HACHAL_MAX_ATTEMPTS - fails

    if (fails >= HACHAL_MAX_ATTEMPTS) {
      writeHachalLockoutUntil(Date.now() + HACHAL_LOCKOUT_MS)
      writeHachalFailCount(0)
      if (errEl) errEl.textContent = ''
      syncLockUi()
      maybeStartLockTick()
      return
    }

    if (errEl) {
      errEl.textContent = `Access code incorrect. ${remaining} attempt(s) remaining before a ${formatLockoutRemaining(HACHAL_LOCKOUT_MS)} lockout for this tab.`
    }
    input?.select()
  })
}

function mountApplication(root: HTMLElement): void {
  phase = 'intro'
  introHandoffActive = false
  simulationPaused = false
  lastImpactOverlay = null
  lastCollisionAlertText = ''
  lastEarthDefenseStandbyHtml = ''
  magneticWavePulseUntil = 0
  magneticWaveBurstStartAnimT = 0
  magneticWaveBurstSpanMs = 780
  clearMagneticWaveShield()
  waveFeedbackClearAnimT = 0
  asteroids = []
  lastUtcUiMs = 0
  invalidateTelemetryDomSchedule()
  cancelAnimationFrame(raf)

  root.innerHTML = `
    <div class="orbital-root">
      <div class="orbital-workspace orbital-workspace--intro" id="orbital-workspace">
        <button
          type="button"
          class="orbital-btn orbital-btn--tour orbital-tour-btn--floating"
          id="orbital-tour-btn"
          aria-label="Operator briefing (guided walkthrough)"
          title="Operator briefing — walkthrough of each panel"
        >
          Briefing
        </button>
        <aside class="orbital-balloon orbital-balloon--hidden" aria-label="Mission sidebar: training controls and live lists">
          <div class="orbital-balloon__tail" aria-hidden="true"></div>
          <div class="orbital-balloon__inner orbital-mission-deck">
            <div class="orbital-balloon__header">
              <div class="orbital-balloon__header-left">
                <span class="orbital-balloon__badge">HACHAL · orbital mission console</span>
                <span class="orbital-session-pill" id="orbital-session-status" role="status" title="You are signed in for this browser tab until you log out or close the tab.">
                  <span class="orbital-session-pill__dot" aria-hidden="true"></span>
                  Signed in
                </span>
              </div>
              <div class="orbital-balloon__header-actions">
                <button type="button" class="orbital-btn orbital-btn--radar" id="orbital-restart" title="Start a new exercise with fresh paths for all six tracks">Restart</button>
                <button type="button" class="orbital-btn orbital-btn--signout" id="orbital-signout" title="End this session and return to the access gate">Log out</button>
              </div>
            </div>
            <p class="orbital-sidebar-strap orbital-subsystem orbital-subsystem--strap" id="orbital-sidebar-strap">
              This column is your <strong>control deck</strong>: story, pace, safety actions, colors, and the live list next to the radar.
            </p>
            <section class="orbital-mandate orbital-subsystem orbital-subsystem--intel" aria-labelledby="orbital-mandate-title">
              <div class="orbital-zone__head orbital-zone__head--tight">
                <h3 class="orbital-mandate__title orbital-zone__title--in-mandate" id="orbital-mandate-title">Program vision</h3>
                ${orbitalUxTip(
                  'mandate',
                  'Help: program vision',
                  'Background on what this training story represents. It is not a feed from real satellites or official alerts.',
                )}
              </div>
              <p class="orbital-zone__lead orbital-zone__lead--mandate">
                Narrative context for this exercise only — not live space data. Expand for the full background.
              </p>
              <details class="orbital-mandate__details">
                <summary class="orbital-mandate__summary">
                  <span>Full background</span>
                  <span class="orbital-mandate__summary-hint orbital-sr-only">, expands optional long read</span>
                </summary>
                <div class="orbital-mandate__expanded">
                  <p class="orbital-mandate__tagline">This system connects humanity to the advancement of space.</p>
                  <p class="orbital-mandate__body">
                    Shared progress in orbit depends on <strong>open eyes</strong> as much as new rockets: knowing what
                    crosses Earth’s neighborhood, and rehearsing what to do about it, is how civilisation earns a long
                    future among the planets. A future operational stack would fuse <strong>global NEO surveys</strong>,
                    <strong>precision orbit determination</strong>, and <strong>deflection physics</strong> (kinetic
                    impact, gravity tractor, ion beams, or coordinated pulses) into one timeline: detect early →
                    characterize threat → choose response → verify miss distance.
                    Near-Earth objects span many sizes; the goal is <strong>days to decades</strong> of warning and a
                    rehearsed chain of command.
                  </p>
                  <p class="orbital-mandate__foot">
                    This console is a <strong>training and narrative shell</strong> for that idea — not a real planetary
                    defense network.
                  </p>
                </div>
              </details>
            </section>
            <div class="orbital-console-panel orbital-console-panel--sim orbital-subsystem orbital-subsystem--sim">
              <div class="orbital-zone__head">
                <h3 class="orbital-console-panel__heading" id="orbital-sim-controls-title">Training pace</h3>
                ${orbitalUxTip(
                  'sim-panel',
                  'Help: training pace',
                  'Sim speed changes how fast time runs in the drill. Velocity cap limits how fast objects may move on the radar so you can keep the exercise readable.',
                )}
              </div>
              <p class="orbital-zone__lead" id="orbital-sim-controls-lead">Adjust how fast the exercise runs and how fast tracks are allowed to move.</p>
              <div class="orbital-controls">
              <label class="orbital-control">
                <span class="orbital-control__label">Sim speed ×</span>
                <input type="range" id="orbital-sim-scale" min="0.15" max="2" step="0.05" value="1" title="How fast simulated time runs compared to normal. Lower is slower." aria-describedby="orbital-sim-controls-lead" />
                <span class="orbital-control__value orbital-mono" id="orbital-sim-scale-val">1.00</span>
              </label>
              <label class="orbital-control">
                <span class="orbital-control__label">Top speed (cap)</span>
                <input type="range" id="orbital-vcap" min="55" max="175" step="1" value="130" title="Upper limit on how fast tracks may move in the radar view." aria-describedby="orbital-sim-controls-lead" />
                <span class="orbital-control__value orbital-mono" id="orbital-vcap-val">130</span>
              </label>
              </div>
            </div>
            <fieldset class="orbital-modes orbital-console-panel orbital-console-panel--modes orbital-subsystem orbital-subsystem--modes" aria-describedby="orbital-modes-lead">
              <legend class="orbital-modes-legend-row">
                <span>Optional screen overlays</span>
                ${orbitalUxTip(
                  'modes-legend',
                  'Help: optional overlays',
                  'These toggles add extra visuals or harder behavior. They do not change real-world data—only this training view.',
                )}
              </legend>
              <p class="orbital-zone__lead" id="orbital-modes-lead">Turn on extra detail or stress modes when you want more challenge or clarity.</p>
              <label class="orbital-mode"><input type="checkbox" id="mode-precision" title="Finer numbers everywhere plus full table: direction, magnetic field, signature." /> Extra decimal places</label>
              <label class="orbital-mode"><input type="checkbox" id="mode-fallout" title="Shades Earth where simulated impacts would land." /> Impact shading on Earth</label>
              <label class="orbital-mode"><input type="checkbox" id="mode-chaos" title="Adds unpredictable speed spikes so tracks behave more erratically." /> Random speed surges</label>
              <label class="orbital-mode"><input type="checkbox" id="mode-multizone" title="After a strike, shows several impact bands instead of one simple zone." /> Layered impact zones</label>
            </fieldset>
            <div class="orbital-status-strip orbital-subsystem orbital-subsystem--status" role="status" aria-live="polite">
              <span class="orbital-status-strip__dot" aria-hidden="true"></span>
              <div class="orbital-status-strip__body">
                <div class="orbital-status-strip__head">
                  <span class="orbital-status-strip__title" id="orbital-status-heading">Mission status</span>
                  ${orbitalUxTip(
                    'status-strip',
                    'Help: mission status',
                    'One live sentence summarizing what the simulation is doing (all clear, alert, paused, etc.). It updates as time advances.',
                  )}
                </div>
                <p class="orbital-phase" id="orbital-phase" aria-labelledby="orbital-status-heading">Nominal · six-track field · Earth-centered</p>
              </div>
            </div>
            <section
              id="orbital-earth-defense"
              class="orbital-earth-defense orbital-collision-alert orbital-earth-defense--dormant orbital-subsystem orbital-subsystem--protection"
              role="region"
              aria-labelledby="orbital-earth-defense-heading"
            >
              <div class="orbital-zone__head orbital-zone__head--earth">
                <h3 class="orbital-earth-defense__heading" id="orbital-earth-defense-heading">Protect Earth</h3>
                ${orbitalUxTip(
                  'earth-defense',
                  'Help: Protect Earth',
                  'Six tracks (Track 1–6) move on radar; the table labels each as a smaller or larger object by size in this demo. When one is on a collision course inside the short countdown, L1–L3 unlock—tap a level to try a training pulse. In the simulation, the pulse nudges the path sideways while keeping speed the same.',
                )}
              </div>
              <p class="orbital-zone__lead orbital-earth-defense__intro-hint">
                When a track is heading for Earth inside the alert window, the pulse buttons unlock. Each tap shows <strong>what is happening</strong> under the buttons, then <strong>success</strong> (report) or <strong>not cleared</strong> with what to try next.
              </p>
              <div
                id="orbital-earth-defense-status"
                class="orbital-earth-defense__status orbital-collision-alert__text"
                role="status"
                aria-live="polite"
              ></div>
              <p class="orbital-collision-alert__pulse-hint">
                <span class="orbital-pulse-hint__text">Pulse strength: gentle (L1) to strong (L3)—stronger pushes cost more margin in this training model.</span>
                ${orbitalUxTip(
                  'pulse-tech',
                  'Help: what the pulse does',
                  'Technical detail: the sim rotates in-plane velocity toward Earth’s limb so speed magnitude stays the same—useful fiction for practicing timing, not a real weapon model.',
                )}
              </p>
              <div class="orbital-collision-alert__actions" role="group" aria-label="Protect Earth — choose pulse strength">
                <button type="button" class="orbital-wave-btn" data-wave-level="1" disabled title="Smallest training push—good when you want a light nudge.">
                  Protect · <span class="orbital-mono">L1</span><span class="orbital-wave-btn__sub">gentle</span>
                </button>
                <button type="button" class="orbital-wave-btn" data-wave-level="2" disabled title="Medium training push—balanced deflection in this exercise.">
                  Protect · <span class="orbital-mono">L2</span><span class="orbital-wave-btn__sub">medium</span>
                </button>
                <button type="button" class="orbital-wave-btn orbital-wave-btn--max" data-wave-level="3" disabled title="Strongest training push—biggest path change when unlocked.">
                  Protect · <span class="orbital-mono">L3</span><span class="orbital-wave-btn__sub">strong</span>
                </button>
              </div>
              <div id="orbital-wave-feedback" class="orbital-wave-feedback" role="region" aria-label="Pulse feedback" aria-live="polite"></div>
            </section>
            <section class="orbital-fleet-block orbital-subsystem orbital-subsystem--fleet" aria-labelledby="orbital-fleet-heading">
              <div class="orbital-zone__head orbital-zone__head--tight">
                <h3 class="orbital-fleet-block__title" id="orbital-fleet-heading">Track colors</h3>
                ${orbitalUxTip(
                  'fleet-colors',
                  'Help: track colors',
                  'Each track uses one color for the radar dot, the line toward Earth, and the small marker in the table. Swatches apply for this browser tab until you log out or close it.',
                )}
              </div>
              <p class="orbital-zone__lead">Pick a color per track so dots, lines, and the table stay easy to match.</p>
              <p class="orbital-fleet__legend">Dot · line toward Earth · table square</p>
              <div class="orbital-fleet" id="orbital-fleet" aria-label="Per-track colors and quick stats"></div>
            </section>
            <section class="orbital-data-sheet orbital-data-sheet--s3 orbital-subsystem orbital-subsystem--objects" id="orbital-data-sheet" aria-labelledby="orbital-sheet-title">
              <div class="orbital-data-sheet__ribbon" aria-hidden="true"></div>
              <header class="orbital-data-sheet__head">
                <div class="orbital-data-sheet__head-top">
                  <h2 class="orbital-data-sheet__title" id="orbital-sheet-title">
                    Objects near Earth
                  </h2>
                  <span class="orbital-data-sheet__stamp" title="List refreshes while the simulation runs">Live</span>
                </div>
                <div class="orbital-data-sheet__title-row">
                  <p class="orbital-data-sheet__subtitle">
                    Watch zone around Earth — speed and status first; turn on <strong>Extra decimal places</strong> for full columns.
                  </p>
                  ${orbitalUxTip(
                    'sheet-sub',
                    'Help: this table',
                    'Default: track, size, speed, simple status. Optional “Extra decimal places” adds direction, magnetic field, and signature — training data only.',
                  )}
                </div>
                <div class="orbital-data-sheet__meta">
                  <time id="orbital-sheet-utc" class="orbital-data-sheet__utc orbital-mono" datetime=""
                    >— UTC</time
                  >
                </div>
              </header>
              <div class="orbital-table-wrap" id="orbital-table-wrap">
                <table
                  class="orbital-table orbital-table--assessment orbital-table--compact"
                  aria-live="polite"
                  aria-describedby="orbital-sheet-title orbital-sheet-foot orbital-table-caption"
                >
                  <caption class="orbital-sr-only" id="orbital-table-caption"></caption>
                  <thead id="orbital-thead"></thead>
                  <tbody id="orbital-tbody"></tbody>
                  <tfoot>
                    <tr class="orbital-table__foot">
                      <td colspan="4" id="orbital-sheet-foot">
                        <span class="orbital-table__foot-line"
                          ><strong>Training only</strong> · Not real alerts or operational data. Pulse and reports are for practice.</span
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
          <div class="orbital-radar-stack">
            <div class="orbital-radar-bezel" id="orbital-radar-bezel">
              <span class="orbital-radar-label" aria-hidden="true">RADAR</span>
              <canvas class="orbital-canvas" aria-label="HACHAL primary display: Earth-centered standby. Touch Earth or press Enter or Space to establish mission link and load the console."></canvas>
            </div>
            <p class="orbital-radar-caption">You are looking at the <strong>main radar</strong>: Earth and six practice tracks; the side column holds controls and the live list.</p>
          </div>
          <div class="orbital-intro-cta" id="orbital-intro-cta" role="region" aria-label="Establish mission link" title="Handshake into mission console">
            <p class="orbital-intro-cta__eyebrow">HACHAL · primary display</p>
            <p class="orbital-intro-cta__title">Establish mission link</p>
            <p class="orbital-intro-cta__body">Handshake loads the operational layout: <strong>six correlated tracks</strong> (Track 1–6), <strong>mission sidebar</strong> (pace, Protect Earth, live list), and <strong>radar</strong> as the main sensor plane.</p>
            <p class="orbital-intro-cta__tour-hint">First time? Corner <strong>Briefing</strong> walks each panel — or link in when you are ready.</p>
          </div>
        </div>
      </div>
      <div id="orbital-impact-modal" class="orbital-modal orbital-modal--hidden" role="dialog" aria-modal="true" aria-labelledby="orbital-impact-title">
        <div class="orbital-modal__panel">
          <h2 id="orbital-impact-title" class="orbital-modal__title">Surface impact</h2>
          <p class="orbital-modal__strap">In this training run, an object reached the ground—details below are simulated, not a real alert.</p>
          <p class="orbital-modal__body" id="orbital-impact-summary"></p>
          <div id="orbital-fallout-list"></div>
          <div class="orbital-modal__actions">
            <button type="button" class="orbital-btn orbital-btn--primary" id="orbital-impact-continue">Continue system</button>
            <button type="button" class="orbital-btn orbital-btn--muted" id="orbital-impact-reset">Reset simulation</button>
          </div>
        </div>
      </div>
      <div id="orbital-rescue-modal" class="orbital-modal orbital-modal--hidden" role="dialog" aria-modal="true" aria-labelledby="orbital-rescue-title">
        <div class="orbital-modal__panel orbital-modal__panel--rescue">
          <h2 id="orbital-rescue-title" class="orbital-modal__title orbital-modal__title--rescue">Deflection report</h2>
          <p class="orbital-modal__strap">Your training pulse changed the path; the numbers below are for this exercise only.</p>
          <div id="orbital-rescue-report-body" class="orbital-rescue-report-body"></div>
          <div class="orbital-modal__actions">
            <button type="button" class="orbital-btn orbital-btn--primary" id="orbital-rescue-dismiss">Acknowledge · resume surveillance</button>
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
  root.querySelector('#orbital-earth-defense')?.addEventListener('click', onMagneticWaveClick)

  root.querySelector('#orbital-restart')?.addEventListener('click', () => restart())

  const openTour = (): void => {
    mountOrbitalTutorial(root)
  }
  root.querySelector('#orbital-tour-btn')?.addEventListener('click', openTour)

  root.querySelector('#orbital-signout')?.addEventListener('click', () => {
    sessionStorage.removeItem(HACHAL_SESSION_KEY)
    window.location.reload()
  })

  const simEl = root.querySelector<HTMLInputElement>('#orbital-sim-scale')
  const simVal = root.querySelector('#orbital-sim-scale-val')
  simEl?.addEventListener('input', () => {
    simTimeScale = Number(simEl.value)
    if (simVal) simVal.textContent = simTimeScale.toFixed(2)
    invalidateTelemetryDomSchedule()
  })

  const vcapEl = root.querySelector<HTMLInputElement>('#orbital-vcap')
  const vcapVal = root.querySelector('#orbital-vcap-val')
  vcapEl?.addEventListener('input', () => {
    velocityCapPx = Number(vcapEl.value)
    if (vcapVal) vcapVal.textContent = String(Math.round(velocityCapPx))
    invalidateTelemetryDomSchedule()
  })

  for (const id of ['mode-precision', 'mode-fallout', 'mode-chaos', 'mode-multizone']) {
    document.getElementById(id)?.addEventListener('change', readModeCheckboxes)
  }

  document.getElementById('orbital-impact-continue')?.addEventListener('click', () => {
    const n = lastImpactOverlay?.num
    closeImpactModal()
    simulationPaused = false
    invalidateTelemetryDomSchedule()
    if (n !== undefined) respawnOneSlot(n)
    lastImpactOverlay = null
  })

  document.getElementById('orbital-impact-reset')?.addEventListener('click', () => {
    closeImpactModal()
    restart()
  })

  document.getElementById('orbital-rescue-dismiss')?.addEventListener('click', () => {
    closeRescueModal()
    simulationPaused = false
    invalidateTelemetryDomSchedule()
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

  readModeCheckboxes()

  lastTs = 0
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(step)

  requestAnimationFrame(() => {
    if (shouldAutoStartOrbitalTutorial()) mountOrbitalTutorial(root)
  })
}

function mount(root: HTMLElement): void {
  appMountEl = root
  root.classList.add('orbital-app')

  if (sessionStorage.getItem(HACHAL_SESSION_KEY) === '1') {
    mountApplication(root)
    return
  }

  showHachalGate(root, () => {
    mountApplication(root)
  })
}

/** מעביר ליבה מוכנה — נקודת הכניסה המועדפת מ־bootstrap. */
export function mountOrbitalShell(core: MissionSystemCore): void {
  missionCore = core
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) return
  mount(app)
}

/** תאימות לאחור: יוצר ליבה חדשה מקומית. */
export function startOrbitalMonitor(): void {
  mountOrbitalShell(new MissionSystemCore())
}
