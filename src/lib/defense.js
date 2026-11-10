import { clamp } from './constants.js'

/**
 * Defensa del objetivo: escudo direccional adaptativo y pulsos radiales.
 * El escudo persigue al sector más congestionado; el pulso se anuncia con
 * `pulseCharge` y dispara un callback para que Flock3D derribe líderes.
 */
export class DefenseSystem {
  constructor({ rng }) {
    this.rng = rng
    this.shield = { x: 1, y: 0, z: 0 }
    this.shieldTarget = { x: 1, y: 0, z: 0 }
    this.pulseTimer = 5
    this.pulseCharge = 0
    this.sectorClock = 0
    this.pendingPulses = 0
  }

  setShield(x, y, z) {
    let length = Math.sqrt(x * x + y * y + z * z)
    if (length > 0.0001) {
      x /= length
      y /= length
      z /= length
    } else {
      x = 1
      y = 0
      z = 0
    }
    this.shield.x = x
    this.shield.y = y
    this.shield.z = z
    this.shieldTarget.x = x
    this.shieldTarget.y = y
    this.shieldTarget.z = z
  }

  beginTarget() {
    this.pulseTimer = 4.5 + this.rng() * 1.5
    this.pulseCharge = 0
    this.sectorClock = 0
    this.pendingPulses = 0
  }

  clear() {
    this.pulseCharge = 0
    this.pendingPulses = 0
  }

  reset() {
    this.pulseTimer = 5
    this.pulseCharge = 0
    this.sectorClock = 0
    this.pendingPulses = 0
  }

  consumePulses() {
    const pulses = this.pendingPulses
    this.pendingPulses = 0
    return pulses
  }

  recordPulse() {
    this.pendingPulses += 1
  }

  update(dt, ctx) {
    const { target, params, sectorCounts, sectorDirs, recomputeSectors, onPulse } =
      ctx
    if (!target) return

    const defense = params.defense
    const defenseActive = defense > 0.05

    this.sectorClock += dt
    if (this.sectorClock >= 0.22) {
      this.sectorClock = 0
      recomputeSectors()

      // El escudo persigue al sector con más aves: defensa adaptativa.
      let best = -1
      let bestCount = 0
      for (let s = 0; s < sectorCounts.length; s += 1) {
        if (sectorCounts[s] > bestCount) {
          bestCount = sectorCounts[s]
          best = s
        }
      }
      if (best >= 0) this.shieldTarget = sectorDirs[best]
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
      onPulse()
      this.pulseTimer = 5 + this.rng() * 2
      this.pulseCharge = 0
    }
  }
}
