import { MissionSystemCore } from '../core/MissionSystemCore'
import { mountOrbitalShell } from '../orbitalMonitor'

export function bootstrapMissionSystem(): void {
  const core = new MissionSystemCore()
  mountOrbitalShell(core)
}
