import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  BOUNDS,
  clamp,
  MAX_BOIDS,
  PULSE_RADIUS,
  SHIELD_ANGLE,
  SHIELD_RADIUS,
  SQUAD_COUNT,
} from './flock3d'
import {
  SQUAD_COLORS,
  SQUAD_COLORS_CSS,
  SQUAD_HUES,
} from './palette'

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

  varying vec3 vColor;
  varying float vDepth;

  void main() {
    vec3 forward = normalize(aVelocity + vec3(0.0001, 0.0001, 0.0001));
    vec3 upRef = abs(forward.y) > 0.94 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(upRef, forward));
    vec3 up = cross(forward, right);

    float birdScale = (0.8 + fract(aPhase * 6.618) * 0.42) * uSize;
    vec3 p = position * birdScale;

    // Aleteo: las puntas de las alas suben y bajan.
    float flap = sin(uTime * 8.0 + aPhase * 6.28318);
    p.y += abs(p.x) * flap * 0.5;
    p.z -= abs(p.x) * abs(flap) * 0.1;

    vec3 world = aOffset + right * p.x + up * p.y + forward * p.z;
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;

    vDepth = -mv.z;
    float nose = smoothstep(-1.2, 1.15, position.z);
    vColor = aColor * (0.72 + nose * 0.45);
  }
`

const BIRD_FRAGMENT_SHADER = /* glsl */ `
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uIntensity;

  varying vec3 vColor;
  varying float vDepth;

  void main() {
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
    this.view = simulation.getRenderState()
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

    this.ripples = []
    this.pulses = []
    this.totalImpacts = 0
    this.totalBlocks = 0
    this.shieldFlash = 0
    this.communicationFlash = 0
    this.lastCommandVersion = -1
    this.lastStrategyVersion = -1
    this._labelText = new Array(SQUAD_COUNT).fill('')

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

    geometry.setAttribute('aOffset', this.offsetAttr)
    geometry.setAttribute('aVelocity', this.velocityAttr)
    geometry.setAttribute('aColor', this.colorAttr)
    geometry.setAttribute('aPhase', this.phaseAttr)

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
    const view = this.view
    for (let s = 0; s < SQUAD_COUNT; s += 1) {
      const index = view.leaderOfSquad[s]
      if (index < 0 || index >= view.count) {
        this._labelText[s] = ''
        continue
      }
      const isCommander = index === view.commander
      const code = this.sim.getCode(index)
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
    const view = this.view
    if (view.commandVersion !== this.lastCommandVersion) {
      this.lastCommandVersion = view.commandVersion
      this._refreshLeaderLabels()
    }
    if (view.strategyVersion !== this.lastStrategyVersion) {
      this.lastStrategyVersion = view.strategyVersion
      this.communicationFlash = 1
    }
    this.communicationFlash = Math.max(0, this.communicationFlash - dt * 1.6)

    const positions = view.positions
    const leaders = view.leaderOfSquad
    const commander = view.commander
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
      if (index < 0 || index >= view.count) {
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
    if (commander >= 0 && commander < view.count) {
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

  _updateDefenseFx(dt) {
    const sim = this.sim
    const view = this.view
    const target = view.target
    const active = Boolean(target) && view.defenseActive

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
        .set(view.shield.x, view.shield.y, view.shield.z)
        .normalize()
      this.shieldGroup.quaternion.setFromUnitVectors(
        this._shieldAxis,
        this._shieldDir,
      )

      const charge = view.pulseCharge
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

  /** Convierte un clic de pantalla en un punto 3D sobre el plano de la cámara. */
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

    return {
      x: clamp(this._hit.x, -BOUNDS.x * 0.9, BOUNDS.x * 0.9),
      y: clamp(this._hit.y, -BOUNDS.y * 0.9, BOUNDS.y * 0.9),
      z: clamp(this._hit.z, -BOUNDS.z * 0.9, BOUNDS.z * 0.9),
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
    this.view = this.sim.getRenderState()
    this.controls.update()

    // Tamaño adaptativo: más aves, aves más pequeñas.
    const targetSize = Math.min(
      1.15,
      Math.max(0.5, Math.pow(100 / Math.max(this.view.count, 1), 0.16)),
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
      Math.max(0.27, Math.pow(220 / Math.max(this.view.count, 1), 0.42)),
    )
    material.uniforms.uIntensity.value +=
      (targetIntensity - material.uniforms.uIntensity.value) *
      Math.min(1, dt * 3.5)

    material.uniforms.uTime.value = elapsed

    this.geometry.instanceCount = this.view.count
    // Sube solo las instancias activas, no las 5000 posiciones reservadas.
    for (const attribute of [this.offsetAttr, this.velocityAttr]) {
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(0, this.view.count * 3)
      attribute.needsUpdate = true
    }

    // Marcador del destino.
    const target = this.view.target
    this.marker.visible = Boolean(target)
    if (target) {
      this.marker.position.set(target.x, target.y, target.z)
      this.marker.quaternion.copy(this.camera.quaternion)

      const pulse = (Math.sin(elapsed * 2.6) + 1) / 2
      this.markerRing.scale.setScalar(1 + pulse * 0.16)
      this.markerRing.material.opacity = 0.32 + pulse * 0.28
      this.markerArc.rotation.z = elapsed * 0.55
      this.markerGlow.material.opacity =
        0.26 + pulse * 0.12 + this.view.pulseCharge * 0.18
    }

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
    const target = this.view.target
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
