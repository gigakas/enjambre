const TAU = Math.PI * 2

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export { TAU, clamp }

export const MIN_BOIDS = 50
export const MAX_BOIDS = 5000
export const DEFAULT_BOIDS = 100

/** Volumen donde vive el enjambre (semiejes en unidades del mundo). */
export const BOUNDS = { x: 44, y: 27, z: 34 }

/** Sectores de aproximación repartidos por la esfera. */
export const SECTOR_COUNT = 18

/** Radio de la formación de espera y del escudo defensivo. */
export const STAGE_RADIUS = 20
export const SHIELD_RADIUS = 9.5
export const SHIELD_ANGLE = 0.95
export const PULSE_RADIUS = 15
export const SHIELD_COS = Math.cos(SHIELD_ANGLE)

/** Máquina de estados finitos de cada ave. */
export const STATE = {
  DISTRIBUTE: 0,
  STAGE: 1,
  DIVE: 2,
  RETREAT: 3,
  EVADE: 4,
}

/** Jerarquía de mando: 4 escuadrones con un código por ave. */
export const SQUAD_COUNT = 4
export const SQUAD_LETTERS = ['A', 'B', 'C', 'D']
export const LEADER_DOWN_TIME = 6
export const STRATEGY_INTERVAL = 2.4

/** Carga del pulso a partir de la cual las aves repliegan. */
export const RETREAT_CHARGE = 0.55

export const DEFAULT_PARAMS = {
  perception: 7.4,
  separationRadius: 3.2,
  separation: 1.9,
  alignment: 1.15,
  cohesion: 0.95,
  seek: 1.9,
  distribution: 1,
  defense: 1,
  maxSpeed: 9.5,
  minSpeed: 3.2,
  maxForce: 16,
  edgeMargin: 10,
  strikeRadius: 2.6,
}
