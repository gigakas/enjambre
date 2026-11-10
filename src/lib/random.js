/**
 * Mulberry32: PRNG pequeño, rápido y seedable.
 * Permite reproducir una simulación en tests y depuración.
 */
export function createRandom(seed = Date.now()) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRange(random) {
  return (min, max) => min + random() * (max - min)
}
