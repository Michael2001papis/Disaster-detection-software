import type { Asteroid } from '../../types/domain'
import {
  B_SURFACE_NT,
  COLLISION_ALERT_TTI_MIN_S,
  CORRIDOR_CLEARANCE_PX,
  EARTH_R,
} from '../../constants/simulation'

export function magneticAlongPath(
  ax: number,
  ay: number,
  ex: number,
  ey: number,
  t: number,
  logicalW: number,
  logicalH: number,
  biasNT = 0,
  bSurfaceNT: number = B_SURFACE_NT,
): number {
  const dKm = (Math.hypot(ax - ex, ay - ey) / Math.max(logicalW, logicalH)) * 150_000_000
  const d = Math.max(dKm, 6_500)
  const dipole = bSurfaceNT * Math.pow(6_371 / d, 3)
  const coupling = 1 + 0.08 * Math.sin(t * 0.002 + ax * 0.01)
  return dipole * coupling + biasNT
}

export function equivDiameterMFromRadarR(rPx: number): number {
  return Math.round(95 + rPx * 118)
}

export function formatEmVelSignature(BnT: number, vKmS: number, precision: boolean): string {
  const bDec = precision ? 2 : 0
  const vDec = precision ? 4 : 2
  return `M${BnT.toFixed(bDec)}·V${vKmS.toFixed(vDec)}`
}

/** Corridor gate radius in display plane (Earth + body + margin). */
export function corridorGateRadiusPx(
  a: Asteroid,
  earthR: number = EARTH_R,
  corridorClearancePx: number = CORRIDOR_CLEARANCE_PX,
): number {
  return earthR + a.r + corridorClearancePx
}

/**
 * Smallest t > 0 such that |P + t v - E| = earthR + bodyR (2-D intercept), if any.
 * Times are in the same units as velocity (px per second → seconds).
 */
export function timeToEarthImpact(
  px: number,
  py: number,
  vx: number,
  vy: number,
  ex: number,
  ey: number,
  earthR: number,
  bodyR: number,
  ttiMinS: number = COLLISION_ALERT_TTI_MIN_S,
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
  const roots = [t1, t2].filter((t) => t > ttiMinS)
  if (roots.length === 0) return null
  return Math.min(...roots)
}
