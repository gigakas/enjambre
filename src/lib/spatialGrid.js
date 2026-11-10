/**
 * Rejilla espacial uniforme con counting sort.
 * Mantiene arrays tipados reutilizables para evitar asignaciones por frame.
 */
export class SpatialGrid {
  constructor({ bounds, cellSize, maxCount }) {
    this.bounds = bounds
    this.cellSize = cellSize
    this.nx = Math.max(1, Math.ceil((bounds.x * 2) / cellSize))
    this.ny = Math.max(1, Math.ceil((bounds.y * 2) / cellSize))
    this.nz = Math.max(1, Math.ceil((bounds.z * 2) / cellSize))
    this.cellTotal = this.nx * this.ny * this.nz

    this.cellOf = new Int32Array(maxCount)
    this.cellCounts = new Int32Array(this.cellTotal)
    this.cellStart = new Int32Array(this.cellTotal + 1)
    this.cellCursor = new Int32Array(this.cellTotal)
    this.cellItems = new Int32Array(maxCount)
  }

  build(positions, count) {
    const {
      bounds,
      cellSize,
      nx,
      ny,
      nz,
      cellTotal,
      cellOf,
      cellCounts,
      cellStart,
      cellCursor,
      cellItems,
    } = this

    cellCounts.fill(0)

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3
      let cx = Math.floor((positions[i3] + bounds.x) / cellSize)
      let cy = Math.floor((positions[i3 + 1] + bounds.y) / cellSize)
      let cz = Math.floor((positions[i3 + 2] + bounds.z) / cellSize)
      cx = cx < 0 ? 0 : cx >= nx ? nx - 1 : cx
      cy = cy < 0 ? 0 : cy >= ny ? ny - 1 : cy
      cz = cz < 0 ? 0 : cz >= nz ? nz - 1 : cz

      const cell = cx + nx * (cy + ny * cz)
      cellOf[i] = cell
      cellCounts[cell] += 1
    }

    let acc = 0
    for (let c = 0; c < cellTotal; c += 1) {
      cellStart[c] = acc
      acc += cellCounts[c]
    }
    cellStart[cellTotal] = acc

    cellCursor.set(cellStart.subarray(0, cellTotal))
    for (let i = 0; i < count; i += 1) {
      const cell = cellOf[i]
      cellItems[cellCursor[cell]] = i
      cellCursor[cell] += 1
    }
  }
}
