import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  DEFAULT_BOIDS,
  DEFAULT_PARAMS,
  Flock3D,
  MAX_BOIDS,
  MIN_BOIDS,
} from '../lib/flock3d'
import { BirdScene } from '../lib/birdScene'

export function useBoids() {
  const canvasRef = ref(null)
  const paused = ref(false)
  const fps = ref(60)
  const hasTarget = ref(false)
  const count = ref(DEFAULT_BOIDS)
  const impacts = ref(0)
  const blocks = ref(0)
  const stateCounts = ref([0, 0, 0, 0, 0])
  const command = ref({ commander: null, squads: [], log: [], stance: 'flanqueo' })
  const error = ref('')

  const params = reactive({
    separation: DEFAULT_PARAMS.separation,
    alignment: DEFAULT_PARAMS.alignment,
    cohesion: DEFAULT_PARAMS.cohesion,
    seek: DEFAULT_PARAMS.seek,
    distribution: DEFAULT_PARAMS.distribution,
    defense: DEFAULT_PARAMS.defense,
    maxSpeed: DEFAULT_PARAMS.maxSpeed,
  })

  let sim = null
  let scene = null
  let rafId = 0
  let lastFrame = 0
  let elapsed = 0
  let fpsAccum = 0
  let fpsFrames = 0
  let resizeObserver = null
  let pointerStart = null

  watch(
    params,
    () => {
      if (sim) Object.assign(sim.params, params)
    },
    { deep: true },
  )

  watch(count, (value) => {
    sim?.setCount(value)
  })

  function onPointerDown(event) {
    if (event.button !== 0) return
    scene?.notifyInteraction()
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    }
  }

  function onPointerUp(event) {
    if (!pointerStart) return
    const { x, y, time } = pointerStart
    pointerStart = null
    if (!scene || !sim) return

    const moved = Math.hypot(event.clientX - x, event.clientY - y)
    // Solo es un clic si apenas se movió: arrastrar es orbitar la cámara.
    if (moved > 6 || performance.now() - time > 700) return

    const point = scene.pickTarget(event.clientX, event.clientY)
    if (!point) return

    sim.setTarget(point.x, point.y, point.z)
    scene.spawnRipple(point)
    scene.totalImpacts = 0
    scene.totalBlocks = 0
    impacts.value = 0
    blocks.value = 0
    hasTarget.value = true
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame)
    if (!lastFrame) lastFrame = now
    let dt = (now - lastFrame) / 1000
    lastFrame = now
    dt = Math.min(dt, 0.05)

    if (!sim || !scene) return

    elapsed += dt
    if (!paused.value) sim.update(dt)
    scene.update(dt, elapsed)
    scene.render()

    fpsAccum += dt
    fpsFrames += 1
    if (fpsAccum >= 0.5) {
      fps.value = Math.round(fpsFrames / fpsAccum)
      impacts.value = scene.totalImpacts
      blocks.value = scene.totalBlocks
      stateCounts.value = sim.getStateCounts()
      command.value = sim.getCommandInfo()
      fpsAccum = 0
      fpsFrames = 0
    }
  }

  function togglePause() {
    paused.value = !paused.value
    lastFrame = 0
  }

  function scatter() {
    sim?.scatter()
  }

  function clearTarget() {
    sim?.clearTarget()
    if (scene) {
      scene.totalImpacts = 0
      scene.totalBlocks = 0
    }
    impacts.value = 0
    blocks.value = 0
    hasTarget.value = false
  }

  function reset() {
    if (!sim) return
    sim.seed()
    sim.setCount(count.value)
    scene?.clearRipples()
    if (scene) {
      scene.totalImpacts = 0
      scene.totalBlocks = 0
    }
    impacts.value = 0
    blocks.value = 0
    command.value = sim.getCommandInfo()
    stateCounts.value = sim.getStateCounts()
    hasTarget.value = false
  }

  onMounted(() => {
    const canvas = canvasRef.value
    if (!canvas) return

    try {
      sim = new Flock3D({ count: count.value })
      Object.assign(sim.params, params)
      scene = new BirdScene(canvas, sim)
      scene.resize(window.innerWidth, window.innerHeight)

      resizeObserver = new ResizeObserver(() => {
        const rect = canvas.getBoundingClientRect()
        scene.resize(rect.width, rect.height)
      })
      resizeObserver.observe(canvas)

      if (import.meta.env.DEV) {
        window.__boids = { simulation: sim, scene }
      }
    } catch (err) {
      console.error(err)
      error.value =
        'Tu navegador no ha podido iniciar WebGL. Prueba con otro navegador o activa la aceleración por hardware.'
      return
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    rafId = requestAnimationFrame(frame)
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(rafId)
    resizeObserver?.disconnect()

    const canvas = canvasRef.value
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
    }

    scene?.dispose()
    scene = null
    sim = null
    if (import.meta.env.DEV) delete window.__boids
  })

  return {
    canvasRef,
    params,
    paused,
    fps,
    hasTarget,
    count,
    impacts,
    blocks,
    stateCounts,
    command,
    error,
    minBoids: MIN_BOIDS,
    maxBoids: MAX_BOIDS,
    togglePause,
    scatter,
    clearTarget,
    reset,
  }
}
