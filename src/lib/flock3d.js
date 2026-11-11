import {
  BOUNDS,
  DEFAULT_BOIDS,
  DEFAULT_PARAMS,
  MAX_BOIDS,
  MIN_BOIDS,
  PULSE_RADIUS,
  RETREAT_CHARGE,
  SECTOR_COUNT,
  SQUAD_COUNT,
  STATE,
  STRATEGY_INTERVAL,
  TAU,
  clamp,
} from './constants.js'
import { createRandom, createRange } from './random.js'
import { SpatialGrid } from './spatialGrid.js'
import { SECTOR_DIRS, SectorGame } from './sectors.js'
import { CommandChain } from './commandChain.js'
import { DefenseSystem } from './defense.js'
import { SteeringSystem } from './steering.js'

<<<<<<< HEAD
export {
  BOUNDS,
  DEFAULT_BOIDS,
  DEFAULT_PARAMS,
  LEADER_DOWN_TIME,
  MAX_BOIDS,
  MIN_BOIDS,
  PULSE_RADIUS,
  RETREAT_CHARGE,
  SECTOR_COUNT,
  SHIELD_ANGLE,
  SHIELD_COS,
  SHIELD_RADIUS,
  SQUAD_COUNT,
  SQUAD_LETTERS,
  STAGE_RADIUS,
  STATE,
  STRATEGY_INTERVAL,
  TAU,
  clamp,
} from './constants.js'
=======
const rand = (min, max) => min + Math.random() * (max - min)

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const MIN_BOIDS = 50
export const MAX_BOIDS = 5000
export const DEFAULT_BOIDS = 100

/** Volumen donde vive el enjambre (semiejes en unidades del mundo). */
export const BOUNDS = { x: 44, y: 27, z: 34 }

/**
 * Volumen operativo: cubre toda la página para poder colocar el objetivo
 * en cualquier punto de la ventana. Es mayor que BOUNDS para que el
 * enjambre pueda perseguir objetivos alejados del centro.
 */
export const PLAY_BOUNDS = { x: 190, y: 120, z: 190 }

/** Sectores de aproximación repartidos por la esfera. */
export const SECTOR_COUNT = 18

/** Radio de la formación de espera y del escudo defensivo. */
export const STAGE_RADIUS = 20
export const SHIELD_RADIUS = 9.5
export const SHIELD_ANGLE = 0.95
export const PULSE_RADIUS = 15

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

/**
 * Bombas de expansión: proyectiles lentos que dañan a varios atacantes
 * al detonar. El objetivo solo dispone de 5 por ronda y el enjambre puede
 * detectarlas y planear su derribo para reducir el daño.
 */
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

const SHIELD_COS = Math.cos(SHIELD_ANGLE)

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
const LEADER_DOWN_TIME = 6
const STRATEGY_INTERVAL = 2.4

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

/**
 * Teoría de juegos: cada ave elige uno de estos sectores alrededor del
 * objetivo. El pago de un sector penaliza la congestión (juego de congestión)
 * y la exposición al escudo enemigo, con un pequeño coste de desplazamiento.
 * Las aves actualizan su mejor respuesta de forma escalonada.
 */
const SECTOR_DIRS = buildSectorDirections(SECTOR_COUNT)

function buildSectorDirections(count) {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const dirs = []
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * golden
    dirs.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
    })
  }
  return dirs
}
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8

/**
 * Simulación de Boids en 3D sobre arrays tipados.
 *
 * Orquesta cuatro sistemas con responsabilidades separadas:
 * - `SpatialGrid`: rejilla espacial (counting sort).
 * - `SectorGame`: juego de congestión y asignación de flancos.
 * - `DefenseSystem`: escudo direccional y pulsos.
 * - `CommandChain`: códigos, líderes, comandante y relevos.
 * - `SteeringSystem`: vecinas, boids, FSM, integración y bordes.
 */
export class Flock3D {
  constructor({
    count = DEFAULT_BOIDS,
    maxCount = MAX_BOIDS,
    seed = Date.now(),
    rng,
  } = {}) {
    this.maxCount = maxCount
    this.count = clamp(Math.round(count), MIN_BOIDS, maxCount)
    this.params = { ...DEFAULT_PARAMS }
    this.target = null

    // RNG inyectable: los tests y la depuración pueden fijar una semilla.
    this.random = rng || createRandom(seed)
    this.rand = createRange(this.random)

    this.positions = new Float32Array(maxCount * 3)
    this.velocities = new Float32Array(maxCount * 3)
    this.laneJitter = new Float32Array(maxCount * 3)
    this.states = new Uint8Array(maxCount)
    this.stateTimers = new Float32Array(maxCount)
    this.planTimers = new Float32Array(maxCount)
    this.sectors = new Uint8Array(maxCount)

    this.sectorGame = new SectorGame()
    this.command = new CommandChain({
      maxCount,
      count: this.count,
      rng: this.random,
    })
    this.defense = new DefenseSystem({ rng: this.random })
    this.grid = new SpatialGrid({
      bounds: BOUNDS,
      cellSize: this.params.perception,
      maxCount,
    })
    this.steering = new SteeringSystem(this)

    this.squadSectors = new Uint8Array(SQUAD_COUNT)
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      this.squadSectors[s] = Math.floor((s * SECTOR_COUNT) / SQUAD_COUNT)
    }

    this.strategyTimer = 0
    this.strategyVersion = 0
    this.pendingLeaderDowns = []
<<<<<<< HEAD
    this.pendingImpacts = 0
    this.pendingBlocks = 0
=======

    // Defensa del objetivo.
    this.shield = { x: 1, y: 0, z: 0 }
    this.shieldTarget = { x: 1, y: 0, z: 0 }
    this.pulseTimer = 5
    this.pulseCharge = 0

    // Combate: salud de atacantes, salud/energía del objetivo y cañones.
    this.health = new Uint8Array(maxCount).fill(ATTACKER_MAX_HEALTH)
    this.threatTimers = new Float32Array(maxCount)
    // Memoria de daño: las aves que han recibido fuego esquivan más y
    // durante más tiempo. Es el aprendizaje defensivo del enjambre.
    this.caution = new Float32Array(maxCount)
    this.dodgeX = new Float32Array(maxCount)
    this.dodgeY = new Float32Array(maxCount)
    this.dodgeZ = new Float32Array(maxCount)
    this.collisionTimers = new Float32Array(maxCount)
    this.targetHealth = TARGET_MAX_HEALTH
    this.targetEnergy = TARGET_MAX_ENERGY
    this.aliveCount = this.count
    this.battleState = 'idle'
    this.attackPlan = 'dividido'
    this.orderedSquad = 0
    this.waveTimer = 0
    this.cannons = this._createCannons()
    this.pendingShots = []
    this.pendingKills = []
    this.pendingCollisions = 0

    // Bombas de expansión del objetivo.
    this.bombs = []
    this.bombStock = BOMB_COUNT
    this.bombCooldown = 0
    this.bombId = 0
    this.bombPlanTimer = 0
    this.bombInterceptions = 0
    this.interceptTarget = new Int32Array(maxCount).fill(-1)
    this.pendingBombs = []

    this.pendingImpacts = 0
    this.pendingBlocks = 0
    this.pendingPulses = 0

    // Rejilla espacial.
    this.cellSize = this.params.perception
    this.nx = Math.max(1, Math.ceil((PLAY_BOUNDS.x * 2) / this.cellSize))
    this.ny = Math.max(1, Math.ceil((PLAY_BOUNDS.y * 2) / this.cellSize))
    this.nz = Math.max(1, Math.ceil((PLAY_BOUNDS.z * 2) / this.cellSize))
    this.cellTotal = this.nx * this.ny * this.nz
    this.cellOf = new Int32Array(maxCount)
    this.cellCounts = new Int32Array(this.cellTotal)
    this.cellStart = new Int32Array(this.cellTotal + 1)
    this.cellCursor = new Int32Array(this.cellTotal)
    this.cellItems = new Int32Array(maxCount)
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8

    this.seed()
  }

  _createCannons() {
    const cannons = []
    for (let c = 0; c < CANNON_COUNT; c += 1) {
      cannons.push({
        index: c,
        dirX: c === 0 ? 1 : -1,
        dirY: 0,
        dirZ: 0,
        originX: 0,
        originY: 0,
        originZ: 0,
        aimX: 0,
        aimY: 0,
        aimZ: 0,
        lockIndex: -1,
        charge: 0,
        cooldown: 0.3 + c * 0.45,
        fireTimer: 0,
        dodgeTimer: 0,
      })
    }
    return cannons
  }

  _resetCannons() {
    for (const cannon of this.cannons) {
      cannon.charge = 0
      cannon.lockIndex = -1
      cannon.cooldown = Math.max(cannon.cooldown, 0.25)
    }
  }

  /** Reinicia el arsenal de bombas: 5 por ronda de combate. */
  _resetBombs() {
    this.bombs.length = 0
    this.bombStock = BOMB_COUNT
    this.bombCooldown = 0
    this.bombPlanTimer = 0
    this.bombInterceptions = 0
    this.pendingBombs.length = 0
    this.interceptTarget.fill(-1)
  }

  _recountAlive() {
    let alive = 0
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] > 0) alive += 1
    }
    this.aliveCount = alive
  }

  seed() {
    for (let i = 0; i < this.count; i += 1) this.respawn(i)
    this.target = null
    this.defense.reset()
    this.pendingImpacts = 0
    this.pendingBlocks = 0
    this.pendingLeaderDowns = []
<<<<<<< HEAD
    this.command.downTimers.fill(0)
=======
    this.pendingShots = []
    this.pendingKills = []
    this.pendingCollisions = 0
    this.downTimers.fill(0)
    this.threatTimers.fill(0)
    this.caution.fill(0)
    this.collisionTimers.fill(0)
    this.targetHealth = TARGET_MAX_HEALTH
    this.targetEnergy = TARGET_MAX_ENERGY
    this.battleState = 'idle'
    this.attackPlan = 'dividido'
    this.orderedSquad = 0
    this.waveTimer = 0
    this._resetCannons()
    this._resetBombs()
    this._recountAlive()
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
    this._recomputeSectorCounts()
    this.command.init()
    this._planStrategy()
  }

  /** Coloca un ave en un punto aleatorio del volumen, con velocidad inicial. */
  respawn(index) {
    const i3 = index * 3
    let x
    let y
    let z

    // Muestreo uniforme dentro de un elipsoide.
    do {
      x = this.rand(-1, 1)
      y = this.rand(-1, 1)
      z = this.rand(-1, 1)
    } while (x * x + y * y + z * z > 1)

    this.positions[i3] = x * BOUNDS.x * 0.58
    this.positions[i3 + 1] = y * BOUNDS.y * 0.58
    this.positions[i3 + 2] = z * BOUNDS.z * 0.58

    this.laneJitter[i3] = this.rand(-2.4, 2.4)
    this.laneJitter[i3 + 1] = this.rand(-2.4, 2.4)
    this.laneJitter[i3 + 2] = this.rand(-2.4, 2.4)

    const theta = this.rand(0, TAU)
    const cosPhi = this.rand(-1, 1)
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
    const speed = this.rand(2.5, 5.5)
    this.velocities[i3] = Math.cos(theta) * sinPhi * speed
    this.velocities[i3 + 1] = cosPhi * speed
    this.velocities[i3 + 2] = Math.sin(theta) * sinPhi * speed

    this.sectors[index] = index % SECTOR_COUNT
    this.states[index] = STATE.DISTRIBUTE
    this.stateTimers[index] = 0
<<<<<<< HEAD
    this.planTimers[index] = this.rand(0.2, 1.4)
=======
    this.planTimers[index] = rand(0.2, 1.4)
    this.health[index] = ATTACKER_MAX_HEALTH
    this.threatTimers[index] = 0
    this.caution[index] = 0
    this.collisionTimers[index] = 0
    this.downTimers[index] = 0
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
  }

  setCount(next) {
    const target = clamp(Math.round(next), 0, this.maxCount)
    if (target > this.count) {
      for (let i = this.count; i < target; i += 1) this.respawn(i)
    }
    this.count = target
<<<<<<< HEAD
    this.command.setCount(target)
=======
    this._recountAlive()
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
    this._recomputeSectorCounts()
    this.command.ensure()
  }

  /** Fija el objetivo y reinicia la defensa y la ronda de ataques. */
  setTarget(x, y, z) {
    this.target = { x, y, z }

    // El escudo inicial mira hacia el centro del enjambre.
    let cx = 0
    let cy = 0
    let cz = 0
    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3
      cx += this.positions[i3]
      cy += this.positions[i3 + 1]
      cz += this.positions[i3 + 2]
    }
    const invCount = this.count > 0 ? 1 / this.count : 0
    const dx = cx * invCount - x
    const dy = cy * invCount - y
    const dz = cz * invCount - z
    this.defense.setShield(dx, dy, dz)

    // Ronda nueva: todos los atacantes vuelven con salud completa y el
    // objetivo recupera salud y energía.
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) this.respawn(i)
      this.health[i] = ATTACKER_MAX_HEALTH
      this.threatTimers[i] = 0
      this.collisionTimers[i] = 0
    }
    this.targetHealth = TARGET_MAX_HEALTH
    this.targetEnergy = TARGET_MAX_ENERGY
    this.battleState = 'active'
    this.attackPlan = 'dividido'
    this.orderedSquad = 0
    this.waveTimer = 0
    this.pendingShots = []
    this.pendingKills = []
    this.pendingCollisions = 0
    this._resetCannons()
    this._resetBombs()
    this._recountAlive()

    for (let i = 0; i < this.count; i += 1) {
      if (this.command.isDown(i)) {
        this.states[i] = STATE.EVADE
        this.stateTimers[i] = this.command.getDownTime(i)
      } else {
        this.states[i] = STATE.DISTRIBUTE
        this.stateTimers[i] = 0
      }
      this.planTimers[i] = this.rand(0.1, 0.8)
    }

    this.defense.beginTarget()
    this.pendingImpacts = 0
    this.pendingBlocks = 0
    this._recomputeSectorCounts()
    this.strategyTimer = 0
    this._planStrategy()
  }

  clearTarget() {
    this.target = null
    this.defense.clear()
    this.pendingImpacts = 0
    this.pendingBlocks = 0
<<<<<<< HEAD
=======
    this.pendingPulses = 0
    this.pendingShots = []
    this.pendingKills = []
    this.pendingCollisions = 0
    this.battleState = 'idle'
    this.targetHealth = TARGET_MAX_HEALTH
    this.targetEnergy = TARGET_MAX_ENERGY
    this.threatTimers.fill(0)
    this.collisionTimers.fill(0)
    this._resetCannons()
    this._resetBombs()
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
    for (let i = 0; i < this.count; i += 1) {
      this.states[i] = STATE.DISTRIBUTE
      this.stateTimers[i] = 0
    }
  }

  /** Impactos, bloqueos del escudo y pulsos desde la última consulta. */
  consumeImpacts() {
    const impacts = this.pendingImpacts
    this.pendingImpacts = 0
    return impacts
  }

  consumeBlocks() {
    const blocks = this.pendingBlocks
    this.pendingBlocks = 0
    return blocks
  }

  consumePulses() {
    return this.defense.consumePulses()
  }

  /** Disparos desde la última consulta (trazadoras para la escena). */
  consumeShots() {
    const shots = this.pendingShots
    this.pendingShots = []
    return shots
  }

  /** Atacantes derribados desde la última consulta. */
  consumeKills() {
    const kills = this.pendingKills
    this.pendingKills = []
    return kills
  }

  /** Colisiones de atacantes contra el objetivo desde la última consulta. */
  consumeCollisions() {
    const collisions = this.pendingCollisions
    this.pendingCollisions = 0
    return collisions
  }

  getCombatInfo() {
    return {
      targetHealth: this.targetHealth,
      targetEnergy: this.targetEnergy,
      maxHealth: TARGET_MAX_HEALTH,
      maxEnergy: TARGET_MAX_ENERGY,
      alive: this.aliveCount,
      total: this.count,
      plan: this.attackPlan,
      orderedSquad: this.orderedSquad,
      battleState: this.battleState,
      bombStock: this.bombStock,
      bombMax: BOMB_COUNT,
      bombActive: this.bombs.length,
      bombInterceptors: this.bombInterceptions,
      bombs: this.bombs.map((bomb) => ({
        id: bomb.id,
        x: bomb.x,
        y: bomb.y,
        z: bomb.z,
        vx: bomb.vx,
        vy: bomb.vy,
        vz: bomb.vz,
        aimX: bomb.aimX,
        aimY: bomb.aimY,
        aimZ: bomb.aimZ,
        fuse: bomb.fuse,
        arm: bomb.arm,
        interceptors: bomb.interceptors,
      })),
      cannons: this.cannons.map((cannon) => ({
        charge: cannon.charge,
        cooldown: cannon.cooldown,
        firing: cannon.lockIndex >= 0,
        dirX: cannon.dirX,
        dirY: cannon.dirY,
        dirZ: cannon.dirZ,
        aimX: cannon.aimX,
        aimY: cannon.aimY,
        aimZ: cannon.aimZ,
        originX: cannon.originX,
        originY: cannon.originY,
        originZ: cannon.originZ,
      })),
    }
  }

  /** Cantidad de aves en cada estado de la FSM. */
  getStateCounts() {
    const counts = new Array(STATE_COUNT).fill(0)
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      counts[this.states[i]] += 1
    }
    return counts
  }

  /** Código único de cada ave: escuadrón + rango. */
  getCode(index) {
    return this.command.getCode(index)
  }

  isLeader(index) {
    return this.command.isLeader(index)
  }

  getLeaderIndices() {
    return this.command.getLeaderIndices()
  }

  getCommandInfo() {
    const info = this.command.getInfo()
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      info.squads[s].sector = this.squadSectors[s]
    }
<<<<<<< HEAD
    return {
      ...info,
      stance:
        this.target &&
        this.params.defense > 0.05 &&
        this.defense.pulseCharge > RETREAT_CHARGE
          ? 'repliegue'
          : 'flanqueo',
    }
=======
    return false
  }

  /**
   * Registra un evento de mando. El texto se guarda como clave para que la
   * interfaz lo traduzca según el idioma activo.
   */
  _log(key, params = null) {
    this.commandLog.unshift(params ? { key, params } : { key })
    if (this.commandLog.length > 4) this.commandLog.length = 4
  }

  _findSquadLeader(squad, exclude = -1) {
    for (let i = squad; i < this.count; i += SQUAD_COUNT) {
      if (i !== exclude && this.downTimers[i] <= 0) return i
    }
    return -1
  }

  /** El siguiente código activo del escuadrón tras el líder derribado. */
  _nextSquadLeader(squad, currentIndex) {
    for (let i = currentIndex + SQUAD_COUNT; i < this.count; i += SQUAD_COUNT) {
      if (this.downTimers[i] <= 0) return i
    }
    // Si no queda ningún código posterior activo, se cierra el círculo.
    for (let i = squad; i < currentIndex; i += SQUAD_COUNT) {
      if (this.downTimers[i] <= 0) return i
    }
    return -1
  }

  _selectCommander() {
    let best = -1
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const leader = this.leaderOfSquad[s]
      if (leader >= 0 && (best < 0 || leader < best)) best = leader
    }
    // Si todos los escuadrones quedan sin líder, el código activo más
    // antiguo asume el mando: la cadena nunca se rompe.
    if (best < 0) {
      for (let i = 0; i < this.count; i += 1) {
        if (this.downTimers[i] <= 0) {
          best = i
          break
        }
      }
    }
    this.commander = best
  }

  _initCommand() {
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      this.leaderOfSquad[s] = this._findSquadLeader(s)
    }
    this._selectCommander()
    this.commandVersion += 1
    this.commandLog = []
    const code = this.commander >= 0 ? this.getCode(this.commander) : ''
    this._log('log.commandInit', { code })
  }

  _ensureCommand() {
    let changed = false
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const leader = this.leaderOfSquad[s]
      if (
        leader < 0 ||
        leader >= this.count ||
        this.downTimers[leader] > 0
      ) {
        this.leaderOfSquad[s] = this._findSquadLeader(s, leader)
        changed = true
      }
    }
    if (
      this.commander < 0 ||
      this.commander >= this.count ||
      this.downTimers[this.commander] > 0
    ) {
      this._selectCommander()
      changed = true
    }
    if (changed) this.commandVersion += 1
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
  }

  /**
   * Derribo de un líder. El siguiente código de su escuadrón asume el rol
   * y, si era el comandante, el líder más antiguo toma el mando global.
   */
  _downLeader(index) {
    const event = this.command.downLeader(index)
    if (!event) return

    this.stateTimers[index] = Math.max(
      this.stateTimers[index],
      this.command.getDownTime(index),
    )
    this.states[index] = STATE.EVADE

    const i3 = index * 3
    this.pendingLeaderDowns.push({
      x: this.positions[i3],
      y: this.positions[i3 + 1],
      z: this.positions[i3 + 2],
    })

<<<<<<< HEAD
=======
    if (wasSquad >= 0) {
      const nextLeader = this._nextSquadLeader(wasSquad, index)
      this.leaderOfSquad[wasSquad] = nextLeader
      const oldCode = this.getCode(index)
      const nextCode = nextLeader >= 0 ? this.getCode(nextLeader) : ''
      this._log(
        nextCode
          ? 'log.leaderDown'
          : 'log.leaderDownNoSuccessor',
        { code: oldCode, next: nextCode, squad: SQUAD_LETTERS[wasSquad] },
      )
    }

    this._selectCommander()
    if (wasCommander && this.commander !== index) {
      if (this.commander >= 0) {
        this._log('log.commander', { code: this.getCode(this.commander) })
      } else {
        this._log('log.noSuccessor')
      }
    }

>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
    this.strategyTimer = 0
  }

  /** Derribo definitivo de un atacante: su salud llega a cero. */
  _killAttacker(index, quiet = false) {
    if (index < 0 || index >= this.count || this.health[index] <= 0) return
    this.health[index] = 0
    this.downTimers[index] = Infinity
    this.states[index] = STATE.EVADE
    this.threatTimers[index] = 0
    this.collisionTimers[index] = 0
    this.aliveCount = Math.max(0, this.aliveCount - 1)

    const i3 = index * 3
    this.pendingKills.push({
      x: this.positions[i3],
      y: this.positions[i3 + 1],
      z: this.positions[i3 + 2],
      index,
    })

    if (!quiet) {
      this._ensureCommand()
      this._recomputeSectorCounts()
    }
  }

  _checkBattleState() {
    if (this.battleState !== 'active') return
    if (this.targetHealth <= 0) {
      this.targetHealth = 0
      this.battleState = 'target-down'
      this._log('log.targetDown')
      this._resetCannons()
      this._clearBombs()
      for (let i = 0; i < this.count; i += 1) {
        if (this.health[i] <= 0) continue
        this.states[i] = STATE.DISTRIBUTE
        this.stateTimers[i] = 0
      }
      return
    }
    if (this.aliveCount <= 0) {
      this.battleState = 'swarm-down'
      this._log('log.swarmDown')
      this._resetCannons()
      this._clearBombs()
    }
  }

  /** Retira las bombas en vuelo sin detonarlas (fin de la batalla). */
  _clearBombs() {
    if (this.bombs.length === 0) return
    this.bombs.length = 0
    this.interceptTarget.fill(-1)
    this.bombInterceptions = 0
  }

  _aimCannon(cannon, x, y, z, dt, speed) {
    let dx = x - cannon.originX
    let dy = y - cannon.originY
    let dz = z - cannon.originZ
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (length < 0.0001) return
    dx /= length
    dy /= length
    dz /= length

    const k = 1 - Math.exp(-dt * speed)
    cannon.dirX += (dx - cannon.dirX) * k
    cannon.dirY += (dy - cannon.dirY) * k
    cannon.dirZ += (dz - cannon.dirZ) * k
    const dirLength = Math.sqrt(
      cannon.dirX * cannon.dirX +
        cannon.dirY * cannon.dirY +
        cannon.dirZ * cannon.dirZ,
    )
    if (dirLength > 0.0001) {
      cannon.dirX /= dirLength
      cannon.dirY /= dirLength
      cannon.dirZ /= dirLength
    }
  }

  /** Elige al atacante más peligroso dentro del alcance del cañón. */
  _pickCannonTarget(cannon) {
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const dx = this.positions[i3] - cannon.originX
      const dy = this.positions[i3 + 1] - cannon.originY
      const dz = this.positions[i3 + 2] - cannon.originZ
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > CANNON_RANGE) continue

      let score = dist * 0.35 + Math.random() * 4
      if (this.states[i] === STATE.DIVE) score -= 10
      // Fuego de concentración: remata a los atacantes ya dañados.
      score -= (ATTACKER_MAX_HEALTH - this.health[i]) * 10
      // Evita que los dos cañones persigan a la misma ave.
      for (const other of this.cannons) {
        if (other !== cannon && other.lockIndex === i) {
          score += 35
          break
        }
      }
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }

  /** Vector perpendicular al haz: la dirección en la que se esquiva. */
  _dodgeVector(cannon, index) {
    const i3 = index * 3
    const vx = this.velocities[i3]
    const vy = this.velocities[i3 + 1]
    const vz = this.velocities[i3 + 2]

    let px = cannon.dirY * vz - cannon.dirZ * vy
    let py = cannon.dirZ * vx - cannon.dirX * vz
    let pz = cannon.dirX * vy - cannon.dirY * vx
    let length = Math.sqrt(px * px + py * py + pz * pz)
    if (length < 0.001) {
      px = -cannon.dirZ
      py = cannon.dirY * 0.4
      pz = cannon.dirX
      length = Math.sqrt(px * px + py * py + pz * pz) || 1
    }
    const sign = Math.random() < 0.5 ? -1 : 1
    return {
      x: (px / length) * sign,
      y: (py / length) * sign,
      z: (pz / length) * sign,
    }
  }

  /** Reelige el lado de la esquiva: el ave cambia de rumbo durante la ráfaga. */
  _wanderDodge(cannon, index) {
    const dir = this._dodgeVector(cannon, index)
    this.dodgeX[index] = dir.x
    this.dodgeY[index] = dir.y
    this.dodgeZ[index] = dir.z

    // Impulso lateral: es lo que saca al ave del haz de la metralleta.
    const i3 = index * 3
    const kick = 4 + this.caution[index] * 2
    this.velocities[i3] += dir.x * kick
    this.velocities[i3 + 1] += dir.y * kick
    this.velocities[i3 + 2] += dir.z * kick
  }

  /** Marca una amenaza de disparo: el ave objetivo y sus vecinas esquivan. */
  _alertDodge(cannon, index) {
    const dir = this._dodgeVector(cannon, index)
    const px = dir.x
    const py = dir.y
    const pz = dir.z

    this.threatTimers[index] = CANNON_AIM_TIME + 0.35
    this.dodgeX[index] = px
    this.dodgeY[index] = py
    this.dodgeZ[index] = pz

    // Salidaimmediate del haz: el ave que detecta el fuego se aparta.
    const i3 = index * 3
    const kick = 7 + this.caution[index] * 2.5
    this.velocities[i3] += px * kick
    this.velocities[i3 + 1] += py * kick
    this.velocities[i3 + 2] += pz * kick

    // Las aves cercanas al punto de mira también detectan el disparo.
    const alertSq = DODGE_ALERT_RADIUS * DODGE_ALERT_RADIUS
    for (let i = 0; i < this.count; i += 1) {
      if (i === index || this.health[i] <= 0) continue
      const j3 = i * 3
      const dx = this.positions[j3] - cannon.aimX
      const dy = this.positions[j3 + 1] - cannon.aimY
      const dz = this.positions[j3 + 2] - cannon.aimZ
      if (dx * dx + dy * dy + dz * dz > alertSq) continue
      this.threatTimers[i] = Math.max(this.threatTimers[i], 0.45)
      this.dodgeX[i] = px + (Math.random() - 0.5) * 0.7
      this.dodgeY[i] = py + (Math.random() - 0.5) * 0.7
      this.dodgeZ[i] = pz + (Math.random() - 0.5) * 0.7
    }
  }

  _fireCannon(cannon) {
    const ox = cannon.originX
    const oy = cannon.originY
    const oz = cannon.originZ
    const dx = cannon.dirX
    const dy = cannon.dirY
    const dz = cannon.dirZ

    let hit = -1
    let hitT = Infinity
    const radiusSq = SHOT_RADIUS * SHOT_RADIUS

    // El disparo prioriza al atacante bloqueado: si no esquiva a tiempo,
    // recibe el impacto aunque otro cruce la línea.
    const lock = cannon.lockIndex
    if (lock >= 0 && lock < this.count && this.health[lock] > 0) {
      const l3 = lock * 3
      const rx = this.positions[l3] - ox
      const ry = this.positions[l3 + 1] - oy
      const rz = this.positions[l3 + 2] - oz
      const t = rx * dx + ry * dy + rz * dz
      if (t >= 0.4 && t <= CANNON_RANGE) {
        const cx = rx - dx * t
        const cy = ry - dy * t
        const cz = rz - dz * t
        if (cx * cx + cy * cy + cz * cz <= radiusSq) {
          hit = lock
          hitT = t
        }
      }
    }

    if (hit < 0) {
      for (let i = 0; i < this.count; i += 1) {
        if (this.health[i] <= 0) continue
        const i3 = i * 3
        const rx = this.positions[i3] - ox
        const ry = this.positions[i3 + 1] - oy
        const rz = this.positions[i3 + 2] - oz
        const t = rx * dx + ry * dy + rz * dz
        if (t < 0.4 || t > CANNON_RANGE || t >= hitT) continue
        const cx = rx - dx * t
        const cy = ry - dy * t
        const cz = rz - dz * t
        if (cx * cx + cy * cy + cz * cz > radiusSq) continue
        hit = i
        hitT = t
      }
    }

    const shotLength = Math.min(
      CANNON_RANGE,
      Number.isFinite(hitT)
        ? hitT
        : Math.hypot(
            cannon.aimX - ox,
            cannon.aimY - oy,
            cannon.aimZ - oz,
          ) + 8,
    )
    const ex = ox + dx * shotLength
    const ey = oy + dy * shotLength
    const ez = oz + dz * shotLength

    this.pendingShots.push({
      x1: ox,
      y1: oy,
      z1: oz,
      x2: ex,
      y2: ey,
      z2: ez,
      hit: hit >= 0,
    })

    if (hit >= 0) {
      // El ave que recibe fuego aprende: esquivará más y más lejos.
      this.caution[hit] = Math.min(3, this.caution[hit] + 1)
      const nextHealth = this.health[hit] - SHOT_DAMAGE
      if (nextHealth <= 0) {
        this._killAttacker(hit)
      } else {
        this.health[hit] = nextHealth
      }
    }
  }

  _updateCannon(cannon, dt) {
    const target = this.target
    const mount = CANNON_MOUNTS[cannon.index]
    cannon.originX = target.x + mount.x
    cannon.originY = target.y + mount.y
    cannon.originZ = target.z + mount.z
    cannon.cooldown = Math.max(0, cannon.cooldown - dt)

    // --- Ráfaga en curso: la metralleta mantiene el mismo blanco ---
    if (cannon.lockIndex >= 0) {
      const index = cannon.lockIndex
      if (
        index >= this.count ||
        this.health[index] <= 0 ||
        this.targetEnergy < CANNON_ENERGY_COST
      ) {
        cannon.lockIndex = -1
        cannon.charge = 0
      } else {
        const i3 = index * 3
        const dist = Math.hypot(
          this.positions[i3] - cannon.originX,
          this.positions[i3 + 1] - cannon.originY,
          this.positions[i3 + 2] - cannon.originZ,
        )
        if (dist > CANNON_RANGE) {
          cannon.lockIndex = -1
          cannon.charge = 0
        } else {
          // Adelanto corto: el ave que esquiva puede salirse del haz.
          const lead = Math.min(0.12, dist / 220)
          cannon.aimX = this.positions[i3] + this.velocities[i3] * lead
          cannon.aimY =
            this.positions[i3 + 1] + this.velocities[i3 + 1] * lead
          cannon.aimZ =
            this.positions[i3 + 2] + this.velocities[i3 + 2] * lead

          cannon.charge = Math.min(1, cannon.charge + dt / CANNON_AIM_TIME)
          this._aimCannon(cannon, cannon.aimX, cannon.aimY, cannon.aimZ, dt, 6)

          if (cannon.charge >= 1) {
            // El blanco sigue amenazado: la alerta se mantiene viva.
            this.threatTimers[index] = CANNON_AIM_TIME + 0.3
            cannon.dodgeTimer -= dt
            if (cannon.dodgeTimer <= 0) {
              cannon.dodgeTimer = 0.28
              this._wanderDodge(cannon, index)
            }

            cannon.fireTimer -= dt
            if (cannon.fireTimer <= 0) {
              cannon.fireTimer = CANNON_FIRE_INTERVAL
              this._fireCannon(cannon)
              this.targetEnergy = Math.max(
                0,
                this.targetEnergy - CANNON_ENERGY_COST,
              )
            }
          }
          return
        }
      }
    }

    // --- Nuevo blanco ---
    if (
      cannon.cooldown > 0 ||
      this.targetEnergy < Math.max(CANNON_ENERGY_COST, CANNON_BURST_ENERGY)
    ) {
      return
    }

    const index = this._pickCannonTarget(cannon)
    if (index < 0) return

    const i3 = index * 3
    const dist = Math.hypot(
      this.positions[i3] - cannon.originX,
      this.positions[i3 + 1] - cannon.originY,
      this.positions[i3 + 2] - cannon.originZ,
    )
    const lead = Math.min(0.2, dist / 220)
    cannon.lockIndex = index
    cannon.aimX = this.positions[i3] + this.velocities[i3] * lead
    cannon.aimY = this.positions[i3 + 1] + this.velocities[i3 + 1] * lead
    cannon.aimZ = this.positions[i3 + 2] + this.velocities[i3 + 2] * lead
    cannon.charge = 0.001
    cannon.fireTimer = 0
    cannon.dodgeTimer = 0
    this._alertDodge(cannon, index)
  }

  _updateCombat(dt) {
    const target = this.target
    if (!target || this.battleState !== 'active') {
      this._resetCannons()
      return
    }

    this.targetEnergy = Math.min(
      TARGET_MAX_ENERGY,
      this.targetEnergy + ENERGY_REGEN * dt,
    )

    for (let i = 0; i < this.count; i += 1) {
      if (this.threatTimers[i] > 0) {
        this.threatTimers[i] = Math.max(0, this.threatTimers[i] - dt)
      }
      if (this.collisionTimers[i] > 0) {
        this.collisionTimers[i] = Math.max(0, this.collisionTimers[i] - dt)
      }
      if (this.caution[i] > 0) {
        this.caution[i] = Math.max(0, this.caution[i] - dt * 0.15)
      }
    }

    if (this.attackPlan === 'ordenado') {
      this.waveTimer -= dt
      if (this.waveTimer <= 0) {
        this.waveTimer = 2.6 + Math.random() * 0.8
        this.orderedSquad = (this.orderedSquad + 2) % SQUAD_COUNT
      }
    }

    for (const cannon of this.cannons) this._updateCannon(cannon, dt)
    this._updateBombs(dt)
    this._checkBattleState()
  }

  /** Eventos de bomba (lanzamiento, explosión, derribo) desde la última consulta. */
  consumeBombs() {
    const events = this.pendingBombs
    this.pendingBombs = []
    return events
  }

  /**
   * Lanza una bomba de expansión hacia el centro del racimo de atacantes.
   * La bomba es lenta: el enjambre tiene tiempo de detectarla y planear
   * su derribo antes de que detone.
   */
  _launchBomb() {
    const target = this.target
    if (!target) return false

    // Centroide del grupo más concentrado: se toman los atacantes más
    // cercanos al objetivo, que son los que forman el racimo principal.
    const reach = 46
    const near = []
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const dx = this.positions[i3] - target.x
      const dy = this.positions[i3 + 1] - target.y
      const dz = this.positions[i3 + 2] - target.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq > reach * reach) continue
      near.push({ i, distSq })
    }
    if (near.length < 4) return false

    near.sort((a, b) => a.distSq - b.distSq)
    const core = near.slice(0, Math.max(5, Math.floor(near.length * 0.3)))

    let sumX = 0
    let sumY = 0
    let sumZ = 0
    for (const entry of core) {
      const i3 = entry.i * 3
      sumX += this.positions[i3]
      sumY += this.positions[i3 + 1]
      sumZ += this.positions[i3 + 2]
    }

    // El punto de detonación nunca pegado al objetivo: la bomba tiene que
    // volar y ofrecer una ventana de derribo.
    let ox = sumX / core.length - target.x
    let oy = sumY / core.length - target.y
    let oz = sumZ / core.length - target.z
    let oLen = Math.hypot(ox, oy, oz)
    if (oLen < 0.001) {
      const theta = Math.random() * TAU
      const phi = Math.acos(rand(-1, 1))
      ox = Math.sin(phi) * Math.cos(theta)
      oy = Math.cos(phi)
      oz = Math.sin(phi) * Math.sin(theta)
      oLen = 1
    }

    // Dispersión del punto de impacto y, después, distancia mínima:
    // así la bomba siempre ofrece tiempo de vuelo para ser interceptada.
    ox += rand(-4, 4)
    oy += rand(-3, 3)
    oz += rand(-4, 4)
    oLen = Math.hypot(ox, oy, oz) || 1
    if (oLen < BOMB_MIN_RANGE) {
      const k = BOMB_MIN_RANGE / oLen
      ox *= k
      oy *= k
      oz *= k
    }

    const aimX = target.x + ox
    const aimY = target.y + oy
    const aimZ = target.z + oz

    const dx = aimX - target.x
    const dy = aimY - target.y
    const dz = aimZ - target.z
    const distance = Math.hypot(dx, dy, dz) || 1

    this.bombId += 1
    this.bombs.push({
      id: this.bombId,
      x: target.x + dx * 0.1,
      y: target.y + dy * 0.1,
      z: target.z + dz * 0.1,
      vx: (dx / distance) * BOMB_SPEED,
      vy: (dy / distance) * BOMB_SPEED,
      vz: (dz / distance) * BOMB_SPEED,
      aimX,
      aimY,
      aimZ,
      fuse: BOMB_FUSE,
      arm: BOMB_ARM_TIME,
      interceptors: 0,
      detected: false,
      rammed: false,
    })

    this.bombStock -= 1
    this.targetEnergy = Math.max(0, this.targetEnergy - BOMB_ENERGY_COST)
    this.bombCooldown = BOMB_COOLDOWN
    this.pendingBombs.push({
      type: 'launch',
      x: target.x,
      y: target.y,
      z: target.z,
      id: this.bombId,
    })
    this._log('log.bombLaunched')
    return true
  }

  /** Detonación: daña a todos los atacantes dentro del radio. */
  _detonateBomb(bomb) {
    const radiusSq = BOMB_RADIUS * BOMB_RADIUS
    let hit = 0

    // La explosión es letal: destruye todo lo que quede dentro del radio.
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const dx = this.positions[i3] - bomb.x
      const dy = this.positions[i3 + 1] - bomb.y
      const dz = this.positions[i3 + 2] - bomb.z
      if (dx * dx + dy * dy + dz * dz > radiusSq) continue

      hit += 1
      // La explosión también deja huella: el ave memoriza el peligro.
      this.caution[i] = Math.min(3, this.caution[i] + 1.5)
      this._killAttacker(i, true)
    }

    if (hit > 0) {
      this._ensureCommand()
      this._recomputeSectorCounts()
    }

    // El aviso de la explosión llega a las aves vecinas: el enjambre entero
    // aprende a abrir la formación y a no amontonarse en la zona de impacto.
    const warnSq = (BOMB_RADIUS * 2.2) * (BOMB_RADIUS * 2.2)
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const dx = this.positions[i3] - bomb.x
      const dy = this.positions[i3 + 1] - bomb.y
      const dz = this.positions[i3 + 2] - bomb.z
      if (dx * dx + dy * dy + dz * dz > warnSq) continue
      this.caution[i] = Math.min(3, this.caution[i] + 0.5)
    }

    this.pendingBombs.push({
      type: 'explode',
      x: bomb.x,
      y: bomb.y,
      z: bomb.z,
      radius: BOMB_RADIUS,
      hits: hit,
    })
    if (hit > 0) {
      this._log('log.bombDetonate', { n: hit })
    } else {
      this._log('log.bombDetonateEmpty')
    }
  }

  /**
   * La bomba solo puede detonar si el objetivo está fuera de su radio de
   * alcance: el objetivo nunca puede blowing itself up.
   */
  _bombCanDetonate(bomb) {
    const target = this.target
    if (!target) return true
    const dx = bomb.x - target.x
    const dy = bomb.y - target.y
    const dz = bomb.z - target.z
    return dx * dx + dy * dy + dz * dz > BOMB_RADIUS * BOMB_RADIUS
  }

  /**
   * El enjambre detecta las bombas y planifica su derribo: las aves más
   * cercanas a cada bomba pasan a `INTERCEPT` y chocan contra ella.
   */
  _planInterceptions() {
    if (this.bombs.length === 0) {
      if (this.bombInterceptions > 0) {
        this.bombInterceptions = 0
        this.interceptTarget.fill(-1)
      }
      return
    }

    // Aves libres y aves ya asignadas a cada bomba.
    const free = []
    const assignedTo = new Map()
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const id = this.interceptTarget[i]
      if (id < 0) {
        free.push(i)
        continue
      }
      const list = assignedTo.get(id)
      if (list) list.push(i)
      else assignedTo.set(id, [i])
    }

    const taken = new Set()

    for (const bomb of this.bombs) {
      const already = assignedTo.get(bomb.id) || []
      let assignedCount = already.length

      if (assignedCount < BOMB_MAX_INTERCEPTORS) {
        // Se ordenan los candidatos por distancia a la bomba, penalizando a
        // los que están dentro del radio de explosión: el enjambre embiste
        // desde fuera para que la detonación alcance a menos aves.
        const near = []
        for (const i of free) {
          if (taken.has(i)) continue
          const i3 = i * 3
          const dx = this.positions[i3] - bomb.x
          const dy = this.positions[i3 + 1] - bomb.y
          const dz = this.positions[i3 + 2] - bomb.z
          const distSq = dx * dx + dy * dy + dz * dz
          if (distSq > BOMB_DETECT_RADIUS * BOMB_DETECT_RADIUS) continue

          const ax = this.positions[i3] - bomb.aimX
          const ay = this.positions[i3 + 1] - bomb.aimY
          const az = this.positions[i3 + 2] - bomb.aimZ
          const inBlast =
            ax * ax + ay * ay + az * az < BOMB_RADIUS * BOMB_RADIUS

          near.push({ i, score: Math.sqrt(distSq) + (inBlast ? 14 : 0) })
        }
        near.sort((a, b) => a.score - b.score)

        for (const entry of near) {
          if (assignedCount >= BOMB_MAX_INTERCEPTORS) break
          this.interceptTarget[entry.i] = bomb.id
          this.states[entry.i] = STATE.INTERCEPT
          this.stateTimers[entry.i] = 2.5
          taken.add(entry.i)
          assignedCount += 1
        }
      }

      bomb.interceptors = assignedCount
      if (assignedCount > 0 && !bomb.detected) {
        bomb.detected = true
        this._log('log.bombDetected', { n: assignedCount })
      }
    }

    let total = 0
    for (const bomb of this.bombs) total += bomb.interceptors
    this.bombInterceptions = total
  }

  /** Actualiza el vuelo de las bombas, los derribos y las detonaraciones. */
  _updateBombs(dt) {
    if (this.bombs.length === 0 && this.bombStock <= 0) return

    this.bombCooldown = Math.max(0, this.bombCooldown - dt)
    this.bombPlanTimer -= dt
    if (this.bombPlanTimer <= 0) {
      this.bombPlanTimer = 0.25
      this._planInterceptions()
    }

    if (
      this.bombs.length === 0 &&
      this.bombStock > 0 &&
      this.bombCooldown <= 0 &&
      this.targetEnergy >= BOMB_ENERGY_COST
    ) {
      this._launchBomb()
    }

    if (this.bombs.length === 0) return

    const interceptSq = BOMB_INTERCEPT_RADIUS * BOMB_INTERCEPT_RADIUS

    for (let b = this.bombs.length - 1; b >= 0; b -= 1) {
      const bomb = this.bombs[b]
      bomb.x += bomb.vx * dt
      bomb.y += bomb.vy * dt
      bomb.z += bomb.vz * dt
      bomb.fuse -= dt
      // La bomba se arma al salir: durante ese tiempo no se puede derribar.
      if (bomb.arm > 0) bomb.arm = Math.max(0, bomb.arm - dt)

      // Un atacante que choca contra la bomba intenta derribarla.
      let downed = -1
      if (bomb.arm <= 0 && !bomb.rammed) {
        for (let i = 0; i < this.count; i += 1) {
          if (this.health[i] <= 0) continue
          const i3 = i * 3
          const dx = this.positions[i3] - bomb.x
          const dy = this.positions[i3 + 1] - bomb.y
          const dz = this.positions[i3 + 2] - bomb.z
          if (dx * dx + dy * dy + dz * dz > interceptSq) continue
          downed = i
          break
        }
      }

      if (downed >= 0) {
        bomb.rammed = true
        this.pendingBombs.push({
          type: 'intercept',
          x: bomb.x,
          y: bomb.y,
          z: bomb.z,
          index: downed,
        })

        if (this._bombCanDetonate(bomb)) {
          // La bomba detona igual: embestirla solo adelanta la explosión y la
          // aparta del centro del racimo, donde el daño alcanza a menos aves.
          this.bombs.splice(b, 1)
          this._detonateBomb(bomb)
        } else {
          // El objetivo está dentro del radio de alcance: la bomba no puede
          // detonar aquí y sigue su vuelo hasta salir de ese radio.
          this._log('log.bombResisted')
        }

        // El ave que embiste la bomba sale despedida.
        this.states[downed] = STATE.EVADE
        this.stateTimers[downed] = 0.5 + Math.random() * 0.4
        this.interceptTarget[downed] = -1
        continue
      }

      const dx = bomb.aimX - bomb.x
      const dy = bomb.aimY - bomb.y
      const dz = bomb.aimZ - bomb.z
      const remaining = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (remaining < 2.5 || bomb.fuse <= 0) {
        if (this._bombCanDetonate(bomb)) {
          this.bombs.splice(b, 1)
          this._detonateBomb(bomb)
        } else if (bomb.fuse <= 0) {
          // La mecha se agota pegada al objetivo: la bomba sigue volando
          // hasta que pueda detonar fuera de su radio de alcance.
          bomb.fuse = 1
        }
      }
    }

    // Limpia las asignaciones de interceptores a bombas que ya no existen.
    const ids = new Set(this.bombs.map((bomb) => bomb.id))
    for (let i = 0; i < this.count; i += 1) {
      const id = this.interceptTarget[i]
      if (id < 0) continue
      if (!ids.has(id)) {
        this.interceptTarget[i] = -1
        if (this.states[i] === STATE.INTERCEPT) {
          this.states[i] = STATE.DISTRIBUTE
          this.stateTimers[i] = 0
        }
      }
    }

    this._planInterceptions()
  }

  consumeLeaderDowns() {
    const events = this.pendingLeaderDowns
    this.pendingLeaderDowns = []
    return events
  }

<<<<<<< HEAD
=======
  getLeaderIndices() {
    return Array.from(this.leaderOfSquad)
  }

  getCommandInfo() {
    const squads = []
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const index = this.leaderOfSquad[s]
      squads.push({
        letter: SQUAD_LETTERS[s],
        sector: this.squadSectors[s],
        leader:
          index >= 0
            ? {
                index,
                code: this.getCode(index),
                isCommander: index === this.commander,
              }
            : null,
      })
    }

    return {
      commander:
        this.commander >= 0
          ? {
              index: this.commander,
              code: this.getCode(this.commander),
            }
          : null,
      squads,
      stance:
        this.target && this.params.defense > 0.05 && this.pulseCharge > 0.55
          ? 'repliegue'
          : 'flanqueo',
      plan: this.attackPlan,
      alive: this.aliveCount,
      targetHealth: this.targetHealth,
      targetEnergy: this.targetEnergy,
      battleState: this.battleState,
      bombStock: this.bombStock,
      bombMax: BOMB_COUNT,
      bombActive: this.bombs.length,
      bombInterceptors: this.bombInterceptions,
      log: this.commandLog.slice(0, 3),
      version: this.commandVersion,
    }
  }

>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
  /**
   * Los líderes acuerdan un sector distinto para cada escuadrón evitando
   * el escudo y repartiendo la presión. Esa orden sesga el juego de cada ave.
   */
  _planStrategy() {
<<<<<<< HEAD
    this.sectorGame.planStrategy({
      count: this.count,
      shield: this.defense.shield,
      params: this.params,
      commander: this.command.commander,
      squadSectors: this.squadSectors,
      random: this.random,
    })
=======
    const used = new Array(SECTOR_COUNT).fill(false)
    const order = []
    const commanderSquad =
      this.commander >= 0 ? this.commander % SQUAD_COUNT : 0

    order.push(commanderSquad)
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      if (s !== commanderSquad) order.push(s)
    }

    const average = Math.max(1, this.count / SECTOR_COUNT)
    const shield = this.shield

    for (const squad of order) {
      let best = -1
      let bestScore = -Infinity

      for (let s = 0; s < SECTOR_COUNT; s += 1) {
        if (used[s]) continue
        const dir = SECTOR_DIRS[s]
        const shieldDot =
          dir.x * shield.x + dir.y * shield.y + dir.z * shield.z
        let risk = 0
        if (shieldDot > SHIELD_COS) {
          risk = (shieldDot - SHIELD_COS) / (1 - SHIELD_COS)
          risk *= risk
        }
        const crowd = this.sectorCounts[s] / average

        // Los líderes también evitan alinearse con la línea de fuego.
        let cannonRisk = 0
        for (const cannon of this.cannons) {
          if (cannon.lockIndex < 0) continue
          const dot =
            dir.x * cannon.dirX + dir.y * cannon.dirY + dir.z * cannon.dirZ
          if (dot > 0.7) {
            const r = (dot - 0.7) / 0.3
            if (r * r > cannonRisk) cannonRisk = r * r
          }
        }

        const score =
          -risk * 4.5 -
          cannonRisk * 3.2 -
          crowd * 0.35 * (1 + this.params.distribution) +
          Math.random() * 0.4
        if (score > bestScore) {
          bestScore = score
          best = s
        }
      }

      if (best >= 0) {
        used[best] = true
        this.squadSectors[squad] = best
      }
    }

    if (this.target) {
      // Plan de ataque: ordenado (oleadas de dos escuadrones) mientras la
      // metralleta está disparando y el enjambre está entero; dividido
      // (todos los flancos a la vez) cuando el objetivo recarga o ha
      // suffered muchas bajas.
      const gunHot = this.cannons.some((cannon) => cannon.lockIndex >= 0)
      const manyLost = this.aliveCount < this.count * 0.55
      const nextPlan = gunHot && !manyLost ? 'ordenado' : 'dividido'
      if (nextPlan !== this.attackPlan) {
        this.attackPlan = nextPlan
        this.waveTimer = 0
        this._log(
          nextPlan === 'ordenado' ? 'log.planOrdered' : 'log.planDivided',
        )
      }
    }

>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
    this.strategyVersion += 1
  }

  _updateStrategy(dt) {
    if (!this.target || this.battleState !== 'active') return
    this.strategyTimer -= dt
    if (this.strategyTimer <= 0) {
      this.strategyTimer = STRATEGY_INTERVAL + this.random() * 0.8
      this._planStrategy()
    }
  }

  scatter() {
    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3
      const theta = this.rand(0, TAU)
      const cosPhi = this.rand(-1, 1)
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
      const kick = this.rand(4, 10)
      this.velocities[i3] += Math.cos(theta) * sinPhi * kick
      this.velocities[i3 + 1] += cosPhi * kick
      this.velocities[i3 + 2] += Math.sin(theta) * sinPhi * kick

      this.positions[i3] += this.rand(-1, 1) * 2
      this.positions[i3 + 1] += this.rand(-1, 1) * 2
      this.positions[i3 + 2] += this.rand(-1, 1) * 2

      this.states[i] = STATE.DISTRIBUTE
      this.stateTimers[i] = 0
      this.planTimers[i] = this.rand(0.2, 0.9)
    }
  }

  _recomputeSectorCounts() {
<<<<<<< HEAD
    this.sectorGame.recompute(this.count, this.states, this.sectors)
=======
    this.sectorCounts.fill(0)
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const state = this.states[i]
      if (state !== STATE.RETREAT && state !== STATE.EVADE) {
        this.sectorCounts[this.sectors[i]] += 1
      }
    }
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
  }

  /** Mejor respuesta de un ave en el juego de congestión. */
  _bestResponse(index) {
<<<<<<< HEAD
    this.sectorGame.bestResponse(index, {
      positions: this.positions,
      target: this.target,
      shield: this.defense.shield,
      params: this.params,
      count: this.count,
      squadSectors: this.squadSectors,
      sectors: this.sectors,
      random: this.random,
    })
  }

  _updateDefense(dt) {
    this.defense.update(dt, {
      target: this.target,
      params: this.params,
      sectorCounts: this.sectorGame.sectorCounts,
      sectorDirs: SECTOR_DIRS,
      recomputeSectors: () => this._recomputeSectorCounts(),
      onPulse: () => this._triggerPulse(),
    })
=======
    const target = this.target
    if (!target) return

    const i3 = index * 3
    let dx = this.positions[i3] - target.x
    let dy = this.positions[i3 + 1] - target.y
    let dz = this.positions[i3 + 2] - target.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    let dirX = 0
    let dirY = 0
    let dirZ = 0
    if (dist > 0.0001) {
      dirX = dx / dist
      dirY = dy / dist
      dirZ = dz / dist
    }

    const current = this.sectors[index]
    const average = Math.max(1, this.count / SECTOR_COUNT)
    const shield = this.shield
    const distribution = this.params.distribution
    const defense = this.params.defense
    const squad = index % SQUAD_COUNT
    const orderedSector = this.squadSectors[squad]
    const orderDir = SECTOR_DIRS[orderedSector]

    let best = current
    let bestScore = -Infinity
    let currentScore = -Infinity

    for (let s = 0; s < SECTOR_COUNT; s += 1) {
      const dir = SECTOR_DIRS[s]
      const shieldDot = dir.x * shield.x + dir.y * shield.y + dir.z * shield.z

      let risk = 0
      if (shieldDot > SHIELD_COS) {
        risk = (shieldDot - SHIELD_COS) / (1 - SHIELD_COS)
        risk *= risk
      }

      const crowd = this.sectorCounts[s] / average
      const travel =
        1 - (dir.x * dirX + dir.y * dirY + dir.z * dirZ)

      // Riesgo de metralleta: los sectores alineados con el haz de un
      // cañón reciben fuego de rebote cuando el blanco cae.
      let cannonRisk = 0
      for (const cannon of this.cannons) {
        if (cannon.lockIndex < 0) continue
        const dot =
          dir.x * cannon.dirX + dir.y * cannon.dirY + dir.z * cannon.dirZ
        if (dot > 0.7) {
          const r = (dot - 0.7) / 0.3
          if (r * r > cannonRisk) cannonRisk = r * r
        }
      }

      let score =
        -distribution * crowd -
        defense * 3.2 * risk -
        cannonRisk * 2.6 * (1 + this.caution[index] * 0.6) -
        0.22 * travel
      // Orden del líder: empuja al escuadrón hacia su flanco asignado
      // sin imponerlo, para que el juego de congestión siga repartiendo.
      score +=
        (dir.x * orderDir.x + dir.y * orderDir.y + dir.z * orderDir.z) * 0.55
      if (s === orderedSector) score += 0.2
      score += (Math.random() - 0.5) * 0.22

      if (s === current) {
        score += 0.3
        currentScore = score
      }
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }

    if (best !== current && bestScore > currentScore + 0.12) {
      this.sectorCounts[current] = Math.max(0, this.sectorCounts[current] - 1)
      this.sectorCounts[best] += 1
      this.sectors[index] = best
    }
  }

  _updateDefense(dt) {
    const target = this.target
    if (!target || this.battleState !== 'active') return

    const defense = this.params.defense
    const defenseActive = defense > 0.05

    this.sectorClock += dt
    if (this.sectorClock >= 0.22) {
      this.sectorClock = 0
      this._recomputeSectorCounts()

      // El escudo persigue al sector con más aves: la defensa es adaptativa.
      let best = -1
      let bestCount = 0
      for (let s = 0; s < SECTOR_COUNT; s += 1) {
        if (this.sectorCounts[s] > bestCount) {
          bestCount = this.sectorCounts[s]
          best = s
        }
      }
      if (best >= 0) this.shieldTarget = SECTOR_DIRS[best]
    }

    // Rotación suave del escudo.
    const k = 1 - Math.exp(-dt * 2.2)
    let sx = this.shield.x + (this.shieldTarget.x - this.shield.x) * k
    let sy = this.shield.y + (this.shieldTarget.y - this.shield.y) * k
    let sz = this.shield.z + (this.shieldTarget.z - this.shield.z) * k
    const length = Math.sqrt(sx * sx + sy * sy + sz * sz)
    if (length > 0.0001) {
      this.shield.x = sx / length
      this.shield.y = sy / length
      this.shield.z = sz / length
    }

    if (!defenseActive) {
      this.pulseCharge = 0
      this.pulseTimer = 5
      return
    }

    this.pulseTimer -= dt
    this.pulseCharge = clamp(1 - this.pulseTimer / 2.2, 0, 1)

    if (this.pulseTimer <= 0) {
      this._triggerPulse()
      this.pulseTimer = 5 + Math.random() * 2
      this.pulseCharge = 0
    }
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
  }

  /** Onda defensiva radial: repele y hace evadir a las aves cercanas. */
  _triggerPulse() {
    const target = this.target
    if (!target) return

    this.defense.recordPulse()
    const strength = 4 + this.params.defense * 4

    // Los líderes que pueden caer en este pulso se fijan al inicio:
    // los reemplazos promovidos durante el mismo pulso quedan a salvo.
    const leadersAtPulse = this.command.leaderSet()

    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      let dx = this.positions[i3] - target.x
      let dy = this.positions[i3 + 1] - target.y
      let dz = this.positions[i3 + 2] - target.z
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (dist >= PULSE_RADIUS) continue

      if (dist < 0.0001) {
        const theta = this.rand(0, TAU)
        const cosPhi = this.rand(-1, 1)
        const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
        dx = Math.cos(theta) * sinPhi
        dy = cosPhi
        dz = Math.sin(theta) * sinPhi
        dist = 1
      }

      const inv = 1 / dist
      const ux = dx * inv
      const uy = dy * inv
      const uz = dz * inv

      const wasLeader = leadersAtPulse.has(i)
      this.states[i] = STATE.EVADE
      this.stateTimers[i] = 0.55 + this.random() * 0.5
      this.planTimers[i] = 0.2 + this.random() * 0.4
      this.velocities[i3] += ux * strength
      this.velocities[i3 + 1] += uy * strength
      this.velocities[i3 + 2] += uz * strength

      // Un pulso defensivo puede derribar a un líder; el relevo es inmediato.
      if (wasLeader) this._downLeader(i)
    }
  }

  _buildGrid() {
<<<<<<< HEAD
    this.grid.build(this.positions, this.count)
=======
    const { nx, ny, nz, cellSize, cellTotal } = this
    const counts = this.cellCounts
    const starts = this.cellStart
    const cursor = this.cellCursor
    const items = this.cellItems
    const cellOf = this.cellOf
    const positions = this.positions
    const count = this.count

    counts.fill(0)

    for (let i = 0; i < count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      let cx = Math.floor((positions[i3] + PLAY_BOUNDS.x) / cellSize)
      let cy = Math.floor((positions[i3 + 1] + PLAY_BOUNDS.y) / cellSize)
      let cz = Math.floor((positions[i3 + 2] + PLAY_BOUNDS.z) / cellSize)
      cx = cx < 0 ? 0 : cx >= nx ? nx - 1 : cx
      cy = cy < 0 ? 0 : cy >= ny ? ny - 1 : cy
      cz = cz < 0 ? 0 : cz >= nz ? nz - 1 : cz

      const cell = cx + nx * (cy + ny * cz)
      cellOf[i] = cell
      counts[cell] += 1
    }

    let acc = 0
    for (let c = 0; c < cellTotal; c += 1) {
      starts[c] = acc
      acc += counts[c]
    }
    starts[cellTotal] = acc

    cursor.set(starts.subarray(0, cellTotal))
    for (let i = 0; i < count; i += 1) {
      const cell = cellOf[i]
      items[cursor[cell]] = i
      cursor[cell] += 1
    }
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
  }

  /**
   * Un paso de simulación.
   * @param {number} dt segundos
   */
  update(dt) {
    const step = Math.min(dt, 0.04)
    if (this.count === 0) return

    this._buildGrid()
    if (this.target) {
      this._updateDefense(step)
      this._updateStrategy(step)
      this._updateCombat(step)
    }

    // Recuperación de líderes derribados.
<<<<<<< HEAD
    this.command.tick(step)
    this.steering.step(step)
  }
=======
    for (let i = 0; i < count; i += 1) {
      if (this.health[i] <= 0) continue
      if (this.downTimers[i] > 0) {
        this.downTimers[i] -= step
        if (this.downTimers[i] <= 0) this._onRecover(i)
      }
    }
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8

  get downTimers() {
    return this.command.downTimers
  }

<<<<<<< HEAD
  get leaderOfSquad() {
    return this.command.leaderOfSquad
  }

  get commander() {
    return this.command.commander
  }
=======
    // Con objetivo, el enjambre puede salir del volumen central para
    // alcanzar cualquier punto de la página. Sin objetivo vuelve a BOUNDS.
    const limits = target ? PLAY_BOUNDS : BOUNDS
    const edgeX = limits.x - p.edgeMargin
    const edgeY = limits.y - p.edgeMargin
    const edgeZ = limits.z - p.edgeMargin
    const wrapX = PLAY_BOUNDS.x + 14
    const wrapY = PLAY_BOUNDS.y + 14
    const wrapZ = PLAY_BOUNDS.z + 14

    for (let i = 0; i < count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const px = positions[i3]
      const py = positions[i3 + 1]
      const pz = positions[i3 + 2]
      const vx = velocities[i3]
      const vy = velocities[i3 + 1]
      const vz = velocities[i3 + 2]
      const state = states[i]
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8

  get commandVersion() {
    return this.command.commandVersion
  }

  get commandLog() {
    return this.command.commandLog
  }

  get shield() {
    return this.defense.shield
  }

  get shieldTarget() {
    return this.defense.shieldTarget
  }

  get pulseTimer() {
    return this.defense.pulseTimer
  }

  get pulseCharge() {
    return this.defense.pulseCharge
  }

  get sectorCounts() {
    return this.sectorGame.sectorCounts
  }

<<<<<<< HEAD
  /** Vista de solo lectura para el render; evita que BirdScene lea internals. */
  getRenderState() {
    return {
      count: this.count,
      positions: this.positions,
      velocities: this.velocities,
      target: this.target,
      shield: this.defense.shield,
      pulseCharge: this.defense.pulseCharge,
      defenseActive: this.params.defense > 0.05,
      leaderOfSquad: this.command.leaderOfSquad,
      commander: this.command.commander,
      commandVersion: this.command.commandVersion,
      strategyVersion: this.strategyVersion,
=======
              if (distSq < separationSq) {
                const dist = Math.sqrt(distSq)
                const weight = 1 - dist / p.separationRadius
                sepX -= (dx / dist) * weight
                sepY -= (dy / dist) * weight
                sepZ -= (dz / dist) * weight
              }
            }
          }
        }
      }

      let fx = 0
      let fy = 0
      let fz = 0

      // --- Separación ---
      const sepMag = Math.sqrt(sepX * sepX + sepY * sepY + sepZ * sepZ)
      if (sepMag > 1e-5) {
        let ax = (sepX / sepMag) * maxSpeed - vx
        let ay = (sepY / sepMag) * maxSpeed - vy
        let az = (sepZ / sepMag) * maxSpeed - vz
        const aMag = Math.sqrt(ax * ax + ay * ay + az * az)
        if (aMag > maxForce) {
          const k = maxForce / aMag
          ax *= k
          ay *= k
          az *= k
        }
        // Las aves con memoria de daño se separan más: no se amontonan
        // en la línea de fuego de los cañones.
        const separationWeight = p.separation * (1 + this.caution[i] * 0.5)
        fx += ax * separationWeight
        fy += ay * separationWeight
        fz += az * separationWeight
      }

      // --- Alineación ---
      if (aliCount > 0) {
        aliX /= aliCount
        aliY /= aliCount
        aliZ /= aliCount
        const aliMag = Math.sqrt(aliX * aliX + aliY * aliY + aliZ * aliZ)
        if (aliMag > 1e-5) {
          let ax = (aliX / aliMag) * maxSpeed - vx
          let ay = (aliY / aliMag) * maxSpeed - vy
          let az = (aliZ / aliMag) * maxSpeed - vz
          const aMag = Math.sqrt(ax * ax + ay * ay + az * az)
          if (aMag > maxForce) {
            const k = maxForce / aMag
            ax *= k
            ay *= k
            az *= k
          }
          const alignmentWeight = target ? p.alignment * 0.8 : p.alignment
          fx += ax * alignmentWeight
          fy += ay * alignmentWeight
          fz += az * alignmentWeight
        }
      }

      // --- Cohesión ---
      if (cohCount > 0) {
        const dx = cohX / cohCount - px
        const dy = cohY / cohCount - py
        const dz = cohZ / cohCount - pz
        const cohMag = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (cohMag > 1e-5) {
          let ax = (dx / cohMag) * maxSpeed - vx
          let ay = (dy / cohMag) * maxSpeed - vy
          let az = (dz / cohMag) * maxSpeed - vz
          const aMag = Math.sqrt(ax * ax + ay * ay + az * az)
          if (aMag > maxForce) {
            const k = maxForce / aMag
            ax *= k
            ay *= k
            az *= k
          }
          const cohesionWeight = target
            ? p.cohesion *
              (state === STATE.DIVE
                ? 0.2
                : state === STATE.INTERCEPT
                  ? 0.15
                  : 0.5) *
              (1 - this.caution[i] * 0.12)
            : p.cohesion
          fx += ax * cohesionWeight
          fy += ay * cohesionWeight
          fz += az * cohesionWeight
        }
      }

      // --- Comportamiento según la FSM ---
      if (target) {
        const dx = targetX - px
        const dy = targetY - py
        const dz = targetZ - pz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const invDist = 1 / Math.max(dist, 0.0001)

        let desiredX = 0
        let desiredY = 0
        let desiredZ = 0
        let behaviorWeight = 0

        if (state === STATE.DISTRIBUTE || state === STATE.STAGE) {
          // Punto de espera del sector elegido.
          const sector = sectorDirs[sectors[i]]
          const stagingX =
            targetX + sector.x * STAGE_RADIUS + laneJitter[i3]
          const stagingY =
            targetY + sector.y * STAGE_RADIUS + laneJitter[i3 + 1]
          const stagingZ =
            targetZ + sector.z * STAGE_RADIUS + laneJitter[i3 + 2]

          const sdx = stagingX - px
          const sdy = stagingY - py
          const sdz = stagingZ - pz
          const stagingDist = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz)
          const invStaging = 1 / Math.max(stagingDist, 0.0001)

          const slowDown = stagingDist < 8 ? 0.62 : 1
          desiredX = sdx * invStaging * maxSpeed * slowDown
          desiredY = sdy * invStaging * maxSpeed * slowDown
          desiredZ = sdz * invStaging * maxSpeed * slowDown
          behaviorWeight = p.seek * 1.05

          // Si el escudo gira hacia este sector, se empuja al ave fuera de él.
          if (defenseActive && dist < SHIELD_RADIUS + 9) {
            const outX = -dx * invDist
            const outY = -dy * invDist
            const outZ = -dz * invDist
            const shieldDot =
              outX * shield.x + outY * shield.y + outZ * shield.z
            if (shieldDot > SHIELD_COS) {
              const push =
                ((shieldDot - SHIELD_COS) / (1 - SHIELD_COS)) * 11
              fx += outX * push
              fy += outY * push
              fz += outZ * push
            }
          }

          if (state === STATE.DISTRIBUTE) {
            if (stagingDist < 7) {
              states[i] = STATE.STAGE
              stateTimers[i] = 0.15 + Math.random() * 0.35
            }
          } else {
            stateTimers[i] -= step
            if (stateTimers[i] <= 0) {
              // Plan ordenado: solo la oleada activa (dos escuadrones) se
              // lanza; el resto espera cubriendo flancos.
              const squad = i % SQUAD_COUNT
              const inWave =
                squad === this.orderedSquad ||
                squad === (this.orderedSquad + 1) % SQUAD_COUNT
              if (this.attackPlan === 'ordenado' && !inWave) {
                stateTimers[i] = 0.35
              } else {
                states[i] = STATE.DIVE
              }
            }
          }
        } else if (state === STATE.DIVE) {
          const ux = dx * invDist
          const uy = dy * invDist
          const uz = dz * invDist
          desiredX = ux * maxSpeed
          desiredY = uy * maxSpeed
          desiredZ = uz * maxSpeed
          behaviorWeight = p.seek * 1.35

          if (dist < p.strikeRadius) {
            // El escudo puede rechazar el ataque antes del contacto.
            let shieldDot = -1
            if (
              defenseActive &&
              this.battleState === 'active' &&
              dist < SHIELD_RADIUS
            ) {
              shieldDot =
                -ux * shield.x + -uy * shield.y + -uz * shield.z
            }

            if (shieldDot > SHIELD_COS) {
              states[i] = STATE.EVADE
              stateTimers[i] = 0.5 + Math.random() * 0.45
              this.pendingBlocks += 1
              const kick = 5 + p.defense * 3
              velocities[i3] -= ux * kick
              velocities[i3 + 1] -= uy * kick
              velocities[i3 + 2] -= uz * kick
              desiredX = -ux * maxSpeed
              desiredY = -uy * maxSpeed
              desiredZ = -uz * maxSpeed
              behaviorWeight = p.seek * 1.25
            } else if (
              this.battleState === 'active' &&
              this.collisionTimers[i] <= 0
            ) {
              // Colisión confirmada: solo así el objetivo pierde salud.
              this.targetHealth = Math.max(
                0,
                this.targetHealth - COLLISION_DAMAGE,
              )
              this.collisionTimers[i] = COLLISION_COOLDOWN
              this.pendingCollisions += 1
              this.pendingImpacts += 1
              states[i] = STATE.RETREAT
              stateTimers[i] = 2.2 + Math.random() * 1.4
              const kick = 5 + p.defense * 2
              velocities[i3] -= ux * kick
              velocities[i3 + 1] -= uy * kick
              velocities[i3 + 2] -= uz * kick
              desiredX = -ux * maxSpeed
              desiredY = -uy * maxSpeed
              desiredZ = -uz * maxSpeed
              behaviorWeight = p.seek * 1.2
            }
          } else if (
            defenseActive &&
            this.battleState === 'active' &&
            pulseCharge > 0.55 &&
            dist < PULSE_RADIUS * 0.95
          ) {
            // Los líderes ordenan repliegue antes de que el pulso se libere.
            states[i] = STATE.RETREAT
            stateTimers[i] = 0.35 + Math.random() * 0.35
            desiredX = -ux * maxSpeed
            desiredY = -uy * maxSpeed
            desiredZ = -uz * maxSpeed
            behaviorWeight = p.seek * 1.2
          }
        } else if (state === STATE.INTERCEPT) {
          // Derribo de una bomba: se vuela hasta su trayectoria y se choca
          // contra ella para que no detone sobre el enjambre.
          const bombId = this.interceptTarget[i]
          const bomb =
            bombId >= 0 ? this.bombs.find((item) => item.id === bombId) : null

          if (!bomb) {
            states[i] = STATE.DISTRIBUTE
            stateTimers[i] = 0
            planTimers[i] = 0.1 + Math.random() * 0.4
          } else {
            const bdx = bomb.x - px
            const bdy = bomb.y - py
            const bdz = bomb.z - pz
            const bombDist = Math.sqrt(bdx * bdx + bdy * bdy + bdz * bdz)

            // La bomba es lenta y predecible: se apunta a dónde estará.
            const lead = Math.min(0.6, bombDist / 40)
            const tdx = bomb.x + bomb.vx * lead - px
            const tdy = bomb.y + bomb.vy * lead - py
            const tdz = bomb.z + bomb.vz * lead - pz
            const tdist =
              Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz) || 1

            desiredX = (tdx / tdist) * maxSpeed
            desiredY = (tdy / tdist) * maxSpeed
            desiredZ = (tdz / tdist) * maxSpeed
            behaviorWeight = p.seek * 1.6

            // Al alcanzar la bomba la intercepta y sale despedido.
            if (bombDist < BOMB_INTERCEPT_RADIUS * 1.6) {
              states[i] = STATE.EVADE
              stateTimers[i] = 0.45 + Math.random() * 0.35
              const kick = 4 + p.defense
              velocities[i3] += bomb.vx * 0.16 * kick
              velocities[i3 + 1] += bomb.vy * 0.16 * kick
              velocities[i3 + 2] += bomb.vz * 0.16 * kick
            }
          }
        } else {
          // RETREAT / EVADE: salir del radio y volver a la distribución.
          const outX = -dx * invDist
          const outY = -dy * invDist
          const outZ = -dz * invDist
          let tx = -outZ
          let tz = outX
          const tMag = Math.sqrt(tx * tx + tz * tz)
          if (tMag > 1e-4) {
            tx /= tMag
            tz /= tMag
          } else {
            tx = 1
            tz = 0
          }
          const swirl = state === STATE.EVADE ? 0.42 : 0.65
          let ddx = outX + tx * swirl
          let ddy = outY
          let ddz = outZ + tz * swirl
          const dm = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1
          desiredX = (ddx / dm) * maxSpeed
          desiredY = (ddy / dm) * maxSpeed
          desiredZ = (ddz / dm) * maxSpeed
          behaviorWeight = p.seek * (state === STATE.EVADE ? 1.4 : 1.1)

          stateTimers[i] -= step
          if (stateTimers[i] <= 0) {
            states[i] = STATE.DISTRIBUTE
            planTimers[i] = 0.1 + Math.random() * 0.4
          }
        }

        if (behaviorWeight > 0) {
          let ax = desiredX - vx
          let ay = desiredY - vy
          let az = desiredZ - vz
          const aMag = Math.sqrt(ax * ax + ay * ay + az * az)
          if (aMag > maxForce) {
            const k = maxForce / aMag
            ax *= k
            ay *= k
            az *= k
          }
          fx += ax * behaviorWeight
          fy += ay * behaviorWeight
          fz += az * behaviorWeight
        }

        // Actualización escalonada de la mejor respuesta (una sola ave
        // en cada vuelta), lo que estabiliza la distribución.
        if (
          states[i] === STATE.DISTRIBUTE ||
          states[i] === STATE.STAGE
        ) {
          planTimers[i] -= step
          if (planTimers[i] <= 0) {
            this._bestResponse(i)
            planTimers[i] = 1 + Math.random() * 1.5
          }
        }
      }

      // --- Esquiva: si detecta el disparo, se desplaza lateralmente ---
      if (this.threatTimers[i] > 0) {
        // La memoria de daño aumenta la urgencia de la esquiva.
        const urgency =
          (this.threatTimers[i] > 0.35 ? 1.35 : 0.85) *
          (1 + this.caution[i] * 0.4)
        fx += this.dodgeX[i] * maxForce * urgency
        fy += this.dodgeY[i] * maxForce * urgency
        fz += this.dodgeZ[i] * maxForce * urgency
      }

      // --- Bordes: giro suave hacia el interior ---
      if (px < -edgeX) fx += ((-edgeX - px) / p.edgeMargin) * 9
      else if (px > edgeX) fx -= ((px - edgeX) / p.edgeMargin) * 9
      if (py < -edgeY) fy += ((-edgeY - py) / p.edgeMargin) * 9
      else if (py > edgeY) fy -= ((py - edgeY) / p.edgeMargin) * 9
      if (pz < -edgeZ) fz += ((-edgeZ - pz) / p.edgeMargin) * 9
      else if (pz > edgeZ) fz -= ((pz - edgeZ) / p.edgeMargin) * 9

      // --- Aceleración ---
      const forceMag = Math.sqrt(fx * fx + fy * fy + fz * fz)
      if (forceMag > maxForce) {
        const k = maxForce / forceMag
        fx *= k
        fy *= k
        fz *= k
      }

      let nvx = vx + fx * step
      let nvy = vy + fy * step
      let nvz = vz + fz * step

      let speed = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz)
      if (speed > maxSpeed) {
        const k = maxSpeed / speed
        nvx *= k
        nvy *= k
        nvz *= k
      } else if (speed < p.minSpeed) {
        if (speed < 0.001) {
          const theta = rand(0, TAU)
          const cosPhi = rand(-1, 1)
          const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
          nvx = Math.cos(theta) * sinPhi * p.minSpeed
          nvy = cosPhi * p.minSpeed
          nvz = Math.sin(theta) * sinPhi * p.minSpeed
        } else {
          const k = p.minSpeed / speed
          nvx *= k
          nvy *= k
          nvz *= k
        }
      }

      velocities[i3] = nvx
      velocities[i3 + 1] = nvy
      velocities[i3 + 2] = nvz

      let nxPos = px + nvx * step
      let nyPos = py + nvy * step
      let nzPos = pz + nvz * step

      if (nxPos < -wrapX) nxPos = wrapX
      else if (nxPos > wrapX) nxPos = -wrapX
      if (nyPos < -wrapY) nyPos = wrapY
      else if (nyPos > wrapY) nyPos = -wrapY
      if (nzPos < -wrapZ) nzPos = wrapZ
      else if (nzPos > wrapZ) nzPos = -wrapZ

      positions[i3] = nxPos
      positions[i3 + 1] = nyPos
      positions[i3 + 2] = nzPos
>>>>>>> 51f5efab3cebde893a3e34ab2c58b7528ea74dc8
    }

    if (target && this.battleState === 'active') this._checkBattleState()
  }
}
