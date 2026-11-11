const TAU = Math.PI * 2

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export { TAU, clamp }

export const MIN_BOIDS = 50
export const MAX_BOIDS = 5000
export const DEFAULT_BOIDS = 100

/** Volumen donde vive el enjambre (semiejes en unidades del mundo). */
export const BOUNDS = { x: 44, y: 27, z: 34 }

/**
 * Volumen operativo: cubre toda la página para poder colocar el objetivo
 * en cualquier punto de la ventana.
 */
export const PLAY_BOUNDS = { x: 190, y: 120, z: 190 }

/** Sectores de aproximación repartidos por la esfera. */
export const SECTOR_COUNT = 18

/** Radio de la formación de espera y del escudo defensivo. */
export const STAGE_RADIUS = 20
export const SHIELD_RADIUS = 9.5
export const SHIELD_ANGLE = 0.95
export const PULSE_RADIUS = 15
export const SHIELD_COS = Math.cos(SHIELD_ANGLE)

/** Combate: salud, energía, cañones y daño. */
export const TARGET_MAX_HEALTH = 100
export const TARGET_MAX_ENERGY = 100
export const ATTACKER_MAX_HEALTH = 5
export const SHOT_DAMAGE = 1
export const COLLISION_DAMAGE = 2
export const CANNON_COUNT = 2
export const CANNON_RANGE = 300
export const CANNON_COOLDOWN = 0.45
export const CANNON_AIM_TIME = 0.18
export const CANNON_FIRE_INTERVAL = 0.16
export const CANNON_ENERGY_COST = 1.2
export const CANNON_BURST_ENERGY = 12
export const ENERGY_REGEN = 6.5
export const SHOT_RADIUS = 0.8
export const COLLISION_RADIUS = 2.4
export const COLLISION_COOLDOWN = 1.8
export const DODGE_ALERT_RADIUS = 7
export const DODGE_TIME = 0.9

/** Soportes de los dos cañones alrededor del objetivo. */
export const CANNON_MOUNTS = [
  { x: 3.2, y: 2.2, z: 1.2 },
  { x: -3.2, y: -2.2, z: -1.2 },
]

/** Bombas de expansión del objetivo. */
export const BOMB_COUNT = 5
export const BOMB_SPEED = 7
export const BOMB_RADIUS = 7
export const BOMB_DAMAGE = 2
export const BOMB_FUSE = 8
export const BOMB_ENERGY_COST = 18
export const BOMB_COOLDOWN = 7
export const BOMB_DETECT_RADIUS = 32
export const BOMB_INTERCEPT_RADIUS = 3.5
export const BOMB_MAX_INTERCEPTORS = 3
export const BOMB_ARM_TIME = 1.1
export const BOMB_MIN_RANGE = 18

/** Máquina de estados finitos de cada ave. */
export const STATE = {
  DISTRIBUTE: 0,
  STAGE: 1,
  DIVE: 2,
  RETREAT: 3,
  EVADE: 4,
  INTERCEPT: 5,
}

/** Número de estados de la FSM (para los contadores del panel). */
export const STATE_COUNT = 6

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
