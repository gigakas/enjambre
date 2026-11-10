import test from 'node:test'
import assert from 'node:assert/strict'
import { SpatialGrid } from '../../src/lib/spatialGrid.js'

test('builds a bucket per bird and clamps out-of-bounds positions', () => {
  const grid = new SpatialGrid({
    bounds: { x: 10, y: 10, z: 10 },
    cellSize: 5,
    maxCount: 4,
  })
  const positions = new Float32Array([
    -9, -9, -9,
    9, 9, 9,
    0, 0, 0,
    1, 1, 1,
  ])

  grid.build(positions, 4)

  assert.equal(grid.cellStart[grid.cellTotal], 4)
  assert.deepEqual(
    new Set(Array.from(grid.cellItems.subarray(0, 4))),
    new Set([0, 1, 2, 3]),
  )
  for (let i = 0; i < 4; i += 1) {
    assert.ok(grid.cellOf[i] >= 0)
    assert.ok(grid.cellOf[i] < grid.cellTotal)
  }
})

test('handles an empty flock without stale counts', () => {
  const grid = new SpatialGrid({
    bounds: { x: 10, y: 10, z: 10 },
    cellSize: 5,
    maxCount: 4,
  })
  const positions = new Float32Array(12)

  grid.build(positions, 4)
  grid.build(positions, 0)

  assert.equal(grid.cellStart[grid.cellTotal], 0)
})
