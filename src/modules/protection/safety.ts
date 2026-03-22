import type { PrimaryEarthCollisionThreat } from '../../types/domain'
import type { ProtectionSnapshot, SafetyLevel } from '../../core/pipelineTypes'

/**
 * מצב הגנה לפי איום ראשי בחלון ההתנגשות — תואם את לוגיקת ה־UI הקיימת (יש איום בתוך חלון = חומרה מקסימלית).
 */
export function protectionFromPrimaryThreat(primary: PrimaryEarthCollisionThreat | null): ProtectionSnapshot {
  const level: SafetyLevel = primary ? 'danger' : 'safe'
  return {
    level,
    primaryInAlert: primary,
  }
}
