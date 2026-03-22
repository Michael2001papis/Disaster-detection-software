import type { PrimaryEarthCollisionThreat } from '../../types/domain'

export type IntelEvent = {
  tMs: number
  kind: 'threat_window'
  message: string
  trackNum: number | null
}

const MAX_EVENTS = 120

/** יומן אירועים מצומצם — ללא שינוי התנהגות מסך; לשימוש Core ו־UI עתידי. */
export class MissionIntelligence {
  private events: IntelEvent[] = []
  private lastAlertTrackNum: number | null = null

  /** מזהה מעבר לכניסה/יציאה מחלון איום ראשי (כמו באנר ההתנגשות). */
  onPrimaryThreatFrame(animT: number, primary: PrimaryEarthCollisionThreat | null): void {
    const n = primary?.a.num ?? null
    if (n === this.lastAlertTrackNum) return
    if (primary && n !== null) {
      this.push({
        tMs: animT,
        kind: 'threat_window',
        message: `Track ${n} entered collision-alert window`,
        trackNum: n,
      })
    } else if (this.lastAlertTrackNum !== null) {
      this.push({
        tMs: animT,
        kind: 'threat_window',
        message: `Collision-alert window cleared (last track ${this.lastAlertTrackNum})`,
        trackNum: null,
      })
    }
    this.lastAlertTrackNum = n
  }

  getRecent(): readonly IntelEvent[] {
    return this.events
  }

  reset(): void {
    this.events = []
    this.lastAlertTrackNum = null
  }

  private push(e: IntelEvent): void {
    this.events.push(e)
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS)
    }
  }
}
