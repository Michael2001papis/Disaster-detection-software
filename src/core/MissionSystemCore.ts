import { startOrbitalMonitor } from '../orbitalMonitor'

/**
 * ליבת תיאום ISPES: מפעילה את המערכת ומתכננת חיבור מודולרי הדרגתי.
 * כרגע הרצת המשימה עדיין בלחבילת legacy אחת — הפירוק ממשיך לפי YOURT.
 */
export class MissionSystemCore {
  run(): void {
    startOrbitalMonitor()
  }
}
