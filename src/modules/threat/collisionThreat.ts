import type { Asteroid, PrimaryEarthCollisionThreat } from '../../types/domain'
import { magneticAlongPath, timeToEarthImpact } from './physics'

export interface EarthThreatEnv {
  earthR: number
  collisionAlertTtiMaxS: number
  collisionAlertTtiMinS: number
  kmScale: number
  logicalW: number
  logicalH: number
  bSurfaceNT: number
}

export function findPrimaryEarthCollisionThreat(
  animT: number,
  asteroids: readonly Asteroid[],
  earthX: number,
  earthY: number,
  simTimeScale: number,
  env: EarthThreatEnv,
): PrimaryEarthCollisionThreat | null {
  const vScale = simTimeScale
  let best: PrimaryEarthCollisionThreat | null = null

  for (const a of asteroids) {
    const tti = timeToEarthImpact(
      a.x,
      a.y,
      a.vx * vScale,
      a.vy * vScale,
      earthX,
      earthY,
      env.earthR,
      a.r,
      env.collisionAlertTtiMinS,
    )
    if (tti === null || tti > env.collisionAlertTtiMaxS) continue
    const speedKmS = Math.hypot(a.vx, a.vy) * env.kmScale
    const magneticNT = magneticAlongPath(
      a.x,
      a.y,
      earthX,
      earthY,
      animT,
      env.logicalW,
      env.logicalH,
      a.magneticBiasNT,
      env.bSurfaceNT,
    )
    if (!best || tti < best.tti) best = { a, tti, speedKmS, magneticNT }
  }
  return best
}

export function trajectoryClearedImmediateThreat(
  a: Asteroid,
  earthX: number,
  earthY: number,
  simTimeScale: number,
  env: Pick<EarthThreatEnv, 'earthR' | 'collisionAlertTtiMaxS' | 'collisionAlertTtiMinS'>,
): boolean {
  const vScale = simTimeScale
  const tti = timeToEarthImpact(
    a.x,
    a.y,
    a.vx * vScale,
    a.vy * vScale,
    earthX,
    earthY,
    env.earthR,
    a.r,
    env.collisionAlertTtiMinS,
  )
  return tti === null || tti > env.collisionAlertTtiMaxS
}
