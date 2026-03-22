import type { Asteroid, PrimaryEarthCollisionThreat } from '../types/domain'
import type { EarthThreatEnv } from '../modules/threat/collisionThreat'

/** קלט אינטגרציית תנועה ל־Tracking (ללא תלות ב־DOM). */
export type TrackingContext = {
  earthX: number
  earthY: number
  velocityCapPx: number
  chaosVelocity: boolean
  logicalW: number
  logicalH: number
}

/** תוצאת הערכת הגנה (מצב מוקד בטוח). */
export type SafetyLevel = 'safe' | 'warning' | 'danger'

export type ProtectionSnapshot = {
  level: SafetyLevel
  /** איום ראשי בתוך חלון ההתראה — כמו findPrimaryEarthCollisionThreat */
  primaryInAlert: PrimaryEarthCollisionThreat | null
}

/** צילום לאחר תנועה לשכבת טלמטריה (מודולים → לעתיד UI). */
export type TelemetrySnapshot = {
  protection: ProtectionSnapshot
}

export type TelemetryFrameInput = {
  animT: number
  asteroids: readonly Asteroid[]
  earthX: number
  earthY: number
  simTimeScale: number
  earthThreatEnv: EarthThreatEnv
}
