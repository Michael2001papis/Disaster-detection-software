/** Per-track display “light” (radar blip, label, corridor line, table marker). */
export interface TrackLightPreset {
  id: number
  name: string
  fill: string
  stroke: string
  glow: string
  badgeBg: string
  badgeFg: string
  badgeStroke: string
}

export type Phase = 'intro' | 'space'

export interface Asteroid {
  num: number
  name: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  baseSpeed: number
  speedRelax: number
  destructPhase: number
  fuse: number
  lightId: number
  bodyClass: 'MET' | 'AST'
  magneticBiasNT: number
}

export interface ThreatRow {
  trackLine: string
  simRefLine: string
  speedKmS: number
  collisionLabel: string
  magneticNT: number
  lightId: number
  bodyClass: 'MET' | 'AST'
  equivDiameterM: number
  emVelSignature: string
}

export interface FalloutZone {
  label: string
  innerKm: number
  outerKm: number
  bearingDeg: number
  arcDeg: number
}

export interface ImpactSnapshot {
  num: number
  name: string
  speedKmS: number
  latStr: string
  lonStr: string
  zones: FalloutZone[]
  bearingDeg: number
  bodyClass: 'MET' | 'AST'
  equivDiameterM: number
  emVelSignature: string
}

export interface RescueReport {
  utcIso: string
  num: number
  name: string
  bodyClass: 'MET' | 'AST'
  equivDiameterM: number
  waveLevel: 1 | 2 | 3
  ttiBeforeWallS: number
  sigBefore: string
  sigAfter: string
  speedKmSAfter: number
  magneticNTAfter: number
}

export interface Star {
  x: number
  y: number
  s: number
  o: number
}

export interface MagicalModes {
  precision: boolean
  falloutMap: boolean
  chaosVelocity: boolean
  multiZone: boolean
}

/** Strongest Earth collision candidate within the alert horizon. */
export interface PrimaryEarthCollisionThreat {
  a: Asteroid
  tti: number
  speedKmS: number
  magneticNT: number
}
