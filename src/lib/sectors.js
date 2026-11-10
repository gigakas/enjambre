import {
  SECTOR_COUNT,
  SHIELD_COS,
  SQUAD_COUNT,
  STATE,
} from './constants.js'

/**
 * Teoría de juegos: cada ave elige uno de estos sectores alrededor del
 * objetivo. El pago penaliza la congestión y la exposición al escudo.
 */
export const SECTOR_DIRS = buildSectorDirections(SECTOR_COUNT)

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
 * Contadores de ocupación y mejor respuesta del juego de congestión.
 * No conoce Vue, Three.js ni la FSM: solo lee el contexto que le pasa Flock3D.
 */
export class SectorGame {
  constructor() {
    this.sectorCounts = new Int32Array(SECTOR_COUNT)
  }

  recompute(count, states, sectors) {
    const counts = this.sectorCounts
    counts.fill(0)
    for (let i = 0; i < count; i += 1) {
      const state = states[i]
      if (state !== STATE.RETREAT && state !== STATE.EVADE) {
        counts[sectors[i]] += 1
      }
    }
  }

  /**
   * Mejor respuesta de un ave:
   * pago(s) = -distribución·congestión(s) - defensa·riesgoEscudo(s)
   *           - desplazamiento(s) + orden del escuadrón + inercia.
   */
  bestResponse(index, ctx) {
    const {
      positions,
      target,
      shield,
      params,
      count,
      squadSectors,
      sectors,
      random,
    } = ctx
    if (!target) return

    const i3 = index * 3
    let dx = positions[i3] - target.x
    let dy = positions[i3 + 1] - target.y
    let dz = positions[i3 + 2] - target.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    let dirX = 0
    let dirY = 0
    let dirZ = 0
    if (dist > 0.0001) {
      dirX = dx / dist
      dirY = dy / dist
      dirZ = dz / dist
    }

    const current = sectors[index]
    const average = Math.max(1, count / SECTOR_COUNT)
    const distribution = params.distribution
    const defense = params.defense
    const squad = index % SQUAD_COUNT
    const orderedSector = squadSectors[squad]
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
      const travel = 1 - (dir.x * dirX + dir.y * dirY + dir.z * dirZ)

      let score =
        -distribution * crowd -
        defense * 3.2 * risk -
        0.22 * travel
      // Orden del líder: empuja al escuadrón hacia su flanco asignado
      // sin imponerlo, para que el juego de congestión siga repartiendo.
      score +=
        (dir.x * orderDir.x + dir.y * orderDir.y + dir.z * orderDir.z) * 0.55
      if (s === orderedSector) score += 0.2
      score += (random() - 0.5) * 0.22

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
      sectors[index] = best
    }
  }

  /**
   * Los líderes acuerdan un sector distinto para cada escuadrón evitando
   * el escudo y repartiendo la presión. Esa orden sesga el juego de cada ave.
   */
  planStrategy(ctx) {
    const { count, shield, params, commander, squadSectors, random } = ctx
    const used = new Array(SECTOR_COUNT).fill(false)
    const order = []
    const commanderSquad = commander >= 0 ? commander % SQUAD_COUNT : 0

    order.push(commanderSquad)
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      if (s !== commanderSquad) order.push(s)
    }

    const average = Math.max(1, count / SECTOR_COUNT)

    for (const squad of order) {
      let best = -1
      let bestScore = -Infinity

      for (let s = 0; s < SECTOR_COUNT; s += 1) {
        if (used[s]) continue
        const dir = SECTOR_DIRS[s]
        const shieldDot = dir.x * shield.x + dir.y * shield.y + dir.z * shield.z
        let risk = 0
        if (shieldDot > SHIELD_COS) {
          risk = (shieldDot - SHIELD_COS) / (1 - SHIELD_COS)
          risk *= risk
        }
        const crowd = this.sectorCounts[s] / average
        const score =
          -risk * 4.5 -
          crowd * 0.35 * (1 + params.distribution) +
          random() * 0.4
        if (score > bestScore) {
          bestScore = score
          best = s
        }
      }

      if (best >= 0) {
        used[best] = true
        squadSectors[squad] = best
      }
    }
  }
}
