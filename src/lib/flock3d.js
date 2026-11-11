import {
  BOMB_COUNT,
  BOUNDS,
  DEFAULT_BOIDS,
  DEFAULT_PARAMS,
  MAX_BOIDS,
  MIN_BOIDS,
  PLAY_BOUNDS,
  PULSE_RADIUS,
  RETREAT_CHARGE,
  SECTOR_COUNT,
  SQUAD_COUNT,
  STATE,
  STATE_COUNT,
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
import { CombatSystem } from './combat.js'

export {
  ATTACKER_MAX_HEALTH,
  BOMB_ARM_TIME,
  BOMB_COUNT,
  BOMB_COOLDOWN,
  BOMB_DETECT_RADIUS,
  BOMB_ENERGY_COST,
  BOMB_FUSE,
  BOMB_INTERCEPT_RADIUS,
  BOMB_MAX_INTERCEPTORS,
  BOMB_MIN_RANGE,
  BOMB_RADIUS,
  BOMB_SPEED,
  BOUNDS,
  CANNON_AIM_TIME,
  CANNON_BURST_ENERGY,
  CANNON_COOLDOWN,
  CANNON_COUNT,
  CANNON_ENERGY_COST,
  CANNON_FIRE_INTERVAL,
  CANNON_MOUNTS,
  CANNON_RANGE,
  COLLISION_COOLDOWN,
  COLLISION_DAMAGE,
  DEFAULT_BOIDS,
  DEFAULT_PARAMS,
  DODGE_ALERT_RADIUS,
  ENERGY_REGEN,
  LEADER_DOWN_TIME,
  MAX_BOIDS,
  MIN_BOIDS,
  PLAY_BOUNDS,
  PULSE_RADIUS,
  RETREAT_CHARGE,
  SECTOR_COUNT,
  SHIELD_ANGLE,
  SHIELD_COS,
  SHIELD_RADIUS,
  SHOT_DAMAGE,
  SHOT_RADIUS,
  SQUAD_COUNT,
  SQUAD_LETTERS,
  STAGE_RADIUS,
  STATE,
  STATE_COUNT,
  STRATEGY_INTERVAL,
  TARGET_MAX_ENERGY,
  TARGET_MAX_HEALTH,
  TAU,
  clamp,
} from './constants.js'

/**
 * Simulación de Boids en 3D sobre arrays tipados.
 *
 * Orquesta sistemas con responsabilidades separadas:
 * - `SpatialGrid`: rejilla espacial (counting sort).
 * - `SectorGame`: juego de congestión y asignación de flancos.
 * - `DefenseSystem`: escudo direccional y pulsos.
 * - `CommandChain`: códigos, líderes, comandante y relevos.
 * - `CombatSystem`: salud, cañones, bombas, esquiva y estado de batalla.
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
    this.combat = new CombatSystem(this, maxCount, this.count)
    this.defense = new DefenseSystem({ rng: this.random })
    this.grid = new SpatialGrid({
      bounds: PLAY_BOUNDS,
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
    this.pendingImpacts = 0
    this.pendingBlocks = 0

    this.seed()
  }

  seed() {
    for (let i = 0; i < this.count; i += 1) this.respawn(i)
    this.target = null
    this.defense.reset()
    this.combat.seedReset()
    this.pendingImpacts = 0
    this.pendingBlocks = 0
    this.pendingLeaderDowns = []
    this.command.downTimers.fill(0)
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
    this.planTimers[index] = this.rand(0.2, 1.4)
    this.command.downTimers[index] = 0
    this.combat.respawn(index)
  }

  setCount(next) {
    const target = clamp(Math.round(next), 0, this.maxCount)
    if (target > this.count) {
      for (let i = this.count; i < target; i += 1) this.respawn(i)
    }
    this.count = target
    this.command.setCount(target)
    this.combat.setCount(target)
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

    this.combat.beginRound()

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
    this.combat.clear()
    this.pendingImpacts = 0
    this.pendingBlocks = 0
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

  consumeShots() {
    return this.combat.consumeShots()
  }

  consumeKills() {
    return this.combat.consumeKills()
  }

  consumeCollisions() {
    return this.combat.consumeCollisions()
  }

  consumeBombs() {
    return this.combat.consumeBombs()
  }

  /** Cantidad de aves en cada estado de la FSM (solo vivas). */
  getStateCounts() {
    const counts = new Array(STATE_COUNT).fill(0)
    for (let i = 0; i < this.count; i += 1) {
      if (this.combat.health[i] <= 0) continue
      counts[this.states[i]] += 1
    }
    return counts
  }

  getCombatInfo() {
    return this.combat.getInfo()
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
    return {
      ...info,
      stance:
        this.target &&
        this.params.defense > 0.05 &&
        this.defense.pulseCharge > RETREAT_CHARGE
          ? 'repliegue'
          : 'flanqueo',
      plan: this.combat.attackPlan,
      alive: this.combat.aliveCount,
      targetHealth: this.combat.targetHealth,
      targetEnergy: this.combat.targetEnergy,
      battleState: this.combat.battleState,
      bombStock: this.combat.bombStock,
      bombMax: BOMB_COUNT,
      bombActive: this.combat.bombs.length,
      bombInterceptors: this.combat.bombInterceptions,
    }
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

    this.strategyTimer = 0
  }

  consumeLeaderDowns() {
    const events = this.pendingLeaderDowns
    this.pendingLeaderDowns = []
    return events
  }

  /**
   * Los líderes acuerdan un sector distinto para cada escuadrón evitando
   * el escudo y repartiendo la presión. Esa orden sesga el juego de cada ave.
   */
  _planStrategy() {
    this.sectorGame.planStrategy({
      count: this.count,
      shield: this.defense.shield,
      params: this.params,
      commander: this.command.commander,
      squadSectors: this.squadSectors,
      random: this.random,
      cannons: this.combat.cannons,
    })
    this.strategyVersion += 1
  }

  _updateStrategy(dt) {
    if (!this.target || this.combat.battleState !== 'active') return
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
    this.sectorGame.recompute(
      this.count,
      this.states,
      this.sectors,
      this.combat.health,
    )
  }

  /** Mejor respuesta de un ave en el juego de congestión. */
  _bestResponse(index) {
    this.sectorGame.bestResponse(index, {
      positions: this.positions,
      target: this.target,
      shield: this.defense.shield,
      params: this.params,
      count: this.count,
      squadSectors: this.squadSectors,
      sectors: this.sectors,
      random: this.random,
      cannons: this.combat.cannons,
      caution: this.combat.caution[index],
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
      enabled: this.combat.battleState === 'active',
    })
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
      if (this.combat.health[i] <= 0) continue
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
    this.grid.build(this.positions, this.count, this.combat.health)
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
      this.combat.update(step)
    }

    // Recuperación de líderes derribados (las aves muertas no vuelven).
    this.command.tick(step, this.combat.health)
    this.steering.step(step)
  }

  get downTimers() {
    return this.command.downTimers
  }

  get leaderOfSquad() {
    return this.command.leaderOfSquad
  }

  get commander() {
    return this.command.commander
  }

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

  get health() {
    return this.combat.health
  }

  get caution() {
    return this.combat.caution
  }

  get threatTimers() {
    return this.combat.threatTimers
  }

  get dodgeX() {
    return this.combat.dodgeX
  }

  get dodgeY() {
    return this.combat.dodgeY
  }

  get dodgeZ() {
    return this.combat.dodgeZ
  }

  get collisionTimers() {
    return this.combat.collisionTimers
  }

  get targetHealth() {
    return this.combat.targetHealth
  }

  get targetEnergy() {
    return this.combat.targetEnergy
  }

  get aliveCount() {
    return this.combat.aliveCount
  }

  get battleState() {
    return this.combat.battleState
  }

  get attackPlan() {
    return this.combat.attackPlan
  }

  get orderedSquad() {
    return this.combat.orderedSquad
  }

  get interceptTarget() {
    return this.combat.interceptTarget
  }

  get bombs() {
    return this.combat.bombs
  }

  get cannons() {
    return this.combat.cannons
  }

  get bombStock() {
    return this.combat.bombStock
  }

  get bombInterceptions() {
    return this.combat.bombInterceptions
  }

  /** Vista de solo lectura para el render; evita que BirdScene lea internals. */
  getRenderState() {
    return {
      count: this.count,
      positions: this.positions,
      velocities: this.velocities,
      health: this.combat.health,
      target: this.target,
      shield: this.defense.shield,
      pulseCharge: this.defense.pulseCharge,
      defenseActive: this.params.defense > 0.05,
      leaderOfSquad: this.command.leaderOfSquad,
      commander: this.command.commander,
      commandVersion: this.command.commandVersion,
      strategyVersion: this.strategyVersion,
      battleState: this.combat.battleState,
      targetHealth: this.combat.targetHealth,
      targetEnergy: this.combat.targetEnergy,
    }
  }
}
