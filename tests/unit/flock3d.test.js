import test from 'node:test'
import assert from 'node:assert/strict'
import {
  Flock3D,
  MAX_BOIDS,
  MIN_BOIDS,
  STATE,
} from '../../src/lib/flock3d.js'
import { createRandom } from '../../src/lib/random.js'

const makeSim = (options = {}) =>
  new Flock3D({ count: 50, seed: 12345, ...options })

const positionsSnapshot = (sim) =>
  Array.from(sim.positions.subarray(0, sim.count * 3))

test('creates stable squad codes and the initial command chain', () => {
  const sim = makeSim()

  assert.equal(sim.getCode(0), 'A-001')
  assert.equal(sim.getCode(1), 'B-001')
  assert.equal(sim.getCode(4), 'A-002')
  assert.equal(sim.getCode(42), 'C-011')

  assert.deepEqual(Array.from(sim.leaderOfSquad), [0, 1, 2, 3])
  assert.equal(sim.commander, 0)
  assert.equal(sim.getCommandInfo().commander.code, 'A-001')
})

test('clamps the initial count to the supported range', () => {
  assert.equal(makeSim({ count: 1 }).count, MIN_BOIDS)
  assert.equal(makeSim({ count: MAX_BOIDS + 100 }).count, MAX_BOIDS)
})

test('setCount updates active birds and keeps the command valid', () => {
  const sim = makeSim()

  sim.setCount(60)
  assert.equal(sim.count, 60)
  assert.deepEqual(Array.from(sim.leaderOfSquad), [0, 1, 2, 3])

  sim.setCount(0)
  assert.equal(sim.count, 0)
  assert.equal(sim.getCommandInfo().commander, null)
  assert.doesNotThrow(() => sim.update(1 / 60))

  sim.setCount(50)
  assert.equal(sim.count, 50)
  assert.deepEqual(Array.from(sim.leaderOfSquad), [0, 1, 2, 3])
  assert.equal(sim.commander, 0)
})

test('isLeader and getLeaderIndices reflect the command chain', () => {
  const sim = makeSim()

  assert.equal(sim.isLeader(0), true)
  assert.equal(sim.isLeader(4), false)
  assert.deepEqual(sim.getLeaderIndices(), [0, 1, 2, 3])

  sim._downLeader(0)
  assert.equal(sim.isLeader(4), true)
  assert.deepEqual(sim.getLeaderIndices(), [4, 1, 2, 3])
})

test('a downed leader is replaced by the next code in its squad', () => {
  const sim = makeSim()

  sim._downLeader(0)

  assert.equal(sim.leaderOfSquad[0], 4)
  assert.equal(sim.commander, 1)
  assert.ok(sim.downTimers[0] > 0)
  assert.equal(sim.states[0], STATE.EVADE)
  assert.ok(
    sim.getCommandInfo().log.some((entry) => /A-001 derribada/.test(entry)),
  )

  sim._downLeader(4)
  assert.equal(sim.leaderOfSquad[0], 8)
  assert.equal(sim.commander, 1)
})

test('a pulse only downs the leaders captured at pulse start', () => {
  const sim = makeSim({ seed: 99 })
  sim.setTarget(0, 0, 0)

  // Todas las aves dentro del radio del pulso, incluidos los reemplazos.
  for (let i = 0; i < sim.count; i += 1) {
    const i3 = i * 3
    sim.positions[i3] = ((i % 10) - 5) * 0.5
    sim.positions[i3 + 1] = 0
    sim.positions[i3 + 2] = 0
  }

  sim._triggerPulse()

  for (let i = 0; i < 4; i += 1) {
    assert.ok(sim.downTimers[i] > 0, `leader ${i} should be down`)
  }
  for (let i = 4; i < 8; i += 1) {
    assert.equal(sim.downTimers[i], 0, `replacement ${i} must stay safe`)
  }

  assert.deepEqual(Array.from(sim.leaderOfSquad), [4, 5, 6, 7])
  assert.equal(sim.commander, 4)
  assert.equal(sim.consumeLeaderDowns().length, 4)
  assert.equal(sim.consumePulses(), 1)
})

test('the FSM reaches attack states and registers impacts over time', () => {
  const sim = makeSim({ seed: 12345 })
  sim.setTarget(0, 0, 0)

  for (let i = 0; i < 600; i += 1) sim.update(1 / 60)

  const counts = sim.getStateCounts()
  assert.equal(
    counts.reduce((total, value) => total + value, 0),
    sim.count,
  )
  assert.ok(counts[STATE.DIVE] > 0)
  assert.ok(sim.consumeImpacts() > 0)
  assert.ok(sim.consumeBlocks() > 0)
})

test('the same seed produces the same simulation', () => {
  const a = makeSim({ seed: 7 })
  const b = makeSim({ seed: 7 })
  const c = makeSim({ seed: 8 })

  for (const sim of [a, b, c]) sim.setTarget(3, -2, 1)
  for (let i = 0; i < 30; i += 1) {
    a.update(1 / 60)
    b.update(1 / 60)
    c.update(1 / 60)
  }

  assert.deepEqual(positionsSnapshot(a), positionsSnapshot(b))
  assert.notDeepEqual(positionsSnapshot(a), positionsSnapshot(c))
})

test('createRandom is deterministic for a given seed', () => {
  const a = createRandom(42)
  const b = createRandom(42)
  for (let i = 0; i < 10; i += 1) assert.equal(a(), b())
})

test('getRenderState exposes the read-only render contract', () => {
  const sim = makeSim()
  const view = sim.getRenderState()

  assert.equal(view.count, sim.count)
  assert.equal(view.positions, sim.positions)
  assert.equal(view.velocities, sim.velocities)
  assert.equal(view.leaderOfSquad, sim.leaderOfSquad)
  assert.equal(view.commander, sim.commander)
  assert.equal(view.commandVersion, sim.commandVersion)
})
