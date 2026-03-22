import type { Asteroid } from '../types/domain'
import { buildSixTrackAsteroids } from '../modules/detection'
import { findPrimaryEarthCollisionThreat } from '../modules/threat'
import { protectionFromPrimaryThreat } from '../modules/protection'
import { integrateAsteroidsSubstep } from '../modules/tracking'
import { MissionIntelligence } from '../modules/intelligence'
import type { TelemetryFrameInput, TelemetrySnapshot, TrackingContext } from './pipelineTypes'

/**
 * ליבה מרכזית: אין תלות ב־orbitalMonitor.
 * צינור — תנועה (Tracking) בנפרד מטלמטריה (איום→הגנה→מודיעין) אחרי צעד פיזיקה.
 */
export class MissionSystemCore {
  readonly intelligence = new MissionIntelligence()

  spawnSixTracks(
    w: number,
    h: number,
    names: readonly string[],
    lightIdForTrack: (trackNum: number) => number,
  ): Asteroid[] {
    return buildSixTrackAsteroids(w, h, names, lightIdForTrack)
  }

  integrateSpaceSubstep(asteroids: Asteroid[], subDt: number, ctx: TrackingContext): void {
    integrateAsteroidsSubstep(asteroids, subDt, ctx)
  }

  /**
   * לאחר עדכון מיקומים: איום → הגנה → מודיעין.
   * מודולים לא מדברים זה עם זה — רק דרך הליבה.
   */
  runTelemetryAfterMotion(input: TelemetryFrameInput): TelemetrySnapshot {
    const primaryInAlert = findPrimaryEarthCollisionThreat(
      input.animT,
      input.asteroids,
      input.earthX,
      input.earthY,
      input.simTimeScale,
      input.earthThreatEnv,
    )
    const protection = protectionFromPrimaryThreat(primaryInAlert)
    this.intelligence.onPrimaryThreatFrame(input.animT, primaryInAlert)
    return { protection }
  }
}

export type { TelemetryFrameInput, TelemetrySnapshot, TrackingContext } from './pipelineTypes'
export type { EarthThreatEnv } from '../modules/threat/collisionThreat'
