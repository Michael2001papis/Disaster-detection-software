/** Earth radius in logical pixels (display plane). */
export const EARTH_R = 28

/** Radar dot radius range (px); mapped to estimated physical size in UI. */
export const AST_R_MIN = 4.15
export const AST_R_MAX = 11.6
export const METEORITE_R_THRESHOLD = 6.9
export const CORRIDOR_CLEARANCE_PX = 16

/** Show collision alert when intercept is this soon (simulation seconds) but not yet surface contact. */
export const COLLISION_ALERT_TTI_MAX_S = 14
export const COLLISION_ALERT_TTI_MIN_S = 0.06

/** Yaw applied to velocity (rad) for magnetospheric pulse — L3 strongest. */
export const WAVE_DEFLECT_RAD: Record<1 | 2 | 3, number> = {
  1: 0.12,
  2: 0.24,
  3: 0.42,
}

export const KM_SCALE = 0.052
export const B_SURFACE_NT = 47_000

/** Max simulation dt (seconds) per physics sub-step. */
export const MAX_PHYS_SUBSTEP_S = 1 / 80

export const SPEED_RELAX_LAMBDA = 8.5
export const SPEED_RELAX_LAMBDA_CHAOS = 13

/** Throttle full table+fleet innerHTML rebuilds (~12 Hz). */
export const TABLE_FLEET_DOM_MIN_MS = 83
