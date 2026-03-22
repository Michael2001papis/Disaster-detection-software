import {
  AST_R_MAX,
  AST_R_MIN,
  METEORITE_R_THRESHOLD,
} from '../../constants/simulation'
import type { Asteroid } from '../../types/domain'
import { rand } from '../../utils/random'

export function randomBodyGeometry(): { r: number; bodyClass: 'MET' | 'AST'; magneticBiasNT: number } {
  const r = rand(AST_R_MIN, AST_R_MAX)
  const bodyClass: 'MET' | 'AST' = r < METEORITE_R_THRESHOLD ? 'MET' : 'AST'
  const magneticBiasNT = rand(-3200, 3200)
  return { r, bodyClass, magneticBiasNT }
}

/**
 * יוצר שישה מסלולים התחלתיים — לוגיקה זהה ל־spawn הקודם ב־orbitalMonitor.
 * שמות (ייעודים) ו־lightId מגיעים מבחוץ כדי להשאיר אחסון ב־shell.
 */
export function buildSixTrackAsteroids(
  w: number,
  h: number,
  names: readonly string[],
  lightIdForTrack: (trackNum: number) => number,
): Asteroid[] {
  const cx = w / 2
  const cy = h / 2
  const margin = 80
  const out: Asteroid[] = []

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
    out.push({
      num: i + 1,
      name: names[i]!,
      x,
      y,
      vx: (dx / len) * baseSpeed,
      vy: (dy / len) * baseSpeed,
      r,
      baseSpeed,
      speedRelax: baseSpeed,
      destructPhase: rand(0, Math.PI * 2),
      fuse: 0,
      lightId: lightIdForTrack(i + 1),
      bodyClass,
      magneticBiasNT,
    })
  }
  return out
}
