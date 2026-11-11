import {
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
  DODGE_ALERT_RADIUS,
  ENERGY_REGEN,
  SHOT_DAMAGE,
  SHOT_RADIUS,
  SQUAD_COUNT,
  STATE,
  TARGET_MAX_ENERGY,
  TARGET_MAX_HEALTH,
  TAU,
} from './constants.js'

/**
 * Combate del objetivo: salud/energía, dos metralletas, bombas de expansión,
 * esquiva y aprendizaje defensivo. Vive separado de Flock3D para que el
 * orquestador no vuelva a convertirse en un archivo gigante.
 */
export class CombatSystem {
  constructor(flock, maxCount, count) {
    this.flock = flock
    this.count = count
    this.health = new Uint8Array(maxCount).fill(ATTACKER_MAX_HEALTH)
    this.threatTimers = new Float32Array(maxCount)
    this.caution = new Float32Array(maxCount)
    this.dodgeX = new Float32Array(maxCount)
    this.dodgeY = new Float32Array(maxCount)
    this.dodgeZ = new Float32Array(maxCount)
    this.collisionTimers = new Float32Array(maxCount)
    this.targetHealth = TARGET_MAX_HEALTH
    this.targetEnergy = TARGET_MAX_ENERGY
    this.aliveCount = count
    this.battleState = 'idle'
    this.attackPlan = 'dividido'
    this.orderedSquad = 0
    this.waveTimer = 0
    this.cannons = this._createCannons()
    this.pendingShots = []
    this.pendingKills = []
    this.pendingCollisions = 0
    this.bombs = []
    this.bombStock = BOMB_COUNT
    this.bombCooldown = 0
    this.bombId = 0
    this.bombPlanTimer = 0
    this.bombInterceptions = 0
    this.interceptTarget = new Int32Array(maxCount).fill(-1)
    this.pendingBombs = []
  }

  isAlive(index) {
    return this.health[index] > 0
  }

  setCount(count) {
    this.count = count
    this.recountAlive()
  }

  respawn(index) {
    this.health[index] = ATTACKER_MAX_HEALTH
    this.threatTimers[index] = 0
    this.caution[index] = 0
    this.collisionTimers[index] = 0
    this.interceptTarget[index] = -1
  }

  recountAlive() {
    let alive = 0
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] > 0) alive += 1
    }
    this.aliveCount = alive
  }

  seedReset() {
    this.health.fill(ATTACKER_MAX_HEALTH)
    this.threatTimers.fill(0)
    this.caution.fill(0)
    this.collisionTimers.fill(0)
    this.interceptTarget.fill(-1)
    this.targetHealth = TARGET_MAX_HEALTH
    this.targetEnergy = TARGET_MAX_ENERGY
    this.battleState = 'idle'
    this.attackPlan = 'dividido'
    this.orderedSquad = 0
    this.waveTimer = 0
    this.pendingShots = []
    this.pendingKills = []
    this.pendingCollisions = 0
    this._resetCannons()
    this._resetBombs()
    this.recountAlive()
  }

  beginRound() {
    for (let i = 0; i < this.flock.count; i += 1) {
      if (this.health[i] <= 0) this.flock.respawn(i)
      this.health[i] = ATTACKER_MAX_HEALTH
      this.threatTimers[i] = 0
      this.collisionTimers[i] = 0
      this.interceptTarget[i] = -1
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
    this.recountAlive()
  }

  clear() {
    this.targetHealth = TARGET_MAX_HEALTH
    this.targetEnergy = TARGET_MAX_ENERGY
    this.battleState = 'idle'
    this.threatTimers.fill(0)
    this.collisionTimers.fill(0)
    this.interceptTarget.fill(-1)
    this.pendingShots = []
    this.pendingKills = []
    this.pendingCollisions = 0
    this._resetCannons()
    this._resetBombs()
  }

  applyCollision(index) {
    this.targetHealth = Math.max(0, this.targetHealth - COLLISION_DAMAGE)
    this.collisionTimers[index] = COLLISION_COOLDOWN
    this.pendingCollisions += 1
    return true
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

  _resetBombs() {
    this.bombs.length = 0
    this.bombStock = BOMB_COUNT
    this.bombCooldown = 0
    this.bombPlanTimer = 0
    this.bombInterceptions = 0
    this.pendingBombs.length = 0
    this.interceptTarget.fill(-1)
  }

  _clearBombs() {
    if (this.bombs.length === 0) return
    this.bombs.length = 0
    this.interceptTarget.fill(-1)
    this.bombInterceptions = 0
  }

  /** Derribo definitivo de un atacante: su salud llega a cero. */
  _killAttacker(index, quiet = false) {
    if (index < 0 || index >= this.count || this.health[index] <= 0) return
    this.health[index] = 0
    this.flock.command.downTimers[index] = Infinity
    this.flock.states[index] = STATE.EVADE
    this.threatTimers[index] = 0
    this.collisionTimers[index] = 0
    this.interceptTarget[index] = -1
    this.aliveCount = Math.max(0, this.aliveCount - 1)

    const i3 = index * 3
    this.pendingKills.push({
      x: this.flock.positions[i3],
      y: this.flock.positions[i3 + 1],
      z: this.flock.positions[i3 + 2],
      index,
    })

    if (!quiet) {
      this.flock.command.ensure()
      this.flock._recomputeSectorCounts()
    }
  }

  _checkBattleState() {
    if (this.battleState !== 'active') return
    if (this.targetHealth <= 0) {
      this.targetHealth = 0
      this.battleState = 'target-down'
      this.flock.command.log('log.targetDown')
      this._resetCannons()
      this._clearBombs()
      for (let i = 0; i < this.count; i += 1) {
        if (this.health[i] <= 0) continue
        this.flock.states[i] = STATE.DISTRIBUTE
        this.flock.stateTimers[i] = 0
      }
      return
    }
    if (this.aliveCount <= 0) {
      this.battleState = 'swarm-down'
      this.flock.command.log('log.swarmDown')
      this._resetCannons()
      this._clearBombs()
    }
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
    const flock = this.flock
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const dx = flock.positions[i3] - cannon.originX
      const dy = flock.positions[i3 + 1] - cannon.originY
      const dz = flock.positions[i3 + 2] - cannon.originZ
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > CANNON_RANGE) continue

      let score = dist * 0.35 + flock.random() * 4
      if (flock.states[i] === STATE.DIVE) score -= 10
      score -= (ATTACKER_MAX_HEALTH - this.health[i]) * 10
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

  _dodgeVector(cannon, index) {
    const i3 = index * 3
    const vx = this.flock.velocities[i3]
    const vy = this.flock.velocities[i3 + 1]
    const vz = this.flock.velocities[i3 + 2]

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
    const sign = this.flock.random() < 0.5 ? -1 : 1
    return {
      x: (px / length) * sign,
      y: (py / length) * sign,
      z: (pz / length) * sign,
    }
  }

  _wanderDodge(cannon, index) {
    const dir = this._dodgeVector(cannon, index)
    this.dodgeX[index] = dir.x
    this.dodgeY[index] = dir.y
    this.dodgeZ[index] = dir.z

    const i3 = index * 3
    const kick = 4 + this.caution[index] * 2
    this.flock.velocities[i3] += dir.x * kick
    this.flock.velocities[i3 + 1] += dir.y * kick
    this.flock.velocities[i3 + 2] += dir.z * kick
  }

  _alertDodge(cannon, index) {
    const dir = this._dodgeVector(cannon, index)
    const px = dir.x
    const py = dir.y
    const pz = dir.z

    this.threatTimers[index] = CANNON_AIM_TIME + 0.35
    this.dodgeX[index] = px
    this.dodgeY[index] = py
    this.dodgeZ[index] = pz

    const i3 = index * 3
    const kick = 7 + this.caution[index] * 2.5
    this.flock.velocities[i3] += px * kick
    this.flock.velocities[i3 + 1] += py * kick
    this.flock.velocities[i3 + 2] += pz * kick

    const alertSq = DODGE_ALERT_RADIUS * DODGE_ALERT_RADIUS
    for (let i = 0; i < this.count; i += 1) {
      if (i === index || this.health[i] <= 0) continue
      const j3 = i * 3
      const dx = this.flock.positions[j3] - cannon.aimX
      const dy = this.flock.positions[j3 + 1] - cannon.aimY
      const dz = this.flock.positions[j3 + 2] - cannon.aimZ
      if (dx * dx + dy * dy + dz * dz > alertSq) continue
      this.threatTimers[i] = Math.max(this.threatTimers[i], 0.45)
      this.dodgeX[i] = px + (this.flock.random() - 0.5) * 0.7
      this.dodgeY[i] = py + (this.flock.random() - 0.5) * 0.7
      this.dodgeZ[i] = pz + (this.flock.random() - 0.5) * 0.7
    }
  }

  _fireCannon(cannon) {
    const ox = cannon.originX
    const oy = cannon.originY
    const oz = cannon.originZ
    const dx = cannon.dirX
    const dy = cannon.dirY
    const dz = cannon.dirZ
    const flock = this.flock

    let hit = -1
    let hitT = Infinity
    const radiusSq = SHOT_RADIUS * SHOT_RADIUS

    const lock = cannon.lockIndex
    if (lock >= 0 && lock < this.count && this.health[lock] > 0) {
      const l3 = lock * 3
      const rx = flock.positions[l3] - ox
      const ry = flock.positions[l3 + 1] - oy
      const rz = flock.positions[l3 + 2] - oz
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
        const rx = flock.positions[i3] - ox
        const ry = flock.positions[i3 + 1] - oy
        const rz = flock.positions[i3 + 2] - oz
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
    const target = this.flock.target
    const mount = CANNON_MOUNTS[cannon.index]
    cannon.originX = target.x + mount.x
    cannon.originY = target.y + mount.y
    cannon.originZ = target.z + mount.z
    cannon.cooldown = Math.max(0, cannon.cooldown - dt)

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
          this.flock.positions[i3] - cannon.originX,
          this.flock.positions[i3 + 1] - cannon.originY,
          this.flock.positions[i3 + 2] - cannon.originZ,
        )
        if (dist > CANNON_RANGE) {
          cannon.lockIndex = -1
          cannon.charge = 0
        } else {
          const lead = Math.min(0.12, dist / 220)
          cannon.aimX =
            this.flock.positions[i3] + this.flock.velocities[i3] * lead
          cannon.aimY =
            this.flock.positions[i3 + 1] +
            this.flock.velocities[i3 + 1] * lead
          cannon.aimZ =
            this.flock.positions[i3 + 2] +
            this.flock.velocities[i3 + 2] * lead

          cannon.charge = Math.min(1, cannon.charge + dt / CANNON_AIM_TIME)
          this._aimCannon(cannon, cannon.aimX, cannon.aimY, cannon.aimZ, dt, 6)

          if (cannon.charge >= 1) {
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
      this.flock.positions[i3] - cannon.originX,
      this.flock.positions[i3 + 1] - cannon.originY,
      this.flock.positions[i3 + 2] - cannon.originZ,
    )
    const lead = Math.min(0.2, dist / 220)
    cannon.lockIndex = index
    cannon.aimX = this.flock.positions[i3] + this.flock.velocities[i3] * lead
    cannon.aimY =
      this.flock.positions[i3 + 1] + this.flock.velocities[i3 + 1] * lead
    cannon.aimZ =
      this.flock.positions[i3 + 2] + this.flock.velocities[i3 + 2] * lead
    cannon.charge = 0.001
    cannon.fireTimer = 0
    cannon.dodgeTimer = 0
    this._alertDodge(cannon, index)
  }

  _updateAttackPlan() {
    if (!this.flock.target) return
    const gunHot = this.cannons.some((cannon) => cannon.lockIndex >= 0)
    const manyLost = this.aliveCount < this.count * 0.55
    const nextPlan = gunHot && !manyLost ? 'ordenado' : 'dividido'
    if (nextPlan !== this.attackPlan) {
      this.attackPlan = nextPlan
      this.waveTimer = 0
      this.flock.command.log(
        nextPlan === 'ordenado' ? 'log.planOrdered' : 'log.planDivided',
      )
    }
  }

  update(dt) {
    const target = this.flock.target
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
        this.waveTimer = 2.6 + this.flock.random() * 0.8
        this.orderedSquad = (this.orderedSquad + 2) % SQUAD_COUNT
      }
    }

    this._updateAttackPlan()
    for (const cannon of this.cannons) this._updateCannon(cannon, dt)
    this._updateBombs(dt)
    this._checkBattleState()
  }

  consumeShots() {
    const shots = this.pendingShots
    this.pendingShots = []
    return shots
  }

  consumeKills() {
    const kills = this.pendingKills
    this.pendingKills = []
    return kills
  }

  consumeCollisions() {
    const collisions = this.pendingCollisions
    this.pendingCollisions = 0
    return collisions
  }

  consumeBombs() {
    const events = this.pendingBombs
    this.pendingBombs = []
    return events
  }

  getInfo() {
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

  _launchBomb() {
    const target = this.flock.target
    if (!target) return false
    const flock = this.flock

    const reach = 46
    const near = []
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const dx = flock.positions[i3] - target.x
      const dy = flock.positions[i3 + 1] - target.y
      const dz = flock.positions[i3 + 2] - target.z
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
      sumX += flock.positions[i3]
      sumY += flock.positions[i3 + 1]
      sumZ += flock.positions[i3 + 2]
    }

    let ox = sumX / core.length - target.x
    let oy = sumY / core.length - target.y
    let oz = sumZ / core.length - target.z
    let oLen = Math.hypot(ox, oy, oz)
    if (oLen < 0.001) {
      const theta = flock.random() * TAU
      const phi = Math.acos(flock.rand(-1, 1))
      ox = Math.sin(phi) * Math.cos(theta)
      oy = Math.cos(phi)
      oz = Math.sin(phi) * Math.sin(theta)
      oLen = 1
    }

    ox += flock.rand(-4, 4)
    oy += flock.rand(-3, 3)
    oz += flock.rand(-4, 4)
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
    flock.command.log('log.bombLaunched')
    return true
  }

  _detonateBomb(bomb) {
    const radiusSq = BOMB_RADIUS * BOMB_RADIUS
    let hit = 0
    const flock = this.flock

    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const dx = flock.positions[i3] - bomb.x
      const dy = flock.positions[i3 + 1] - bomb.y
      const dz = flock.positions[i3 + 2] - bomb.z
      if (dx * dx + dy * dy + dz * dz > radiusSq) continue

      hit += 1
      this.caution[i] = Math.min(3, this.caution[i] + 1.5)
      this._killAttacker(i, true)
    }

    if (hit > 0) {
      flock.command.ensure()
      flock._recomputeSectorCounts()
    }

    const warnSq = BOMB_RADIUS * 2.2 * (BOMB_RADIUS * 2.2)
    for (let i = 0; i < this.count; i += 1) {
      if (this.health[i] <= 0) continue
      const i3 = i * 3
      const dx = flock.positions[i3] - bomb.x
      const dy = flock.positions[i3 + 1] - bomb.y
      const dz = flock.positions[i3 + 2] - bomb.z
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
      flock.command.log('log.bombDetonate', { n: hit })
    } else {
      flock.command.log('log.bombDetonateEmpty')
    }
  }

  _bombCanDetonate(bomb) {
    const target = this.flock.target
    if (!target) return true
    const dx = bomb.x - target.x
    const dy = bomb.y - target.y
    const dz = bomb.z - target.z
    return dx * dx + dy * dy + dz * dz > BOMB_RADIUS * BOMB_RADIUS
  }

  _planInterceptions() {
    if (this.bombs.length === 0) {
      if (this.bombInterceptions > 0) {
        this.bombInterceptions = 0
        this.interceptTarget.fill(-1)
      }
      return
    }
    const flock = this.flock
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
        const near = []
        for (const i of free) {
          if (taken.has(i)) continue
          const i3 = i * 3
          const dx = flock.positions[i3] - bomb.x
          const dy = flock.positions[i3 + 1] - bomb.y
          const dz = flock.positions[i3 + 2] - bomb.z
          const distSq = dx * dx + dy * dy + dz * dz
          if (distSq > BOMB_DETECT_RADIUS * BOMB_DETECT_RADIUS) continue

          const ax = flock.positions[i3] - bomb.aimX
          const ay = flock.positions[i3 + 1] - bomb.aimY
          const az = flock.positions[i3 + 2] - bomb.aimZ
          const inBlast =
            ax * ax + ay * ay + az * az < BOMB_RADIUS * BOMB_RADIUS

          near.push({ i, score: Math.sqrt(distSq) + (inBlast ? 14 : 0) })
        }
        near.sort((a, b) => a.score - b.score)

        for (const entry of near) {
          if (assignedCount >= BOMB_MAX_INTERCEPTORS) break
          this.interceptTarget[entry.i] = bomb.id
          flock.states[entry.i] = STATE.INTERCEPT
          flock.stateTimers[entry.i] = 2.5
          taken.add(entry.i)
          assignedCount += 1
        }
      }

      bomb.interceptors = assignedCount
      if (assignedCount > 0 && !bomb.detected) {
        bomb.detected = true
        flock.command.log('log.bombDetected', { n: assignedCount })
      }
    }

    let total = 0
    for (const bomb of this.bombs) total += bomb.interceptors
    this.bombInterceptions = total
  }

  _updateBombs(dt) {
    if (this.bombs.length === 0 && this.bombStock <= 0) return
    const flock = this.flock

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
      if (bomb.arm > 0) bomb.arm = Math.max(0, bomb.arm - dt)

      let downed = -1
      if (bomb.arm <= 0 && !bomb.rammed) {
        for (let i = 0; i < this.count; i += 1) {
          if (this.health[i] <= 0) continue
          const i3 = i * 3
          const dx = flock.positions[i3] - bomb.x
          const dy = flock.positions[i3 + 1] - bomb.y
          const dz = flock.positions[i3 + 2] - bomb.z
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
          this.bombs.splice(b, 1)
          this._detonateBomb(bomb)
        } else {
          flock.command.log('log.bombResisted')
        }

        flock.states[downed] = STATE.EVADE
        flock.stateTimers[downed] = 0.5 + flock.random() * 0.4
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
          bomb.fuse = 1
        }
      }
    }

    const ids = new Set(this.bombs.map((bomb) => bomb.id))
    for (let i = 0; i < this.count; i += 1) {
      const id = this.interceptTarget[i]
      if (id < 0) continue
      if (!ids.has(id)) {
        this.interceptTarget[i] = -1
        if (flock.states[i] === STATE.INTERCEPT) {
          flock.states[i] = STATE.DISTRIBUTE
          flock.stateTimers[i] = 0
        }
      }
    }

    this._planInterceptions()
  }
}
