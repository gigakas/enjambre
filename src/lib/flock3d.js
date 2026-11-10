const TAU = Math.PI * 2

const rand = (min, max) => min + Math.random() * (max - min)

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

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

const SHIELD_COS = Math.cos(SHIELD_ANGLE)

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

/**
 * Simulación de Boids en 3D sobre arrays tipados.
 *
 * - Rejilla espacial (spatial hash) para que el coste no sea O(n²).
 * - FSM por ave: DISTRIBUTE → STAGE → DIVE → RETREAT / EVADE.
 * - Objetivo defensivo: escudo direccional que persigue al sector más
 *   congestionado y pulsos radiales que repelen a las aves cercanas.
 */
export class Flock3D {
  constructor({ count = DEFAULT_BOIDS, maxCount = MAX_BOIDS } = {}) {
    this.maxCount = maxCount
    this.count = clamp(Math.round(count), MIN_BOIDS, maxCount)
    this.params = { ...DEFAULT_PARAMS }
    this.target = null

    this.positions = new Float32Array(maxCount * 3)
    this.velocities = new Float32Array(maxCount * 3)
    this.laneJitter = new Float32Array(maxCount * 3)
    this.states = new Uint8Array(maxCount)
    this.stateTimers = new Float32Array(maxCount)
    this.planTimers = new Float32Array(maxCount)
    this.sectors = new Uint8Array(maxCount)

    this.sectorCounts = new Int32Array(SECTOR_COUNT)
    this.sectorClock = 0

    // Jerarquía y relevo de mando.
    this.downTimers = new Float32Array(maxCount)
    this.leaderOfSquad = new Int32Array(SQUAD_COUNT).fill(-1)
    this.commander = -1
    this.squadSectors = new Uint8Array(SQUAD_COUNT)
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      this.squadSectors[s] = Math.floor((s * SECTOR_COUNT) / SQUAD_COUNT)
    }
    this.commandVersion = 0
    this.commandLog = []
    this.strategyTimer = 0
    this.strategyVersion = 0
    this.pendingLeaderDowns = []

    // Defensa del objetivo.
    this.shield = { x: 1, y: 0, z: 0 }
    this.shieldTarget = { x: 1, y: 0, z: 0 }
    this.pulseTimer = 5
    this.pulseCharge = 0

    this.pendingImpacts = 0
    this.pendingBlocks = 0
    this.pendingPulses = 0

    // Rejilla espacial.
    this.cellSize = this.params.perception
    this.nx = Math.max(1, Math.ceil((BOUNDS.x * 2) / this.cellSize))
    this.ny = Math.max(1, Math.ceil((BOUNDS.y * 2) / this.cellSize))
    this.nz = Math.max(1, Math.ceil((BOUNDS.z * 2) / this.cellSize))
    this.cellTotal = this.nx * this.ny * this.nz
    this.cellOf = new Int32Array(maxCount)
    this.cellCounts = new Int32Array(this.cellTotal)
    this.cellStart = new Int32Array(this.cellTotal + 1)
    this.cellCursor = new Int32Array(this.cellTotal)
    this.cellItems = new Int32Array(maxCount)

    this.seed()
  }

  seed() {
    for (let i = 0; i < this.count; i += 1) this.respawn(i)
    this.target = null
    this.pulseTimer = 5
    this.pulseCharge = 0
    this.pendingImpacts = 0
    this.pendingBlocks = 0
    this.pendingPulses = 0
    this.pendingLeaderDowns = []
    this.downTimers.fill(0)
    this._recomputeSectorCounts()
    this._initCommand()
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
      x = rand(-1, 1)
      y = rand(-1, 1)
      z = rand(-1, 1)
    } while (x * x + y * y + z * z > 1)

    this.positions[i3] = x * BOUNDS.x * 0.58
    this.positions[i3 + 1] = y * BOUNDS.y * 0.58
    this.positions[i3 + 2] = z * BOUNDS.z * 0.58

    this.laneJitter[i3] = rand(-2.4, 2.4)
    this.laneJitter[i3 + 1] = rand(-2.4, 2.4)
    this.laneJitter[i3 + 2] = rand(-2.4, 2.4)

    const theta = rand(0, TAU)
    const cosPhi = rand(-1, 1)
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
    const speed = rand(2.5, 5.5)
    this.velocities[i3] = Math.cos(theta) * sinPhi * speed
    this.velocities[i3 + 1] = cosPhi * speed
    this.velocities[i3 + 2] = Math.sin(theta) * sinPhi * speed

    this.sectors[index] = index % SECTOR_COUNT
    this.states[index] = STATE.DISTRIBUTE
    this.stateTimers[index] = 0
    this.planTimers[index] = rand(0.2, 1.4)
  }

  setCount(next) {
    const target = clamp(Math.round(next), 0, this.maxCount)
    if (target > this.count) {
      for (let i = this.count; i < target; i += 1) this.respawn(i)
    }
    this.count = target
    this._recomputeSectorCounts()
    this._ensureCommand()
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
    let dx = cx * invCount - x
    let dy = cy * invCount - y
    let dz = cz * invCount - z
    const dirLength = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dirLength > 0.001) {
      dx /= dirLength
      dy /= dirLength
      dz /= dirLength
    } else {
      dx = 1
      dy = 0
      dz = 0
    }
    this.shield.x = dx
    this.shield.y = dy
    this.shield.z = dz
    this.shieldTarget = { x: dx, y: dy, z: dz }

    for (let i = 0; i < this.count; i += 1) {
      if (this.downTimers[i] > 0) {
        this.states[i] = STATE.EVADE
        this.stateTimers[i] = this.downTimers[i]
      } else {
        this.states[i] = STATE.DISTRIBUTE
        this.stateTimers[i] = 0
      }
      this.planTimers[i] = rand(0.1, 0.8)
    }

    this.pulseTimer = 4.5 + Math.random() * 1.5
    this.pulseCharge = 0
    this.sectorClock = 0
    this.pendingImpacts = 0
    this.pendingBlocks = 0
    this.pendingPulses = 0
    this._recomputeSectorCounts()
    this.strategyTimer = 0
    this._planStrategy()
  }

  clearTarget() {
    this.target = null
    this.pulseCharge = 0
    this.pendingImpacts = 0
    this.pendingBlocks = 0
    this.pendingPulses = 0
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
    const pulses = this.pendingPulses
    this.pendingPulses = 0
    return pulses
  }

  /** Cantidad de aves en cada estado de la FSM. */
  getStateCounts() {
    const counts = [0, 0, 0, 0, 0]
    for (let i = 0; i < this.count; i += 1) counts[this.states[i]] += 1
    return counts
  }

  /** Código único de cada ave: escuadrón + rango. */
  getCode(index) {
    const letter = SQUAD_LETTERS[index % SQUAD_COUNT]
    const rank = Math.floor(index / SQUAD_COUNT) + 1
    return `${letter}-${String(rank).padStart(3, '0')}`
  }

  isLeader(index) {
    if (index === this.commander) return true
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      if (this.leaderOfSquad[s] === index) return true
    }
    return false
  }

  _log(message) {
    this.commandLog.unshift(message)
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
    const code = this.commander >= 0 ? this.getCode(this.commander) : 'sin líder'
    this._log(`Mando inicial · ${code}`)
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
  }

  /**
   * Derribo de un líder. El siguiente código de su escuadrón asume el rol
   * y, si era el comandante, el líder más antiguo toma el mando global.
   */
  _downLeader(index) {
    if (index < 0 || index >= this.count || this.downTimers[index] > 0) return

    const wasCommander = this.commander === index
    let wasSquad = -1
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      if (this.leaderOfSquad[s] === index) {
        wasSquad = s
        break
      }
    }
    if (!wasCommander && wasSquad < 0) return

    this.downTimers[index] = LEADER_DOWN_TIME + Math.random()
    this.stateTimers[index] = Math.max(
      this.stateTimers[index],
      this.downTimers[index],
    )
    this.states[index] = STATE.EVADE

    const i3 = index * 3
    this.pendingLeaderDowns.push({
      x: this.positions[i3],
      y: this.positions[i3 + 1],
      z: this.positions[i3 + 2],
    })

    if (wasSquad >= 0) {
      const nextLeader = this._nextSquadLeader(wasSquad, index)
      this.leaderOfSquad[wasSquad] = nextLeader
      const oldCode = this.getCode(index)
      const nextCode =
        nextLeader >= 0 ? this.getCode(nextLeader) : 'sin relevo'
      this._log(
        `${oldCode} derribada · ${nextCode} asume el escuadrón ${SQUAD_LETTERS[wasSquad]}`,
      )
    }

    this._selectCommander()
    if (wasCommander && this.commander !== index) {
      if (this.commander >= 0) {
        this._log(`${this.getCode(this.commander)} toma el mando del enjambre`)
      } else {
        this._log('Sin relevo disponible · mando en espera')
      }
    }

    this.strategyTimer = 0
    this.commandVersion += 1
  }

  _onRecover(index) {
    const squad = index % SQUAD_COUNT
    if (this.leaderOfSquad[squad] < 0) {
      this.leaderOfSquad[squad] = this._findSquadLeader(squad)
      this.commandVersion += 1
    }
    if (this.commander < 0) {
      this._selectCommander()
      this.commandVersion += 1
    }
  }

  consumeLeaderDowns() {
    const events = this.pendingLeaderDowns
    this.pendingLeaderDowns = []
    return events
  }

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
      log: this.commandLog.slice(0, 3),
      version: this.commandVersion,
    }
  }

  /**
   * Los líderes acuerdan un sector distinto para cada escuadrón evitando
   * el escudo y repartiendo la presión. Esa orden sesga el juego de cada ave.
   */
  _planStrategy() {
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
        const score =
          -risk * 4.5 -
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

    this.strategyVersion += 1
  }

  _updateStrategy(dt) {
    if (!this.target) return
    this.strategyTimer -= dt
    if (this.strategyTimer <= 0) {
      this.strategyTimer = STRATEGY_INTERVAL + Math.random() * 0.8
      this._planStrategy()
    }
  }

  scatter() {
    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3
      const theta = rand(0, TAU)
      const cosPhi = rand(-1, 1)
      const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
      const kick = rand(4, 10)
      this.velocities[i3] += Math.cos(theta) * sinPhi * kick
      this.velocities[i3 + 1] += cosPhi * kick
      this.velocities[i3 + 2] += Math.sin(theta) * sinPhi * kick

      this.positions[i3] += rand(-1, 1) * 2
      this.positions[i3 + 1] += rand(-1, 1) * 2
      this.positions[i3 + 2] += rand(-1, 1) * 2

      this.states[i] = STATE.DISTRIBUTE
      this.stateTimers[i] = 0
      this.planTimers[i] = rand(0.2, 0.9)
    }
  }

  _recomputeSectorCounts() {
    this.sectorCounts.fill(0)
    for (let i = 0; i < this.count; i += 1) {
      const state = this.states[i]
      if (state !== STATE.RETREAT && state !== STATE.EVADE) {
        this.sectorCounts[this.sectors[i]] += 1
      }
    }
  }

  /**
   * Mejor respuesta de un ave en el juego de congestión:
   * pago(s) = -distribución·congestión(s) - defensa·riesgoEscudo(s)
   *           - desplazamiento(s) + inercia(s).
   */
  _bestResponse(index) {
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

      let score =
        -distribution * crowd -
        defense * 3.2 * risk -
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
    if (!target) return

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
  }

  /** Onda defensiva radial: repele y hace evadir a las aves cercanas. */
  _triggerPulse() {
    const target = this.target
    if (!target) return

    this.pendingPulses += 1
    const strength = 4 + this.params.defense * 4

    // Los líderes que pueden caer en este pulso se fijan al inicio:
    // los reemplazos promovidos durante el mismo pulso quedan a salvo.
    const leadersAtPulse = new Set()
    if (this.commander >= 0) leadersAtPulse.add(this.commander)
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      if (this.leaderOfSquad[s] >= 0) {
        leadersAtPulse.add(this.leaderOfSquad[s])
      }
    }

    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3
      let dx = this.positions[i3] - target.x
      let dy = this.positions[i3 + 1] - target.y
      let dz = this.positions[i3 + 2] - target.z
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (dist >= PULSE_RADIUS) continue

      if (dist < 0.0001) {
        const theta = rand(0, TAU)
        const cosPhi = rand(-1, 1)
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
      this.stateTimers[i] = 0.55 + Math.random() * 0.5
      this.planTimers[i] = 0.2 + Math.random() * 0.4
      this.velocities[i3] += ux * strength
      this.velocities[i3 + 1] += uy * strength
      this.velocities[i3 + 2] += uz * strength

      // Un pulso defensivo puede derribar a un líder; el relevo es inmediato.
      if (wasLeader) this._downLeader(i)
    }
  }

  _buildGrid() {
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
      const i3 = i * 3
      let cx = Math.floor((positions[i3] + BOUNDS.x) / cellSize)
      let cy = Math.floor((positions[i3 + 1] + BOUNDS.y) / cellSize)
      let cz = Math.floor((positions[i3 + 2] + BOUNDS.z) / cellSize)
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
  }

  /**
   * Un paso de simulación.
   * @param {number} dt segundos
   */
  update(dt) {
    const step = Math.min(dt, 0.04)
    const p = this.params
    const positions = this.positions
    const velocities = this.velocities
    const states = this.states
    const stateTimers = this.stateTimers
    const planTimers = this.planTimers
    const sectors = this.sectors
    const laneJitter = this.laneJitter
    const count = this.count
    if (count === 0) return

    this._buildGrid()
    if (this.target) {
      this._updateDefense(step)
      this._updateStrategy(step)
    }

    // Recuperación de líderes derribados.
    for (let i = 0; i < count; i += 1) {
      if (this.downTimers[i] > 0) {
        this.downTimers[i] -= step
        if (this.downTimers[i] <= 0) this._onRecover(i)
      }
    }

    const { nx, ny, nz, cellStart, cellItems } = this
    const perceptionSq = p.perception * p.perception
    const separationSq = p.separationRadius * p.separationRadius
    const maxSpeed = p.maxSpeed
    const maxForce = p.maxForce
    const target = this.target
    const targetX = target ? target.x : 0
    const targetY = target ? target.y : 0
    const targetZ = target ? target.z : 0
    const shield = this.shield
    const defenseActive = p.defense > 0.05
    const sectorDirs = SECTOR_DIRS
    const pulseCharge = this.pulseCharge

    const edgeX = BOUNDS.x - p.edgeMargin
    const edgeY = BOUNDS.y - p.edgeMargin
    const edgeZ = BOUNDS.z - p.edgeMargin
    const wrapX = BOUNDS.x + 14
    const wrapY = BOUNDS.y + 14
    const wrapZ = BOUNDS.z + 14

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3
      const px = positions[i3]
      const py = positions[i3 + 1]
      const pz = positions[i3 + 2]
      const vx = velocities[i3]
      const vy = velocities[i3 + 1]
      const vz = velocities[i3 + 2]
      const state = states[i]

      let sepX = 0
      let sepY = 0
      let sepZ = 0
      let aliX = 0
      let aliY = 0
      let aliZ = 0
      let cohX = 0
      let cohY = 0
      let cohZ = 0
      let aliCount = 0
      let cohCount = 0

      const cell = this.cellOf[i]
      const cz = (cell / (nx * ny)) | 0
      const rem = cell - cz * nx * ny
      const cy = (rem / nx) | 0
      const cx = rem - cy * nx

      const zMin = cz > 0 ? cz - 1 : 0
      const zMax = cz < nz - 1 ? cz + 1 : nz - 1
      const yMin = cy > 0 ? cy - 1 : 0
      const yMax = cy < ny - 1 ? cy + 1 : ny - 1
      const xMin = cx > 0 ? cx - 1 : 0
      const xMax = cx < nx - 1 ? cx + 1 : nx - 1

      for (let gz = zMin; gz <= zMax; gz += 1) {
        for (let gy = yMin; gy <= yMax; gy += 1) {
          const rowBase = nx * (gy + ny * gz)
          for (let gx = xMin; gx <= xMax; gx += 1) {
            const neighbourCell = rowBase + gx
            const start = cellStart[neighbourCell]
            const end = cellStart[neighbourCell + 1]

            for (let k = start; k < end; k += 1) {
              const j = cellItems[k]
              if (j === i) continue
              const j3 = j * 3
              const dx = positions[j3] - px
              const dy = positions[j3 + 1] - py
              const dz = positions[j3 + 2] - pz
              const distSq = dx * dx + dy * dy + dz * dz
              if (distSq === 0 || distSq > perceptionSq) continue

              aliX += velocities[j3]
              aliY += velocities[j3 + 1]
              aliZ += velocities[j3 + 2]
              aliCount += 1

              cohX += positions[j3]
              cohY += positions[j3 + 1]
              cohZ += positions[j3 + 2]
              cohCount += 1

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
        fx += ax * p.separation
        fy += ay * p.separation
        fz += az * p.separation
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
            ? p.cohesion * (state === STATE.DIVE ? 0.2 : 0.5)
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
            if (stateTimers[i] <= 0) states[i] = STATE.DIVE
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
            // Impacto confirmado.
            states[i] = STATE.RETREAT
            stateTimers[i] = 0.45 + Math.random() * 0.5
            this.pendingImpacts += 1
            desiredX = -ux * maxSpeed
            desiredY = -uy * maxSpeed
            desiredZ = -uz * maxSpeed
            behaviorWeight = p.seek * 1.15
          } else if (defenseActive && dist < SHIELD_RADIUS) {
            // El escudo cubre este ángulo: el ataque es rechazado.
            const outX = -ux
            const outY = -uy
            const outZ = -uz
            const shieldDot =
              outX * shield.x + outY * shield.y + outZ * shield.z
            if (shieldDot > SHIELD_COS) {
              states[i] = STATE.EVADE
              stateTimers[i] = 0.5 + Math.random() * 0.45
              this.pendingBlocks += 1
              const kick = 5 + p.defense * 3
              velocities[i3] += outX * kick
              velocities[i3 + 1] += outY * kick
              velocities[i3 + 2] += outZ * kick
              desiredX = outX * maxSpeed
              desiredY = outY * maxSpeed
              desiredZ = outZ * maxSpeed
              behaviorWeight = p.seek * 1.25
            }
          } else if (
            defenseActive &&
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
    }
  }
}
