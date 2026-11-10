import {
  LEADER_DOWN_TIME,
  SQUAD_COUNT,
  SQUAD_LETTERS,
} from './constants.js'

/**
 * Cadena de mando: códigos estables, líderes por escuadrón, comandante y
 * relevos automáticos. No conoce la simulación de vuelo ni el render.
 */
export class CommandChain {
  constructor({ maxCount, count, rng }) {
    this.maxCount = maxCount
    this.count = count
    this.rng = rng
    this.downTimers = new Float32Array(maxCount)
    this.leaderOfSquad = new Int32Array(SQUAD_COUNT).fill(-1)
    this.commander = -1
    this.commandVersion = 0
    this.commandLog = []
  }

  setCount(count) {
    this.count = count
  }

  getCode(index) {
    const letter = SQUAD_LETTERS[index % SQUAD_COUNT]
    const rank = Math.floor(index / SQUAD_COUNT) + 1
    return `${letter}-${String(rank).padStart(3, '0')}`
  }

  isDown(index) {
    return this.downTimers[index] > 0
  }

  getDownTime(index) {
    return this.downTimers[index]
  }

  isLeader(index) {
    if (index === this.commander) return true
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      if (this.leaderOfSquad[s] === index) return true
    }
    return false
  }

  getLeaderIndices() {
    return Array.from(this.leaderOfSquad)
  }

  leaderSet() {
    const leaders = new Set()
    if (this.commander >= 0) leaders.add(this.commander)
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      if (this.leaderOfSquad[s] >= 0) leaders.add(this.leaderOfSquad[s])
    }
    return leaders
  }

  log(message) {
    this.commandLog.unshift(message)
    if (this.commandLog.length > 4) this.commandLog.length = 4
  }

  findSquadLeader(squad, exclude = -1) {
    for (let i = squad; i < this.count; i += SQUAD_COUNT) {
      if (i !== exclude && this.downTimers[i] <= 0) return i
    }
    return -1
  }

  /** El siguiente código activo del escuadrón tras el líder derribado. */
  nextSquadLeader(squad, currentIndex) {
    for (let i = currentIndex + SQUAD_COUNT; i < this.count; i += SQUAD_COUNT) {
      if (this.downTimers[i] <= 0) return i
    }
    // Si no queda ningún código posterior activo, se cierra el círculo.
    for (let i = squad; i < currentIndex; i += SQUAD_COUNT) {
      if (this.downTimers[i] <= 0) return i
    }
    return -1
  }

  selectCommander() {
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

  init() {
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      this.leaderOfSquad[s] = this.findSquadLeader(s)
    }
    this.selectCommander()
    this.commandVersion += 1
    this.commandLog = []
    const code = this.commander >= 0 ? this.getCode(this.commander) : 'sin líder'
    this.log(`Mando inicial · ${code}`)
  }

  ensure() {
    let changed = false
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const leader = this.leaderOfSquad[s]
      if (leader < 0 || leader >= this.count || this.downTimers[leader] > 0) {
        this.leaderOfSquad[s] = this.findSquadLeader(s, leader)
        changed = true
      }
    }
    if (
      this.commander < 0 ||
      this.commander >= this.count ||
      this.downTimers[this.commander] > 0
    ) {
      this.selectCommander()
      changed = true
    }
    if (changed) this.commandVersion += 1
  }

  /**
   * Derribo de un líder. Devuelve `null` si el índice no era líder o ya
   * estaba derribado; Flock3D se encarga del estado de vuelo y del evento.
   */
  downLeader(index) {
    if (index < 0 || index >= this.count || this.downTimers[index] > 0) {
      return null
    }

    const wasCommander = this.commander === index
    let wasSquad = -1
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      if (this.leaderOfSquad[s] === index) {
        wasSquad = s
        break
      }
    }
    if (!wasCommander && wasSquad < 0) return null

    this.downTimers[index] = LEADER_DOWN_TIME + this.rng()

    if (wasSquad >= 0) {
      const nextLeader = this.nextSquadLeader(wasSquad, index)
      this.leaderOfSquad[wasSquad] = nextLeader
      const oldCode = this.getCode(index)
      const nextCode =
        nextLeader >= 0 ? this.getCode(nextLeader) : 'sin relevo'
      this.log(
        `${oldCode} derribada · ${nextCode} asume el escuadrón ${SQUAD_LETTERS[wasSquad]}`,
      )
    }

    this.selectCommander()
    if (wasCommander && this.commander !== index) {
      if (this.commander >= 0) {
        this.log(`${this.getCode(this.commander)} toma el mando del enjambre`)
      } else {
        this.log('Sin relevo disponible · mando en espera')
      }
    }

    this.commandVersion += 1
    return { index, wasCommander, wasSquad }
  }

  recover(index) {
    const squad = index % SQUAD_COUNT
    if (this.leaderOfSquad[squad] < 0) {
      this.leaderOfSquad[squad] = this.findSquadLeader(squad)
      this.commandVersion += 1
    }
    if (this.commander < 0) {
      this.selectCommander()
      this.commandVersion += 1
    }
  }

  /** Recupera a los líderes derribados; devuelve cuántos volvieron. */
  tick(dt) {
    let recovered = 0
    for (let i = 0; i < this.count; i += 1) {
      if (this.downTimers[i] > 0) {
        this.downTimers[i] -= dt
        if (this.downTimers[i] <= 0) {
          this.recover(i)
          recovered += 1
        }
      }
    }
    return recovered
  }

  getInfo() {
    const squads = []
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const index = this.leaderOfSquad[s]
      squads.push({
        letter: SQUAD_LETTERS[s],
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
      log: this.commandLog.slice(0, 4),
      version: this.commandVersion,
    }
  }
}
