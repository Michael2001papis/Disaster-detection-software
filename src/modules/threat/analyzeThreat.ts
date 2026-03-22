import type { Asteroid, ThreatRow } from '../../types/domain'
import {
  corridorGateRadiusPx,
  equivDiameterMFromRadarR,
  formatEmVelSignature,
  magneticAlongPath,
} from './physics'

export interface AnalyzeThreatEnv {
  logicalW: number
  logicalH: number
  precision: boolean
  earthR: number
  corridorClearancePx: number
  kmScale: number
  bSurfaceNT: number
}

export function analyzeThreat(
  a: Asteroid,
  ex: number,
  ey: number,
  timeMs: number,
  env: AnalyzeThreatEnv,
): ThreatRow | null {
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
  if (dist > corridorGateRadiusPx(a, env.earthR, env.corridorClearancePx)) return null

  const speedPx = Math.sqrt(vv)
  const speedKmS = speedPx * env.kmScale
  const dec = env.precision ? 3 : 1
  const ang = (Math.atan2(cy - ey, cx - ex) * (180 / Math.PI) + 360) % 360
  const rAu = (dist / (env.logicalW * 0.45)) * 0.25 + 0.0001
  const collisionLabel = `ψ = ${ang.toFixed(dec)}°   ρ = ${rAu.toFixed(dec + 2)} AU`
  const magneticNT = magneticAlongPath(
    a.x,
    a.y,
    ex,
    ey,
    timeMs,
    env.logicalW,
    env.logicalH,
    a.magneticBiasNT,
    env.bSurfaceNT,
  )
  const equivDiameterM = equivDiameterMFromRadarR(a.r)
  const emVelSignature = formatEmVelSignature(magneticNT, speedKmS, env.precision)

  return {
    trackLine: `Track ${a.num}`,
    simRefLine: a.name,
    speedKmS,
    collisionLabel,
    magneticNT,
    lightId: a.lightId,
    bodyClass: a.bodyClass,
    equivDiameterM,
    emVelSignature,
  }
}
