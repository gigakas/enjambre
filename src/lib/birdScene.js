import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  BOUNDS,
  BOMB_COUNT,
  BOMB_RADIUS,
  CANNON_MOUNTS,
  MAX_BOIDS,
  PLAY_BOUNDS,
  PULSE_RADIUS,
  SHIELD_ANGLE,
  SHIELD_RADIUS,
  SQUAD_COUNT,
  TARGET_MAX_HEALTH,
} from './flock3d'

/** Velocidad visual de las balas de la metralleta. */
const BULLET_SPEED = 420

const SQUAD_HUES = [0.48, 0.6, 0.73, 0.86]
const SQUAD_COLORS = [0x63e6ff, 0x7f9cff, 0xb18cff, 0xff8fd0]
const SQUAD_COLORS_CSS = ['#63e6ff', '#7f9cff', '#b18cff', '#ff8fd0']

const WING_VERTICES = new Float32Array([
  // Ala izquierda
  0, 0.05, 1.0,
  -1.35, 0.11, -0.35,
  -0.12, 0, -0.62,
  // Ala derecha
  0, 0.05, 1.0,
  0.12, 0, -0.62,
  1.35, 0.11, -0.35,
  // Cuerpo
  0, 0, 1.26,
  -0.1, 0, -0.56,
  0.1, 0, -0.56,
  // Cola
  -0.1, 0, -0.5,
  -0.44, 0, -1.16,
  0.44, 0, -1.16,
])

const BIRD_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSize;

  attribute vec3 aOffset;
  attribute vec3 aVelocity;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aHealth;

  varying vec3 vColor;
  varying float vDepth;
  varying float vHealth;

  void main() {
    vec3 forward = normalize(aVelocity + vec3(0.0001, 0.0001, 0.0001));
    vec3 upRef = abs(forward.y) > 0.94 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(upRef, forward));
    vec3 up = cross(forward, right);

    float healthRatio = clamp(aHealth / 5.0, 0.0, 1.0);
    float birdScale = (0.8 + fract(aPhase * 6.618) * 0.42) * uSize;
    birdScale *= step(0.5, aHealth);
    vec3 p = position * birdScale;

    // Aleteo: las puntas de las alas suben y bajan.
    float flap = sin(uTime * 8.0 + aPhase * 6.28318);
    p.y += abs(p.x) * flap * 0.5;
    p.z -= abs(p.x) * abs(flap) * 0.1;

    vec3 world = aOffset + right * p.x + up * p.y + forward * p.z;
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;

    vDepth = -mv.z;
    vHealth = aHealth;
    float nose = smoothstep(-1.2, 1.15, position.z);
    vColor = aColor * (0.72 + nose * 0.45) * mix(0.38, 1.0, healthRatio);
  }
`

const BIRD_FRAGMENT_SHADER = /* glsl */ `
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uIntensity;

  varying vec3 vColor;
  varying float vDepth;
  varying float vHealth;

  void main() {
    if (vHealth < 0.5) discard;
    float fog = smoothstep(uFogNear, uFogFar, vDepth);
    // Mezcla aditiva: cuanto más lejos, menos opaco.
    // La intensidad baja con la cantidad para no saturar el grupo.
    gl_FragColor = vec4(vColor * uIntensity, 1.0 - fog * 0.9);
  }
`

export class BirdScene {
  constructor(canvas, simulation) {
    this.canvas = canvas
    this.sim = simulation
    this.clockTime = 0

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#05070f')

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500)
    this.camera.position.set(0, 14, 84)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor('#05070f', 1)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.set(0, 0, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.enablePan = false
    this.controls.minDistance = 42
    this.controls.maxDistance = 170
    this.controls.minPolarAngle = Math.PI * 0.16
    this.controls.maxPolarAngle = Math.PI * 0.64
    this.controls.rotateSpeed = 0.55
    this.controls.zoomSpeed = 0.7
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 0.35
    this.controls.update()

    // La rotación automática se detiene en cuanto la persona interactúa.
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false
      this._userInteracted = true
    })

    this._userInteracted = false

    this._createBirds()
    this._createDust()
    this._createMarker()
    this._createSparks()
    this._createShield()
    this._createLeaderFx()
    this._createCannons()
    this._createBombs()

    this.ripples = []
    this.pulses = []
    this.bullets = []
    this.flashes = []
    this.totalImpacts = 0
    this.totalBlocks = 0
    this.totalKills = 0
    this.totalCollisions = 0
    this.totalShots = 0
    this.totalBombsLaunched = 0
    this.totalBombExplosions = 0
    this.totalBombIntercepts = 0
    this.shieldFlash = 0
    this.targetHitFlash = 0
    this.communicationFlash = 0
    this.lastCommandVersion = -1
    this.lastStrategyVersion = -1
    this.lastBattleState = 'idle'
    this._labelText = new Array(SQUAD_COUNT).fill('')

    this._cannonForward = new THREE.Vector3(0, 0, 1)
    this._cannonDir = new THREE.Vector3()
    this._bulletAxis = new THREE.Vector3()
    this._markerHealthy = new THREE.Color(0xffa273)
    this._markerCritical = new THREE.Color(0xff3350)
    this._markerColor = new THREE.Color()

    this._raycaster = new THREE.Raycaster()
    this._pointer = new THREE.Vector2()
    this._plane = new THREE.Plane()
    this._center = new THREE.Vector3(0, 0, 0)
    this._normal = new THREE.Vector3()
    this._hit = new THREE.Vector3()
  }

  _createBirds() {
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(WING_VERTICES, 3))

    this.offsetAttr = new THREE.InstancedBufferAttribute(this.sim.positions, 3)
    this.velocityAttr = new THREE.InstancedBufferAttribute(this.sim.velocities, 3)
    this.offsetAttr.setUsage(THREE.DynamicDrawUsage)
    this.velocityAttr.setUsage(THREE.DynamicDrawUsage)

    const colors = new Float32Array(MAX_BOIDS * 3)
    const phases = new Float32Array(MAX_BOIDS)
    for (let i = 0; i < MAX_BOIDS; i += 1) {
      // Cuatro familias de color, una por escuadrón.
      const squad = i % SQUAD_COUNT
      const hue =
        SQUAD_HUES[squad] + (Math.random() - 0.5) * 0.035
      const [r, g, b] = hslToRgb(
        hue,
        0.9,
        0.6 + Math.random() * 0.12,
      )
      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
      phases[i] = Math.random() * Math.PI * 2
    }

    this.colorAttr = new THREE.InstancedBufferAttribute(colors, 3)
    this.phaseAttr = new THREE.InstancedBufferAttribute(phases, 1)
    this.healthAttr = new THREE.InstancedBufferAttribute(this.sim.health, 1)
    this.healthAttr.setUsage(THREE.DynamicDrawUsage)

    geometry.setAttribute('aOffset', this.offsetAttr)
    geometry.setAttribute('aVelocity', this.velocityAttr)
    geometry.setAttribute('aColor', this.colorAttr)
    geometry.setAttribute('aPhase', this.phaseAttr)
    geometry.setAttribute('aHealth', this.healthAttr)

    this.geometry = geometry
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.68 },
        uFogNear: { value: 65 },
        uFogFar: { value: 170 },
        uIntensity: { value: 1 },
      },
      vertexShader: BIRD_VERTEX_SHADER,
      fragmentShader: BIRD_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })

    this.birdMesh = new THREE.Mesh(geometry, this.material)
    this.birdMesh.frustumCulled = false
    this.scene.add(this.birdMesh)
  }

  _createDust() {
    const count = 650
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 160
      positions[i * 3 + 1] = (Math.random() - 0.5) * 110
      positions[i * 3 + 2] = (Math.random() - 0.5) * 150
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    this.dustTexture = createGlowTexture(0.75)
    const material = new THREE.PointsMaterial({
      map: this.dustTexture,
      color: 0x7c9fc4,
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })

    this.dust = new THREE.Points(geometry, material)
    this.scene.add(this.dust)
  }

  _createMarker() {
    this.marker = new THREE.Group()
    this.marker.visible = false

    const addRing = (inner, outer, opacity, color = 0xffa273) => {
      const geometry = new THREE.RingGeometry(inner, outer, 64)
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.renderOrder = 5
      this.marker.add(mesh)
      return mesh
    }

    this.markerRing = addRing(2.1, 2.32, 0.6)

    const arcGeometry = new THREE.RingGeometry(
      3.3,
      3.46,
      64,
      1,
      0,
      Math.PI * 1.35,
    )
    const arcMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8a72,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })
    this.markerArc = new THREE.Mesh(arcGeometry, arcMaterial)
    this.markerArc.renderOrder = 5
    this.marker.add(this.markerArc)

    const dotGeometry = new THREE.CircleGeometry(0.28, 20)
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe7d8,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })
    this.markerDot = new THREE.Mesh(dotGeometry, dotMaterial)
    this.markerDot.renderOrder = 5
    this.marker.add(this.markerDot)

    // Marcas de puntería alrededor del anillo.
    const tickPoints = []
    for (let i = 0; i < 4; i += 1) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4
      tickPoints.push(
        Math.cos(angle) * 2.7,
        Math.sin(angle) * 2.7,
        0,
        Math.cos(angle) * 3.12,
        Math.sin(angle) * 3.12,
        0,
      )
    }
    const tickGeometry = new THREE.BufferGeometry()
    tickGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(tickPoints, 3),
    )
    const tickMaterial = new THREE.LineBasicMaterial({
      color: 0xffb699,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      depthTest: false,
    })
    this.markerTicks = new THREE.LineSegments(tickGeometry, tickMaterial)
    this.markerTicks.renderOrder = 5
    this.marker.add(this.markerTicks)

    this.glowTexture = createGlowTexture()
    const glowMaterial = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: 0xff7a5a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: false,
    })
    this.markerGlow = new THREE.Sprite(glowMaterial)
    this.markerGlow.scale.set(18, 18, 1)
    this.markerGlow.renderOrder = 4
    this.marker.add(this.markerGlow)

    this.scene.add(this.marker)
  }

  _createSparks() {
    this.sparks = []
    for (let i = 0; i < 90; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: i % 3 === 0 ? 0xffd9a0 : i % 3 === 1 ? 0xffa074 : 0xff6b5c,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const sprite = new THREE.Sprite(material)
      sprite.visible = false
      sprite.renderOrder = 6
      sprite.scale.set(1, 1, 1)
      this.scene.add(sprite)
      this.sparks.push({
        sprite,
        life: 0,
        maxLife: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 1,
      })
    }
    this.sparkCursor = 0
  }

  _createShield() {
    this.shieldGroup = new THREE.Group()
    this.shieldGroup.visible = false

    const capGeometry = new THREE.SphereGeometry(
      SHIELD_RADIUS,
      32,
      18,
      0,
      Math.PI * 2,
      0,
      SHIELD_ANGLE,
    )
    this.shieldCapMaterial = new THREE.MeshBasicMaterial({
      color: 0x75dcff,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    this.shieldCap = new THREE.Mesh(capGeometry, this.shieldCapMaterial)
    this.shieldCap.renderOrder = 7
    this.shieldGroup.add(this.shieldCap)

    const rimRadius = Math.sin(SHIELD_ANGLE) * SHIELD_RADIUS
    const rimOffset = Math.cos(SHIELD_ANGLE) * SHIELD_RADIUS
    const rimGeometry = new THREE.RingGeometry(
      rimRadius - 0.14,
      rimRadius + 0.14,
      72,
    )
    this.shieldRimMaterial = new THREE.MeshBasicMaterial({
      color: 0xa6eeff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    this.shieldRim = new THREE.Mesh(rimGeometry, this.shieldRimMaterial)
    this.shieldRim.position.y = rimOffset
    this.shieldRim.rotation.x = -Math.PI / 2
    this.shieldRim.renderOrder = 7
    this.shieldGroup.add(this.shieldRim)

    this._shieldAxis = new THREE.Vector3(0, 1, 0)
    this._shieldDir = new THREE.Vector3(1, 0, 0)
    this.scene.add(this.shieldGroup)
  }

  /** Bombas de expansión: cuerpo, halo, área de explosión y trayectoria. */
  _createBombs() {
    this.bombRigs = []
    this.blasts = []

    for (let i = 0; i < BOMB_COUNT; i += 1) {
      const group = new THREE.Group()
      group.visible = false

      const coreGeometry = new THREE.IcosahedronGeometry(0.72, 1)
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd08a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const core = new THREE.Mesh(coreGeometry, coreMaterial)
      group.add(core)

      const haloGeometry = new THREE.SphereGeometry(1.45, 16, 12)
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6b4a,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const halo = new THREE.Mesh(haloGeometry, haloMaterial)
      group.add(halo)

      this.scene.add(group)

      // Anillo del área de explosión, orientado a cámara.
      const ringGeometry = new THREE.RingGeometry(
        BOMB_RADIUS - 0.6,
        BOMB_RADIUS,
        84,
      )
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xff8a5c,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
      const ring = new THREE.Mesh(ringGeometry, ringMaterial)
      ring.visible = false
      ring.renderOrder = 6
      this.scene.add(ring)

      // Trayectoria prevista: deja ver que la bomba es lenta.
      const lineGeometry = new THREE.BufferGeometry()
      lineGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(new Float32Array(6), 3),
      )
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffa06a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const line = new THREE.Line(lineGeometry, lineMaterial)
      line.frustumCulled = false
      line.visible = false
      this.scene.add(line)

      this.bombRigs.push({
        group,
        core,
        halo,
        ring,
        line,
        lineGeometry,
        lineMaterial,
        ringMaterial,
      })
    }
  }

  /** Onda de explosión de una bomba. */
  _spawnBlast(x, y, z, radius) {
    const geometry = new THREE.RingGeometry(0.9, 1, 96)
    const material = new THREE.MeshBasicMaterial({
      color: 0xffb45c,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(0.5)
    this.scene.add(mesh)
    this.blasts.push({ mesh, age: 0, life: 0.8, radius })
  }

  _createCannons() {
    this.cannonRigs = []

    for (let c = 0; c < CANNON_MOUNTS.length; c += 1) {
      const group = new THREE.Group()
      group.visible = false

      const baseGeometry = new THREE.SphereGeometry(0.7, 12, 8)
      const baseMaterial = new THREE.MeshBasicMaterial({
        color: 0xffb08a,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
      const base = new THREE.Mesh(baseGeometry, baseMaterial)
      group.add(base)

      const barrelGeometry = new THREE.CylinderGeometry(0.16, 0.26, 3.0, 10)
      barrelGeometry.rotateX(Math.PI / 2)
      const barrelMaterial = new THREE.MeshBasicMaterial({
        color: 0xff9a76,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      })
      const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial)
      barrel.position.z = 1.5
      group.add(barrel)

      const tipGeometry = new THREE.SphereGeometry(0.3, 10, 8)
      const tipMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff1d6,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const tip = new THREE.Mesh(tipGeometry, tipMaterial)
      tip.position.z = 3.05
      group.add(tip)

      // Resplandor de la boca: se mantiene encendido mientras el cañón
      // dispara, para que la ráfaga se lea como fuego continuo.
      const glowGeometry = new THREE.SphereGeometry(1.15, 12, 10)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const glow = new THREE.Mesh(glowGeometry, glowMaterial)
      glow.position.z = 3.05
      group.add(glow)

      this.scene.add(group)

      const lineGeometry = new THREE.BufferGeometry()
      lineGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(new Float32Array(6), 3),
      )
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x9fe8ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const line = new THREE.Line(lineGeometry, lineMaterial)
      line.frustumCulled = false
      line.visible = false
      this.scene.add(line)

      const markerGeometry = new THREE.RingGeometry(0.34, 0.5, 28)
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xbff6ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.visible = false
      marker.renderOrder = 8
      this.scene.add(marker)

      this.cannonRigs.push({
        group,
        base,
        barrel,
        tip,
        glow,
        glowGeometry,
        glowMaterial,
        line,
        marker,
        lineGeometry,
        lineMaterial,
        markerMaterial,
      })
    }
  }

  _createLeaderFx() {
    this.leaderHaloes = []
    this.leaderLabels = []

    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const haloMaterial = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: SQUAD_COLORS[s],
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
      const halo = new THREE.Sprite(haloMaterial)
      halo.scale.set(5.5, 5.5, 1)
      halo.renderOrder = 8
      halo.visible = false
      this.scene.add(halo)
      this.leaderHaloes.push(halo)

      const labelMaterial = new THREE.SpriteMaterial({
        map: this._makeLabelTexture('', SQUAD_COLORS_CSS[s]),
        transparent: true,
        depthWrite: false,
        depthTest: false,
      })
      const label = new THREE.Sprite(labelMaterial)
      label.scale.set(11, 2.9, 1)
      label.renderOrder = 9
      label.visible = false
      this.scene.add(label)
      this.leaderLabels.push(label)
    }

    const linkGeometry = new THREE.BufferGeometry()
    linkGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array(SQUAD_COUNT * 2 * 3),
        3,
      ),
    )
    this.linkMaterial = new THREE.LineBasicMaterial({
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.leaderLinks = new THREE.LineSegments(linkGeometry, this.linkMaterial)
    this.leaderLinks.frustumCulled = false
    this.leaderLinks.visible = false
    this.scene.add(this.leaderLinks)
  }

  /** Etiqueta con el código del líder, dibujada en un canvas. */
  _makeLabelTexture(text, accent) {
    const scale = 2
    const width = 360
    const height = 96
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.clearRect(0, 0, width, height)

    if (!text) {
      const empty = new THREE.CanvasTexture(canvas)
      empty.colorSpace = THREE.SRGBColorSpace
      return empty
    }

    ctx.beginPath()
    ctx.roundRect(3, 3, width - 6, height - 6, 18)
    ctx.fillStyle = 'rgba(5, 11, 22, 0.76)'
    ctx.fill()
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.75
    ctx.lineWidth = 1.8
    ctx.stroke()
    ctx.globalAlpha = 1

    ctx.beginPath()
    ctx.roundRect(14, 20, 6, height - 40, 3)
    ctx.fillStyle = accent
    ctx.fill()

    ctx.fillStyle = '#edf9ff'
    ctx.font =
      "600 32px 'Inter', 'SF Pro Text', ui-sans-serif, system-ui, sans-serif"
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 32, height / 2 + 1)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    return texture
  }

  _refreshLeaderLabels() {
    const sim = this.sim
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const index = sim.leaderOfSquad[s]
      if (index < 0 || index >= sim.count) {
        this._labelText[s] = ''
        continue
      }
      const isCommander = index === sim.commander
      const code = sim.getCode(index)
      const text = isCommander ? `CMD · ${code}` : code
      if (text === this._labelText[s]) continue

      const label = this.leaderLabels[s]
      if (label.material.map) label.material.map.dispose()
      const accent = isCommander ? '#ffd37a' : SQUAD_COLORS_CSS[s]
      label.material.map = this._makeLabelTexture(text, accent)
      label.material.needsUpdate = true
      this._labelText[s] = text
    }
  }

  _updateLeaderFx(dt, elapsed) {
    const sim = this.sim
    if (sim.commandVersion !== this.lastCommandVersion) {
      this.lastCommandVersion = sim.commandVersion
      this._refreshLeaderLabels()
    }
    if (sim.strategyVersion !== this.lastStrategyVersion) {
      this.lastStrategyVersion = sim.strategyVersion
      this.communicationFlash = 1
    }
    this.communicationFlash = Math.max(0, this.communicationFlash - dt * 1.6)

    const positions = sim.positions
    const leaders = sim.leaderOfSquad
    const commander = sim.commander
    const distanceFactor = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(this.controls.target) / 85,
      1,
      1.8,
    )

    const drawable = []
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const index = leaders[s]
      const halo = this.leaderHaloes[s]
      const label = this.leaderLabels[s]
      if (index < 0 || index >= sim.count) {
        halo.visible = false
        label.visible = false
        continue
      }

      const i3 = index * 3
      const x = positions[i3]
      const y = positions[i3 + 1]
      const z = positions[i3 + 2]
      const isCommander = index === commander

      halo.visible = true
      halo.position.set(x, y, z)
      const haloScale = (isCommander ? 6.4 : 4.6) * distanceFactor
      halo.scale.set(haloScale, haloScale, 1)
      halo.material.color.setHex(isCommander ? 0xffd37a : SQUAD_COLORS[s])
      halo.material.opacity =
        (isCommander ? 0.68 : 0.46) + this.communicationFlash * 0.2

      label.visible = this.camera.aspect >= 0.8
      label.position.set(x, y + 3.6 * distanceFactor, z)
      label.scale.set(9.5 * distanceFactor, 2.5 * distanceFactor, 1)

      drawable.push({ index, x, y, z })
    }

    const linkPositions = this.leaderLinks.geometry.attributes.position
    let segment = 0
    if (commander >= 0 && commander < sim.count) {
      const c3 = commander * 3
      const cx = positions[c3]
      const cy = positions[c3 + 1]
      const cz = positions[c3 + 2]
      for (const leader of drawable) {
        if (leader.index === commander) continue
        const base = segment * 6
        linkPositions.array[base] = cx
        linkPositions.array[base + 1] = cy
        linkPositions.array[base + 2] = cz
        linkPositions.array[base + 3] = leader.x
        linkPositions.array[base + 4] = leader.y
        linkPositions.array[base + 5] = leader.z
        segment += 1
      }
    }
    linkPositions.needsUpdate = true
    this.leaderLinks.geometry.setDrawRange(0, segment * 2)
    this.leaderLinks.visible = segment > 0
    this.linkMaterial.opacity =
      0.26 + 0.08 * Math.sin(elapsed * 3) + this.communicationFlash * 0.5
  }

  /** Fogonazo: destello breve en la boca del cañón al disparar. */
  _spawnFlash(x, y, z) {
    const geometry = new THREE.SphereGeometry(0.9, 10, 8)
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff0c8,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    this.scene.add(mesh)
    this.flashes.push({ mesh, geometry, material, age: 0, life: 0.16 })
  }

  /**
   * Cada disparo de la metralleta es una bala que viaja desde la boca del
   * cañón hasta su punto de impacto: no una línea, sino un proyectil en
   * vuelo. Varios a la vez forman el flujo continuo de fuego.
   */
  _spawnBullet(shot) {
    const dx = shot.x2 - shot.x1
    const dy = shot.y2 - shot.y1
    const dz = shot.z2 - shot.z1
    const length = Math.hypot(dx, dy, dz) || 1
    const travel = length / BULLET_SPEED

    // Proyectil luminoso: se ve desde cualquier ángulo, no como una línea.
    const geometry = new THREE.SphereGeometry(0.34, 8, 6)
    const material = new THREE.MeshBasicMaterial({
      color: shot.hit ? 0xffffff : 0xd6f8ff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.position.set(shot.x1, shot.y1, shot.z1)
    // Se estira en la dirección del disparo: deja una estela corta.
    mesh.scale.set(1, 1, 3.4)
    this.scene.add(mesh)

    this.bullets.push({
      mesh,
      geometry,
      material,
      x1: shot.x1,
      y1: shot.y1,
      z1: shot.z1,
      x2: shot.x2,
      y2: shot.y2,
      z2: shot.z2,
      dirX: dx / length,
      dirY: dy / length,
      dirZ: dz / length,
      travelled: 0,
      total: length,
      life: travel + 0.26,
      hit: shot.hit,
    })
  }

  _updateCombatFx(dt, elapsed) {
    const sim = this.sim
    const target = sim.target
    const info = sim.getCombatInfo()
    const targetVisible = Boolean(target)

    for (let c = 0; c < this.cannonRigs.length; c += 1) {
      const rig = this.cannonRigs[c]
      const cannon = info.cannons[c]
      const visible =
        targetVisible && info.battleState !== 'target-down' && Boolean(cannon)
      rig.group.visible = visible
      rig.line.visible = false
      rig.marker.visible = visible && cannon.charge > 0.02
      if (!visible) continue

      const mount = CANNON_MOUNTS[c]
      rig.group.position.set(
        target.x + mount.x,
        target.y + mount.y,
        target.z + mount.z,
      )
      this._cannonDir.set(cannon.dirX, cannon.dirY, cannon.dirZ)
      if (this._cannonDir.lengthSq() < 1e-6) this._cannonDir.set(1, 0, 0)
      this._cannonDir.normalize()
      rig.group.quaternion.setFromUnitVectors(
        this._cannonForward,
        this._cannonDir,
      )

      const charge = cannon.charge
      const firing = cannon.firing
      rig.tip.material.color.setRGB(
        1,
        0.95 - charge * 0.45,
        0.85 - charge * 0.62,
      )
      rig.tip.scale.setScalar(
        1 + charge * 0.9 + Math.sin(elapsed * 34 + c) * 0.1 * charge,
      )

      // Resplandor de la boca del cañón mientras dure la ráfaga.
      const flicker = 0.75 + Math.sin(elapsed * 47 + c * 2.1) * 0.25
      rig.glowMaterial.opacity +=
        ((firing ? 0.45 * flicker : 0) - rig.glowMaterial.opacity) *
        Math.min(1, dt * 18)
      rig.glow.scale.setScalar(firing ? 0.9 + flicker * 0.45 : 0.6)
      rig.barrel.material.color.setRGB(
        1,
        0.62 - charge * 0.38,
        0.48 - charge * 0.28,
      )

      if (rig.marker.visible) {
        rig.marker.position.set(cannon.aimX, cannon.aimY, cannon.aimZ)
        rig.marker.quaternion.copy(this.camera.quaternion)
        rig.marker.scale.setScalar(0.55 + charge * 1.45)
        rig.markerMaterial.opacity = 0.18 + charge * 0.55
      }
    }

    const shots = sim.consumeShots()
    this.totalShots += shots.length
    for (const shot of shots) {
      this._spawnBullet(shot)
      // Fogonazo en la boca del cañón: el fuego se ve continuo.
      const dx = shot.x2 - shot.x1
      const dy = shot.y2 - shot.y1
      const dz = shot.z2 - shot.z1
      const length = Math.hypot(dx, dy, dz) || 1
      this._spawnFlash(
        shot.x1 + (dx / length) * 3,
        shot.y1 + (dy / length) * 3,
        shot.z1 + (dz / length) * 3,
      )
    }

    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i]
      bullet.life -= dt
      bullet.travelled += BULLET_SPEED * dt

      const t = Math.min(1, bullet.travelled / bullet.total)
      bullet.mesh.position.set(
        bullet.x1 + (bullet.x2 - bullet.x1) * t,
        bullet.y1 + (bullet.y2 - bullet.y1) * t,
        bullet.z1 + (bullet.z2 - bullet.z1) * t,
      )
      this._bulletAxis.set(bullet.dirX, bullet.dirY, bullet.dirZ)
      bullet.mesh.quaternion.setFromUnitVectors(
        this._cannonForward,
        this._bulletAxis,
      )
      // La bala deja una estela breve al llegar: el flujo se ve continuo.
      bullet.material.opacity = Math.min(1, bullet.life / 0.26)

      if (bullet.life <= 0) {
        if (bullet.hit) {
          this._spawnSpark(bullet.x2, bullet.y2, bullet.z2, 0.5, 2, 7, 'hit')
        }
        this.scene.remove(bullet.mesh)
        bullet.geometry.dispose()
        bullet.material.dispose()
        this.bullets.splice(i, 1)
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      const flash = this.flashes[i]
      flash.age += dt
      const t = Math.min(1, flash.age / flash.life)
      flash.mesh.scale.setScalar(0.5 + t * 2.1)
      flash.material.opacity = (1 - t) * 1
      if (t >= 1) {
        this.scene.remove(flash.mesh)
        flash.geometry.dispose()
        flash.material.dispose()
        this.flashes.splice(i, 1)
      }
    }

    const kills = sim.consumeKills()
    this.totalKills += kills.length
    for (const kill of kills) {
      for (let i = 0; i < 14; i += 1) {
        this._spawnSpark(kill.x, kill.y, kill.z, 0.7, 3, 11, 'kill')
      }
    }

    const collisions = sim.consumeCollisions()
    this.totalCollisions += collisions
    if (collisions > 0 && target) {
      this.targetHitFlash = Math.min(1.6, this.targetHitFlash + 0.6)
      const spawn = Math.min(collisions, 5)
      for (let i = 0; i < spawn; i += 1) {
        this._spawnSpark(target.x, target.y, target.z, 1.4, 2.5, 9, 'impact')
      }
    }

    // La salud del objetivo tiñe el marcador de naranja a rojo.
    const healthRatio = THREE.MathUtils.clamp(
      info.targetHealth / TARGET_MAX_HEALTH,
      0,
      1,
    )
    this._markerColor
      .copy(this._markerHealthy)
      .lerp(this._markerCritical, 1 - healthRatio)
    if (this.markerRing) this.markerRing.material.color.copy(this._markerColor)
    if (this.markerArc) this.markerArc.material.color.copy(this._markerColor)
    if (this.markerGlow) this.markerGlow.material.color.copy(this._markerColor)

    if (info.battleState !== this.lastBattleState) {
      if (info.battleState === 'target-down' && target) {
        for (let i = 0; i < 34; i += 1) {
          this._spawnSpark(target.x, target.y, target.z, 2.2, 4, 16, 'kill')
        }
        this._spawnPulse(target)
        this.targetHitFlash = 1.6
      }
      this.lastBattleState = info.battleState
    }

    this.targetHitFlash = Math.max(0, this.targetHitFlash - dt * 1.7)
  }

  /** Bombas de expansión: Dibujado, área de explosión y ondas. */
  _updateBombFx(dt, elapsed) {
    const sim = this.sim
    const bombs = sim.getCombatInfo().bombs

    for (let b = 0; b < this.bombRigs.length; b += 1) {
      const rig = this.bombRigs[b]
      const bomb = bombs[b]

      if (!bomb) {
        rig.group.visible = false
        rig.ring.visible = false
        rig.line.visible = false
        continue
      }

      rig.group.visible = true
      rig.group.position.set(bomb.x, bomb.y, bomb.z)

      const pulse = (Math.sin(elapsed * 6 + bomb.id) + 1) / 2
      const armed = bomb.arm <= 0
      rig.core.rotation.x = elapsed * 1.4
      rig.core.rotation.y = elapsed * 1.9
      rig.core.scale.setScalar(0.85 + pulse * 0.35)
      rig.halo.scale.setScalar(1 + pulse * 0.45)
      // Mientras se arma, parpadea: avisa de que aún no se puede derribar.
      const blink = armed ? 1 : (Math.sin(elapsed * 22) + 1) / 2
      rig.halo.material.opacity = (0.2 + pulse * 0.22) * (armed ? 1 : blink)
      rig.core.material.color.setRGB(
        1,
        0.78 - pulse * 0.3,
        0.5 - pulse * 0.35,
      )

      // Área de explosión: anillo que late sobre el punto de detonación.
      rig.ring.visible = true
      rig.ring.position.set(bomb.aimX, bomb.aimY, bomb.aimZ)
      rig.ring.quaternion.copy(this.camera.quaternion)
      const radiusPulse = (Math.sin(elapsed * 4 + bomb.id) + 1) / 2
      rig.ring.scale.setScalar(0.97 + radiusPulse * 0.05)
      rig.ringMaterial.opacity = 0.14 + radiusPulse * 0.14

      // Trayectoria: el enjambre ve por dónde pasa la bomba.
      rig.line.visible = true
      const positions = rig.lineGeometry.attributes.position
      positions.array[0] = bomb.x
      positions.array[1] = bomb.y
      positions.array[2] = bomb.z
      positions.array[3] = bomb.aimX
      positions.array[4] = bomb.aimY
      positions.array[5] = bomb.aimZ
      positions.needsUpdate = true
      rig.lineMaterial.opacity = 0.16 + radiusPulse * 0.14
    }

    const events = sim.consumeBombs()
    for (const event of events) {
      if (event.type === 'explode') {
        this.totalBombExplosions += 1
        this._spawnBlast(event.x, event.y, event.z, event.radius)
        for (let i = 0; i < 26; i += 1) {
          this._spawnSpark(event.x, event.y, event.z, 1.6, 3, 13, 'kill')
        }
      } else if (event.type === 'intercept') {
        this.totalBombIntercepts += 1
        for (let i = 0; i < 12; i += 1) {
          this._spawnSpark(event.x, event.y, event.z, 0.7, 2, 8, 'hit')
        }
      } else if (event.type === 'launch') {
        this.totalBombsLaunched += 1
        for (let i = 0; i < 10; i += 1) {
          this._spawnSpark(event.x, event.y, event.z, 0.9, 2, 7, 'impact')
        }
      }
    }

    for (let i = this.blasts.length - 1; i >= 0; i -= 1) {
      const blast = this.blasts[i]
      blast.age += dt
      const t = Math.min(blast.age / blast.life, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      blast.mesh.quaternion.copy(this.camera.quaternion)
      blast.mesh.scale.setScalar(0.6 + eased * blast.radius)
      blast.mesh.material.opacity = (1 - t) * 0.75
      if (t >= 1) {
        this.scene.remove(blast.mesh)
        blast.mesh.geometry.dispose()
        blast.mesh.material.dispose()
        this.blasts.splice(i, 1)
      }
    }
  }

  _updateDefenseFx(dt) {
    const sim = this.sim
    const target = sim.target
    const active =
      Boolean(target) &&
      sim.params.defense > 0.05 &&
      sim.battleState === 'active'

    const blocks = sim.consumeBlocks()
    if (blocks > 0) {
      this.totalBlocks += blocks
      this.shieldFlash = Math.min(1.6, this.shieldFlash + 0.4)
    }

    if (sim.consumePulses() > 0 && target) {
      this.shieldFlash = 1
      this._spawnPulse(target)
    }

    this.shieldGroup.visible = active
    if (active) {
      this.shieldGroup.position.set(target.x, target.y, target.z)
      this._shieldDir
        .set(sim.shield.x, sim.shield.y, sim.shield.z)
        .normalize()
      this.shieldGroup.quaternion.setFromUnitVectors(
        this._shieldAxis,
        this._shieldDir,
      )

      const charge = sim.pulseCharge
      this.shieldCapMaterial.opacity = 0.08 + charge * 0.08 + this.shieldFlash * 0.22
      this.shieldRimMaterial.opacity =
        0.32 + charge * 0.3 + this.shieldFlash * 0.4
      this.shieldGroup.scale.setScalar(
        1 + charge * 0.02 + this.shieldFlash * 0.04,
      )
    }
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 1.8)

    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      const pulse = this.pulses[i]
      pulse.age += dt
      const t = Math.min(pulse.age / pulse.life, 1)
      if (t >= 1) {
        this.scene.remove(pulse.mesh)
        pulse.mesh.geometry.dispose()
        pulse.mesh.material.dispose()
        this.pulses.splice(i, 1)
        continue
      }
      const eased = 1 - Math.pow(1 - t, 3)
      if (pulse.billboard) {
        pulse.mesh.quaternion.copy(this.camera.quaternion)
        pulse.mesh.scale.setScalar(0.6 + eased * PULSE_RADIUS * 1.35)
        pulse.mesh.material.opacity = (1 - t) * 0.5
      } else {
        pulse.mesh.scale.setScalar(0.6 + eased * PULSE_RADIUS)
        pulse.mesh.material.opacity = (1 - t) * 0.18
      }
    }
  }

  _spawnPulse(target) {
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 16)
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x82e0ff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.position.set(target.x, target.y, target.z)
    sphere.scale.setScalar(0.6)
    this.scene.add(sphere)
    this.pulses.push({ mesh: sphere, age: 0, life: 0.95, billboard: false })

    const ringGeometry = new THREE.RingGeometry(0.93, 1, 96)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xb5f0ff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.position.set(target.x, target.y, target.z)
    this.scene.add(ring)
    this.pulses.push({ mesh: ring, age: 0, life: 0.85, billboard: true })
  }

  _spawnSpark(x, y, z, spread, speedMin, speedMax, palette = 'impact') {
    const spark = this.sparks[this.sparkCursor]
    this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length

    const colors =
      palette === 'down'
        ? [0xffb27a, 0xff7a6b, 0xff4d5e]
        : palette === 'kill'
          ? [0xffffff, 0xbff6ff, 0x7f9cff]
          : palette === 'hit'
            ? [0xe8ffff, 0x9fe8ff, 0xffffff]
            : [0xffd9a0, 0xffa074, 0xff6b5c]
    spark.sprite.material.color.setHex(
      colors[Math.floor(Math.random() * colors.length)],
    )

    const theta = Math.random() * Math.PI * 2
    const cosPhi = Math.random() * 2 - 1
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
    const speed = speedMin + Math.random() * (speedMax - speedMin)

    spark.vx = Math.cos(theta) * sinPhi * speed
    spark.vy = cosPhi * speed
    spark.vz = Math.sin(theta) * sinPhi * speed
    spark.sprite.position.set(
      x + (Math.random() - 0.5) * spread * 2,
      y + (Math.random() - 0.5) * spread * 2,
      z + (Math.random() - 0.5) * spread * 2,
    )
    spark.maxLife = 0.35 + Math.random() * 0.3
    spark.life = spark.maxLife
    spark.size = 0.9 + Math.random() * 1.5
    spark.sprite.visible = true
  }

  resize(width, height) {
    if (!width || !height) return
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    // En pantallas estrechas aleja la cámara para que quepa el enjambre.
    if (!this._userInteracted) this._fitCamera(width / height)
  }

  _fitCamera(aspect) {
    const halfWidth = BOUNDS.x * 0.68
    const vFov = THREE.MathUtils.degToRad(this.camera.fov)
    const needed = halfWidth / (Math.tan(vFov / 2) * aspect)
    const distance = THREE.MathUtils.clamp(needed, 85, 152)
    const direction = this.camera.position.clone().sub(this.controls.target)
    if (direction.lengthSq() === 0) direction.set(0, 0.17, 1)
    direction.normalize().multiplyScalar(distance)
    this.camera.position.copy(this.controls.target).add(direction)
    this.controls.update()
  }

  /** Marca que la persona ya tomó el control de la cámara. */
  notifyInteraction() {
    this._userInteracted = true
    this.controls.autoRotate = false
  }

  /**
   * Convierte un clic de pantalla en un punto 3D sobre el plano de la
   * cámara. El objetivo queda justo bajo el cursor en toda la página; solo
   * se limita al volumen operativo para que el enjambre pueda alcanzarlo.
   */
  pickTarget(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect()
    this._pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this._raycaster.setFromCamera(this._pointer, this.camera)
    this.camera.getWorldDirection(this._normal)
    this._plane.setFromNormalAndCoplanarPoint(this._normal, this._center)

    if (!this._raycaster.ray.intersectPlane(this._plane, this._hit)) {
      return null
    }

    const clamp = (value, max) => Math.min(Math.max(value, -max), max)
    const maxX = PLAY_BOUNDS.x * 0.83
    const maxY = PLAY_BOUNDS.y * 0.83
    const maxZ = PLAY_BOUNDS.z * 0.83
    return {
      x: clamp(this._hit.x, maxX),
      y: clamp(this._hit.y, maxY),
      z: clamp(this._hit.z, maxZ),
    }
  }

  spawnRipple(point) {
    const geometry = new THREE.RingGeometry(0.88, 1, 64)
    const material = new THREE.MeshBasicMaterial({
      color: 0x8feeff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(point.x, point.y, point.z)
    mesh.quaternion.copy(this.camera.quaternion)
    this.scene.add(mesh)
    this.ripples.push({ mesh, age: 0, life: 1.15 })
  }

  clearRipples() {
    for (const ripple of this.ripples) {
      this.scene.remove(ripple.mesh)
      ripple.mesh.geometry.dispose()
      ripple.mesh.material.dispose()
    }
    this.ripples = []

    for (const pulse of this.pulses) {
      this.scene.remove(pulse.mesh)
      pulse.mesh.geometry.dispose()
      pulse.mesh.material.dispose()
    }
    this.pulses = []
  }

  update(dt, elapsed) {
    this.clockTime = elapsed
    this.controls.update()

    // Tamaño adaptativo: más aves, aves más pequeñas.
    const targetSize = Math.min(
      1.15,
      Math.max(0.5, Math.pow(100 / Math.max(this.sim.count, 1), 0.16)),
    )
    const material = this.material
    const camDistance = this.camera.position.distanceTo(this.controls.target)
    const distanceFactor = THREE.MathUtils.clamp(camDistance / 85, 0.75, 1.8)
    material.uniforms.uSize.value +=
      (0.68 * targetSize * distanceFactor - material.uniforms.uSize.value) *
      Math.min(1, dt * 4)

    // Atenúa el brillo aditivo cuando hay muchas aves superpuestas.
    const targetIntensity = Math.min(
      1,
      Math.max(0.27, Math.pow(220 / Math.max(this.sim.count, 1), 0.42)),
    )
    material.uniforms.uIntensity.value +=
      (targetIntensity - material.uniforms.uIntensity.value) *
      Math.min(1, dt * 3.5)

    material.uniforms.uTime.value = elapsed

    this.geometry.instanceCount = this.sim.count
    this.offsetAttr.needsUpdate = true
    this.velocityAttr.needsUpdate = true
    this.healthAttr.needsUpdate = true

    // Marcador del destino.
    const target = this.sim.target
    this.marker.visible = Boolean(target)
    if (target) {
      this.marker.position.set(target.x, target.y, target.z)
      this.marker.quaternion.copy(this.camera.quaternion)

      const healthRatio = Math.max(
        0,
        Math.min(1, this.sim.targetHealth / TARGET_MAX_HEALTH),
      )
      const pulse = (Math.sin(elapsed * (2.6 + (1 - healthRatio) * 4)) + 1) / 2
      this.markerRing.scale.setScalar(
        1 + pulse * 0.16 + this.targetHitFlash * 0.12,
      )
      this.markerRing.material.opacity =
        0.32 + pulse * 0.28 + this.targetHitFlash * 0.25
      this.markerArc.rotation.z = elapsed * 0.55
      this.markerGlow.material.opacity =
        0.26 +
        pulse * 0.12 +
        this.sim.pulseCharge * 0.18 +
        this.targetHitFlash * 0.4
    }

    this._updateCombatFx(dt, elapsed)
    this._updateBombFx(dt, elapsed)
    this._updateDefenseFx(dt)
    this._updateLeaderFx(dt, elapsed)
    this._updateSparks(dt)

    // Ondas del clic.
    for (let i = this.ripples.length - 1; i >= 0; i -= 1) {
      const ripple = this.ripples[i]
      ripple.age += dt
      const t = Math.min(ripple.age / ripple.life, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      ripple.mesh.scale.setScalar(0.7 + eased * 16)
      ripple.mesh.quaternion.copy(this.camera.quaternion)
      ripple.mesh.material.opacity = (1 - t) * 0.8

      if (t >= 1) {
        this.scene.remove(ripple.mesh)
        ripple.mesh.geometry.dispose()
        ripple.mesh.material.dispose()
        this.ripples.splice(i, 1)
      }
    }
  }

  _updateSparks(dt) {
    const target = this.sim.target
    const impacts = this.sim.consumeImpacts()
    this.totalImpacts += impacts

    if (target && impacts > 0) {
      const spawn = Math.min(impacts, 8)
      for (let i = 0; i < spawn; i += 1) {
        this._spawnSpark(target.x, target.y, target.z, 1.2, 3.5, 12.5)
      }
    }

    const downEvents = this.sim.consumeLeaderDowns()
    const bursts = Math.min(downEvents.length, 3)
    for (let e = 0; e < bursts; e += 1) {
      const event = downEvents[e]
      for (let i = 0; i < 10; i += 1) {
        this._spawnSpark(
          event.x,
          event.y,
          event.z,
          0.8,
          3,
          10,
          'down',
        )
      }
    }

    for (const spark of this.sparks) {
      if (spark.life <= 0) continue

      spark.life -= dt
      if (spark.life <= 0) {
        spark.sprite.visible = false
        spark.sprite.material.opacity = 0
        continue
      }

      const k = spark.life / spark.maxLife
      spark.sprite.position.x += spark.vx * dt
      spark.sprite.position.y += spark.vy * dt
      spark.sprite.position.z += spark.vz * dt

      const drag = Math.max(0, 1 - dt * 3.5)
      spark.vx *= drag
      spark.vy *= drag
      spark.vz *= drag

      const size = spark.size * (0.3 + k * 1.3)
      spark.sprite.scale.set(size, size, 1)
      spark.sprite.material.opacity = k * 0.75
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.controls.dispose()
    this.clearRipples()
    this.birdMesh.geometry.dispose()
    this.material.dispose()
    this.dust.geometry.dispose()
    this.dust.material.dispose()
    this.dustTexture.dispose()
    for (const spark of this.sparks) {
      spark.sprite.material.dispose()
    }
    this.glowTexture.dispose()

    for (const label of this.leaderLabels) {
      if (label.material.map) label.material.map.dispose()
      label.material.dispose()
    }
    for (const halo of this.leaderHaloes) halo.material.dispose()
    this.leaderLinks.geometry.dispose()
    this.linkMaterial.dispose()

    this.shieldGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    })

    for (const rig of this.cannonRigs) {
      rig.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
      rig.glowGeometry.dispose()
      rig.glowMaterial.dispose()
      rig.lineGeometry.dispose()
      rig.lineMaterial.dispose()
      rig.marker.geometry.dispose()
      rig.markerMaterial.dispose()
    }

    for (const bullet of this.bullets) {
      bullet.geometry.dispose()
      bullet.material.dispose()
    }
    this.bullets = []

    for (const flash of this.flashes) {
      flash.geometry.dispose()
      flash.material.dispose()
    }
    this.flashes = []

    for (const rig of this.bombRigs) {
      rig.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
      rig.ring.geometry.dispose()
      rig.ringMaterial.dispose()
      rig.lineGeometry.dispose()
      rig.lineMaterial.dispose()
    }

    for (const blast of this.blasts) {
      blast.mesh.geometry.dispose()
      blast.mesh.material.dispose()
    }
    this.blasts = []

    this.marker.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    })
    this.renderer.dispose()
  }
}

function hslToRgb(h, s, l) {
  const hue = ((h % 1) + 1) % 1
  const a = s * Math.min(l, 1 - l)
  const channel = (n) => {
    const k = (n + hue * 12) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [channel(0), channel(8), channel(4)]
}

function createGlowTexture(intensity = 1) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  )
  gradient.addColorStop(0, `rgba(190, 248, 255, ${0.95 * intensity})`)
  gradient.addColorStop(0.35, `rgba(120, 220, 255, ${0.35 * intensity})`)
  gradient.addColorStop(1, 'rgba(80, 160, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}
