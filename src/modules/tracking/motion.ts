import { SPEED_RELAX_LAMBDA, SPEED_RELAX_LAMBDA_CHAOS } from '../../constants/simulation'
import type { Asteroid } from '../../types/domain'
import type { TrackingContext } from '../../core/pipelineTypes'
import { wrap as wrapCoord } from '../../utils/random'

/** אותה לוגיקת surge / cap כמו ב־orbitalMonitor לפני הפירוק. */
export function applySelfDestructVelocity(a: Asteroid, dt: number, ctx: TrackingContext): void {
  const chaos = ctx.chaosVelocity ? 1.65 : 1
  a.destructPhase += dt * (2.1 * chaos)
  a.fuse = Math.min(1, a.fuse + dt * (0.014 + (ctx.chaosVelocity ? 0.01 : 0)))
  const surge =
    1 +
    0.32 * Math.sin(a.destructPhase) * (0.55 + a.fuse) +
    0.4 * a.fuse * a.fuse * chaos
  const targetSpd = Math.min(a.baseSpeed * surge, ctx.velocityCapPx)
  let mag = Math.hypot(a.vx, a.vy)
  if (mag < 1e-5) {
    const du = ctx.earthX - a.x
    const dv = ctx.earthY - a.y
    const d = Math.hypot(du, dv) || 1
    a.vx = (du / d) * a.baseSpeed
    a.vy = (dv / d) * a.baseSpeed
    mag = a.baseSpeed
  }
  const lam = ctx.chaosVelocity ? SPEED_RELAX_LAMBDA_CHAOS : SPEED_RELAX_LAMBDA
  const alpha = 1 - Math.exp(-lam * dt)
  a.speedRelax += alpha * (targetSpd - a.speedRelax)
  const newMag = Math.max(0.001, a.speedRelax)
  const s = newMag / mag
  a.vx *= s
  a.vy *= s
}

/** אינטגרציית מיקום + wrap — גבולות זהים לקוד המקורי. */
export function integrateAsteroidMotion(a: Asteroid, dt: number, ctx: TrackingContext): void {
  const w = ctx.logicalW
  const canvasH = ctx.logicalH
  a.x += a.vx * dt
  a.y += a.vy * dt
  a.x = wrapCoord(a.x, -40, w + 40)
  a.y = wrapCoord(a.y, -40, canvasH + 40)
}

export function integrateAsteroidsSubstep(asteroids: Asteroid[], subDt: number, ctx: TrackingContext): void {
  for (const a of asteroids) {
    applySelfDestructVelocity(a, subDt, ctx)
    integrateAsteroidMotion(a, subDt, ctx)
  }
}
