import { MissionSystemCore } from '../core/MissionSystemCore'

export function bootstrapMissionSystem(): void {
  new MissionSystemCore().run()
}
