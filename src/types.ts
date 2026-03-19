export type RiskLevel = 'Low' | 'Medium' | 'High'

export interface MonitoringObject {
  name: string
  type: string
  risk: RiskLevel
}

