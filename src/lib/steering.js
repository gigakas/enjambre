import {
  BOMB_INTERCEPT_RADIUS,
  BOUNDS,
  PLAY_BOUNDS,
  PULSE_RADIUS,
  RETREAT_CHARGE,
  SHIELD_COS,
  SHIELD_RADIUS,
  SQUAD_COUNT,
  STAGE_RADIUS,
  STATE,
} from './constants.js'
import { SECTOR_DIRS } from './sectors.js'

const WRAP_MARGIN = 14
const WRAP_X = PLAY_BOUNDS.x + WRAP_MARGIN
const WRAP_Y = PLAY_BOUNDS.y + WRAP_MARGIN
const WRAP_Z = PLAY_BOUNDS.z + WRAP_MARGIN

/**
 * Un paso de vuelo del enjambre: vecinas, boids, FSM, integración y bordes.
 * Se mantiene separado de Flock3D para que la orquestación (defensa, juego,
 * mando) no comparta archivo con el hot path de la simulación.
 */
export class SteeringSystem {
  constructor(flock) {
    this.flock = flock
    this.neighbors = {
      sepX: 0,
      sepY: 0,
      sepZ: 0,
      aliX: 0,
      aliY: 0,
      aliZ: 0,
      cohX: 0,
      cohY: 0,
      cohZ: 0,
      aliCount: 0,
      cohCount: 0,
    }
    this.behavior = {
      fx: 0,
      fy: 0,
      fz: 0,
    }
  }

  step(step) {
    const flock = this.flock
    const p = flock.params
    const positions = flock.positions
    const velocities = flock.velocities
    const states = flock.states
    const combat = flock.combat
    const health = combat.health
    const count = flock.count
    if (count === 0) return

    const perceptionSq = p.perception * p.perception
    const separationSq = p.separationRadius * p.separationRadius
    const maxSpeed = p.maxSpeed
    const maxForce = p.maxForce
    // El slider permite maxSpeed < minSpeed; no dejamos que la velocidad
    // mínima gane a la máxima.
    const minSpeed = Math.min(p.minSpeed, maxSpeed)
    const target = flock.target
    const targetX = target ? target.x : 0
    const targetY = target ? target.y : 0
    const targetZ = target ? target.z : 0
    const shield = flock.defense.shield
    const defenseActive = p.defense > 0.05
    const pulseCharge = flock.defense.pulseCharge
    const behavior = this.behavior
    const limits = target ? PLAY_BOUNDS : BOUNDS
    const edgeX = limits.x - p.edgeMargin
    const edgeY = limits.y - p.edgeMargin
    const edgeZ = limits.z - p.edgeMargin

    for (let i = 0; i < count; i += 1) {
      if (health[i] <= 0) continue
      const i3 = i * 3
      const px = positions[i3]
      const py = positions[i3 + 1]
      const pz = positions[i3 + 2]
      const vx = velocities[i3]
      const vy = velocities[i3 + 1]
      const vz = velocities[i3 + 2]
      const state = states[i]

      const neighbors = this._collectNeighbors(
        i,
        px,
        py,
        pz,
        perceptionSq,
        separationSq,
      )

      let fx = 0
      let fy = 0
      let fz = 0

      // --- Separación ---
      const sepMag = Math.sqrt(
        neighbors.sepX * neighbors.sepX +
          neighbors.sepY * neighbors.sepY +
          neighbors.sepZ * neighbors.sepZ,
      )
      if (sepMag > 1e-5) {
        let ax = (neighbors.sepX / sepMag) * maxSpeed - vx
        let ay = (neighbors.sepY / sepMag) * maxSpeed - vy
        let az = (neighbors.sepZ / sepMag) * maxSpeed - vz
        const aMag = Math.sqrt(ax * ax + ay * ay + az * az)
        if (aMag > maxForce) {
          const k = maxForce / aMag
          ax *= k
          ay *= k
          az *= k
        }
        // Las aves con memoria de daño se separan más.
        const separationWeight = p.separation * (1 + combat.caution[i] * 0.5)
        fx += ax * separationWeight
        fy += ay * separationWeight
        fz += az * separationWeight
      }

      // --- Alineación ---
      if (neighbors.aliCount > 0) {
        const aliX = neighbors.aliX / neighbors.aliCount
        const aliY = neighbors.aliY / neighbors.aliCount
        const aliZ = neighbors.aliZ / neighbors.aliCount
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
      if (neighbors.cohCount > 0) {
        const dx = neighbors.cohX / neighbors.cohCount - px
        const dy = neighbors.cohY / neighbors.cohCount - py
        const dz = neighbors.cohZ / neighbors.cohCount - pz
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
              (1 - combat.caution[i] * 0.12)
            : p.cohesion
          fx += ax * cohesionWeight
          fy += ay * cohesionWeight
          fz += az * cohesionWeight
        }
      }

      // --- Comportamiento según la FSM ---
      if (target) {
        this._updateBehavior(
          i,
          state,
          step,
          targetX,
          targetY,
          targetZ,
          p,
          pulseCharge,
          defenseActive,
          shield,
        )
        fx += behavior.fx
        fy += behavior.fy
        fz += behavior.fz
      }

      // --- Esquiva: si detecta el disparo, se desplaza lateralmente ---
      if (combat.threatTimers[i] > 0) {
        const urgency =
          (combat.threatTimers[i] > 0.35 ? 1.35 : 0.85) *
          (1 + combat.caution[i] * 0.4)
        fx += combat.dodgeX[i] * maxForce * urgency
        fy += combat.dodgeY[i] * maxForce * urgency
        fz += combat.dodgeZ[i] * maxForce * urgency
      }

      // --- Bordes: giro suave hacia el interior ---
      if (px < -edgeX) fx += ((-edgeX - px) / p.edgeMargin) * 9
      else if (px > edgeX) fx -= ((px - edgeX) / p.edgeMargin) * 9
      if (py < -edgeY) fy += ((-edgeY - py) / p.edgeMargin) * 9
      else if (py > edgeY) fy -= ((py - edgeY) / p.edgeMargin) * 9
      if (pz < -edgeZ) fz += ((-edgeZ - pz) / p.edgeMargin) * 9
      else if (pz > edgeZ) fz -= ((pz - edgeZ) / p.edgeMargin) * 9

      this._integrate(
        i,
        px,
        py,
        pz,
        vx,
        vy,
        vz,
        fx,
        fy,
        fz,
        step,
        maxSpeed,
        minSpeed,
        p.maxForce,
      )
    }
  }

  _collectNeighbors(i, px, py, pz, perceptionSq, separationSq) {
    const flock = this.flock
    const out = this.neighbors
    out.sepX = 0
    out.sepY = 0
    out.sepZ = 0
    out.aliX = 0
    out.aliY = 0
    out.aliZ = 0
    out.cohX = 0
    out.cohY = 0
    out.cohZ = 0
    out.aliCount = 0
    out.cohCount = 0

    const { nx, ny, nz, cellStart, cellItems, cellOf } = flock.grid
    const positions = flock.positions
    const velocities = flock.velocities
    const separationRadius = flock.params.separationRadius

    const cell = cellOf[i]
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

            out.aliX += velocities[j3]
            out.aliY += velocities[j3 + 1]
            out.aliZ += velocities[j3 + 2]
            out.aliCount += 1

            out.cohX += positions[j3]
            out.cohY += positions[j3 + 1]
            out.cohZ += positions[j3 + 2]
            out.cohCount += 1

            if (distSq < separationSq) {
              const dist = Math.sqrt(distSq)
              const weight = 1 - dist / separationRadius
              out.sepX -= (dx / dist) * weight
              out.sepY -= (dy / dist) * weight
              out.sepZ -= (dz / dist) * weight
            }
          }
        }
      }
    }

    return out
  }

  _updateBehavior(
    i,
    state,
    step,
    targetX,
    targetY,
    targetZ,
    p,
    pulseCharge,
    defenseActive,
    shield,
  ) {
    const flock = this.flock
    const behavior = this.behavior
    behavior.fx = 0
    behavior.fy = 0
    behavior.fz = 0

    const i3 = i * 3
    const px = flock.positions[i3]
    const py = flock.positions[i3 + 1]
    const pz = flock.positions[i3 + 2]
    const dx = targetX - px
    const dy = targetY - py
    const dz = targetZ - pz
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const invDist = 1 / Math.max(dist, 0.0001)
    const maxSpeed = p.maxSpeed
    const states = flock.states
    const combat = flock.combat
    const battleActive = combat.battleState === 'active'

    let desiredX = 0
    let desiredY = 0
    let desiredZ = 0
    let behaviorWeight = 0

    if (state === STATE.DISTRIBUTE || state === STATE.STAGE) {
      // Punto de espera del sector elegido.
      const sector = SECTOR_DIRS[flock.sectors[i]]
      const stagingX = targetX + sector.x * STAGE_RADIUS + flock.laneJitter[i3]
      const stagingY =
        targetY + sector.y * STAGE_RADIUS + flock.laneJitter[i3 + 1]
      const stagingZ =
        targetZ + sector.z * STAGE_RADIUS + flock.laneJitter[i3 + 2]

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
        const shieldDot = outX * shield.x + outY * shield.y + outZ * shield.z
        if (shieldDot > SHIELD_COS) {
          const push = ((shieldDot - SHIELD_COS) / (1 - SHIELD_COS)) * 11
          behavior.fx += outX * push
          behavior.fy += outY * push
          behavior.fz += outZ * push
        }
      }

      if (state === STATE.DISTRIBUTE) {
        if (stagingDist < 7) {
          states[i] = STATE.STAGE
          flock.stateTimers[i] = 0.15 + flock.random() * 0.35
        }
      } else {
        flock.stateTimers[i] -= step
        if (flock.stateTimers[i] <= 0) {
          // Plan ordenado: solo la oleada activa (dos escuadrones) se lanza.
          const squad = i % SQUAD_COUNT
          const inWave =
            squad === combat.orderedSquad ||
            squad === (combat.orderedSquad + 1) % SQUAD_COUNT
          if (combat.attackPlan === 'ordenado' && !inWave) {
            flock.stateTimers[i] = 0.35
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
        if (defenseActive && battleActive && dist < SHIELD_RADIUS) {
          shieldDot = -ux * shield.x + -uy * shield.y + -uz * shield.z
        }

        if (shieldDot > SHIELD_COS) {
          states[i] = STATE.EVADE
          flock.stateTimers[i] = 0.5 + flock.random() * 0.45
          flock.pendingBlocks += 1
          const kick = 5 + p.defense * 3
          flock.velocities[i3] -= ux * kick
          flock.velocities[i3 + 1] -= uy * kick
          flock.velocities[i3 + 2] -= uz * kick
          desiredX = -ux * maxSpeed
          desiredY = -uy * maxSpeed
          desiredZ = -uz * maxSpeed
          behaviorWeight = p.seek * 1.25
        } else if (battleActive && combat.collisionTimers[i] <= 0) {
          // Colisión confirmada: solo así el objetivo pierde salud.
          combat.applyCollision(i)
          flock.pendingImpacts += 1
          states[i] = STATE.RETREAT
          flock.stateTimers[i] = 2.2 + flock.random() * 1.4
          const kick = 5 + p.defense * 2
          flock.velocities[i3] -= ux * kick
          flock.velocities[i3 + 1] -= uy * kick
          flock.velocities[i3 + 2] -= uz * kick
          desiredX = -ux * maxSpeed
          desiredY = -uy * maxSpeed
          desiredZ = -uz * maxSpeed
          behaviorWeight = p.seek * 1.2
        }
      } else if (
        defenseActive &&
        battleActive &&
        pulseCharge > RETREAT_CHARGE &&
        dist < PULSE_RADIUS * 0.95
      ) {
        // Los líderes ordenan repliegue antes de que el pulso se libere.
        states[i] = STATE.RETREAT
        flock.stateTimers[i] = 0.35 + flock.random() * 0.35
        desiredX = -ux * maxSpeed
        desiredY = -uy * maxSpeed
        desiredZ = -uz * maxSpeed
        behaviorWeight = p.seek * 1.2
      }
    } else if (state === STATE.INTERCEPT) {
      // Derribo de una bomba: se vuela hasta su trayectoria y se choca.
      const bombId = combat.interceptTarget[i]
      const bomb =
        bombId >= 0
          ? combat.bombs.find((item) => item.id === bombId)
          : null

      if (!bomb) {
        states[i] = STATE.DISTRIBUTE
        flock.stateTimers[i] = 0
        flock.planTimers[i] = 0.1 + flock.random() * 0.4
      } else {
        const bdx = bomb.x - px
        const bdy = bomb.y - py
        const bdz = bomb.z - pz
        const bombDist = Math.sqrt(bdx * bdx + bdy * bdy + bdz * bdz)

        const lead = Math.min(0.6, bombDist / 40)
        const tdx = bomb.x + bomb.vx * lead - px
        const tdy = bomb.y + bomb.vy * lead - py
        const tdz = bomb.z + bomb.vz * lead - pz
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz) || 1

        desiredX = (tdx / tdist) * maxSpeed
        desiredY = (tdy / tdist) * maxSpeed
        desiredZ = (tdz / tdist) * maxSpeed
        behaviorWeight = p.seek * 1.6

        if (bombDist < BOMB_INTERCEPT_RADIUS * 1.6) {
          states[i] = STATE.EVADE
          flock.stateTimers[i] = 0.45 + flock.random() * 0.35
          const kick = 4 + p.defense
          flock.velocities[i3] += bomb.vx * 0.16 * kick
          flock.velocities[i3 + 1] += bomb.vy * 0.16 * kick
          flock.velocities[i3 + 2] += bomb.vz * 0.16 * kick
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
      const ddx = outX + tx * swirl
      const ddy = outY
      const ddz = outZ + tz * swirl
      const dm = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1
      desiredX = (ddx / dm) * maxSpeed
      desiredY = (ddy / dm) * maxSpeed
      desiredZ = (ddz / dm) * maxSpeed
      behaviorWeight = p.seek * (state === STATE.EVADE ? 1.4 : 1.1)

      flock.stateTimers[i] -= step
      if (flock.stateTimers[i] <= 0) {
        states[i] = STATE.DISTRIBUTE
        flock.planTimers[i] = 0.1 + flock.random() * 0.4
      }
    }

    if (behaviorWeight > 0) {
      let ax = desiredX - flock.velocities[i3]
      let ay = desiredY - flock.velocities[i3 + 1]
      let az = desiredZ - flock.velocities[i3 + 2]
      const aMag = Math.sqrt(ax * ax + ay * ay + az * az)
      if (aMag > p.maxForce) {
        const k = p.maxForce / aMag
        ax *= k
        ay *= k
        az *= k
      }
      behavior.fx += ax * behaviorWeight
      behavior.fy += ay * behaviorWeight
      behavior.fz += az * behaviorWeight
    }

    // Actualización escalonada de la mejor respuesta (una sola ave
    // en cada vuelta), lo que estabiliza la distribución.
    if (states[i] === STATE.DISTRIBUTE || states[i] === STATE.STAGE) {
      flock.planTimers[i] -= step
      if (flock.planTimers[i] <= 0) {
        flock._bestResponse(i)
        flock.planTimers[i] = 1 + flock.random() * 1.5
      }
    }
  }

  _integrate(
    i,
    px,
    py,
    pz,
    vx,
    vy,
    vz,
    fx,
    fy,
    fz,
    step,
    maxSpeed,
    minSpeed,
    maxForce,
  ) {
    const flock = this.flock
    const positions = flock.positions
    const velocities = flock.velocities
    const i3 = i * 3

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
    } else if (speed < minSpeed) {
      if (speed < 0.001) {
        const theta = flock.rand(0, Math.PI * 2)
        const cosPhi = flock.rand(-1, 1)
        const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
        nvx = Math.cos(theta) * sinPhi * minSpeed
        nvy = cosPhi * minSpeed
        nvz = Math.sin(theta) * sinPhi * minSpeed
      } else {
        const k = minSpeed / speed
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

    if (nxPos < -WRAP_X) nxPos = WRAP_X
    else if (nxPos > WRAP_X) nxPos = -WRAP_X
    if (nyPos < -WRAP_Y) nyPos = WRAP_Y
    else if (nyPos > WRAP_Y) nyPos = -WRAP_Y
    if (nzPos < -WRAP_Z) nzPos = WRAP_Z
    else if (nzPos > WRAP_Z) nzPos = -WRAP_Z

    positions[i3] = nxPos
    positions[i3 + 1] = nyPos
    positions[i3 + 2] = nzPos
  }
}
