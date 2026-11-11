import { ref, watch } from 'vue'

/**
 * Idiomas disponibles. El inglés es el idioma por defecto y el español
 * queda como opción alternativa.
 */
export const LOCALES = ['en', 'es']
export const DEFAULT_LOCALE = 'en'

const STORAGE_KEY = 'enjambre:locale'

const messages = {
  en: {
    app: {
      eyebrowLong: 'Simulation · Boids 3D',
      eyebrowShort: 'Boids 3D',
      title: 'Enjambre',
      intro:
        'The objective defends itself with two machine guns that sweep the screen and five expansion bombs. Four squads coordinate the attack, dodge the fire and plan to knock the bombs down.',
      hint: 'Click to order the offensive; drag to orbit.',
      rules: {
        separation: 'Separation',
        alignment: 'Alignment',
        cohesion: 'Cohesion',
      },
      language: 'Language',
    },
    status: {
      birds: '{n} birds',
      birdsLabel: 'birds',
      attack: 'attack',
      paused: 'paused',
      language: 'Language',
    },
    battle: {
      label: 'Objective',
      energy: '{n} energy',
      birds: '{alive}/{total} birds',
      kills: { one: '{n} downed', other: '{n} downed' },
      collisions: { one: '{n} impact', other: '{n} impacts' },
      bombs: 'Bombs',
      bombsFlying: '{n} in flight · {m} interceptors',
      bombsLeft: '{n}/5 left',
    },
    outcome: {
      targetDownTitle: 'Objective destroyed',
      targetDownText: 'The swarm has overcome the defence.',
      swarmDownTitle: 'Swarm annihilated',
      swarmDownText: 'The two machine guns have cleared the sky.',
    },
    hint: {
      idle: 'Tap or click to attack · drag to orbit.',
      targetDown: 'Objective destroyed. Reset or place a new objective.',
      swarmDown: 'Swarm annihilated. Reset to launch another offensive.',
      bomb: 'Expansion bomb in flight · {n} birds intercepting to reduce the damage.',
      status: '{plan} · {alive}/{total} birds · health {hp}%',
      command: 'Command {code} · {status}',
      footer: '{status} · the cannons sweep the sky.',
    },
    launcher: {
      parameters: 'Parameters',
    },
    panel: {
      kicker: 'Command and behaviour',
      title: 'Swarm strategy',
      close: 'Close settings',
    },
    command: {
      kicker: 'Chain of command',
      stanceFlank: 'Flanking',
      stanceRetreat: 'Withdrawal',
      noLeader: 'no leader',
      logEmpty: 'Link established',
    },
    combat: {
      kicker: 'Combat',
      health: 'Objective health',
      energy: 'Machine gun energy',
      alive: 'Live attackers',
      bombs: 'Expansion bombs',
      bombsFlying: '{n} in flight',
      bombsInterceptors: { one: '· {n} interceptor', other: '· {n} interceptors' },
      bombsExplosions: { one: '{n} explosion', other: '{n} explosions' },
      bombsDowned: { one: '· {n} downed', other: '· {n} downed' },
      hint:
        'Every shot takes 1 health from an attacker; every collision takes 2 from the objective. Bombs destroy everything inside their radius and always detonate: attackers detect them and ram them to move the blast away from the centre of the swarm.',
    },
    control: {
      count: 'Count',
      countValue: '{n} birds',
      countAria: 'Number of birds',
      separation: 'Separation',
      alignment: 'Alignment',
      cohesion: 'Cohesion',
      seek: 'Attack',
      distribution: 'Distribution',
      defense: 'Defence',
      maxSpeed: 'Speed',
    },
    fsm: {
      kicker: 'State machine',
      distribute: 'Distribution',
      dive: 'Attack',
      retreat: 'Retreat',
      evade: 'Evasion',
      intercept: 'Interception',
      hint:
        'Congestion game: every bird picks the sector with the best payoff and avoids the shield.',
    },
    action: {
      resume: 'Resume',
      pause: 'Pause',
      scatter: 'Scatter',
      abort: 'Abort',
      reset: 'Reset',
    },
    stats: {
      impacts: { one: '{n} impact', other: '{n} impacts' },
      blocks: { one: '{n} block', other: '{n} blocks' },
      kills: { one: '{n} downed', other: '{n} downed' },
      shots: { one: '{n} shot', other: '{n} shots' },
    },
    plan: {
      ordered: 'Ordered plan',
      divided: 'Divided plan',
    },
    error: {
      title: 'WebGL unavailable',
      webgl:
        'Your browser could not start WebGL. Try another browser or enable hardware acceleration.',
    },
    log: {
      commandInit: 'Initial command · {code}',
      leaderDown: '{code} downed · {next} takes squad {squad}',
      leaderDownNoSuccessor: '{code} downed · no successor in squad {squad}',
      commander: '{code} takes command of the swarm',
      noSuccessor: 'No successor available · command on hold',
      targetDown: 'Objective destroyed · the swarm breaks ranks',
      swarmDown: 'Swarm annihilated · the objective holds',
      bombLaunched: 'Objective launches an expansion bomb',
      bombDetonate: 'Bomb detonates · {n} attackers destroyed',
      bombDetonateEmpty: 'Bomb detonates without casualties',
      bombDetected: 'Bomb detected · {n} birds intercept it',
      bombResisted: 'Bomb resisted · the objective is too close',
      planOrdered: 'Ordered plan · assault in waves',
      planDivided: 'Divided plan · attack from all flanks',
    },
  },

  es: {
    app: {
      eyebrowLong: 'Simulación · Boids 3D',
      eyebrowShort: 'Boids 3D',
      title: 'Enjambre',
      intro:
        'El objetivo se defiende con dos metralletas que barren la pantalla y cinco bombas de expansión. Cuatro escuadrones coordinan el ataque, esquivan los disparos y planifican derribar las bombas.',
      hint: 'Haz clic para ordenar la ofensiva; arrastra para orbitar.',
      rules: {
        separation: 'Separación',
        alignment: 'Alineación',
        cohesion: 'Cohesión',
      },
      language: 'Idioma',
    },
    status: {
      birds: '{n} aves',
      birdsLabel: 'aves',
      attack: 'ataque',
      paused: 'en pausa',
      language: 'Idioma',
    },
    battle: {
      label: 'Objetivo',
      energy: '{n} energía',
      birds: '{alive}/{total} aves',
      kills: { one: '{n} derribo', other: '{n} derribos' },
      collisions: { one: '{n} impacto', other: '{n} impactos' },
      bombs: 'Bombas',
      bombsFlying: '{n} en vuelo · {m} interceptores',
      bombsLeft: '{n}/5 restantes',
    },
    outcome: {
      targetDownTitle: 'Objetivo destruido',
      targetDownText: 'El enjambre ha superado la defensa.',
      swarmDownTitle: 'Enjambre aniquilado',
      swarmDownText: 'Las dos metralletas han despejado el cielo.',
    },
    hint: {
      idle: 'Toca o haz clic para atacar · arrastra para orbitar.',
      targetDown: 'Objetivo destruido. Reinicia o coloca un nuevo objetivo.',
      swarmDown: 'Enjambre aniquilado. Reinicia para lanzar otra ofensiva.',
      bomb: 'Bomba de expansión en vuelo · {n} aves interceptan para reducir el daño.',
      status: '{plan} · {alive}/{total} aves · salud {hp}%',
      command: 'Mando {code} · {status}',
      footer: '{status} · los cañones barren el cielo.',
    },
    launcher: {
      parameters: 'Parámetros',
    },
    panel: {
      kicker: 'Mando y comportamiento',
      title: 'Estrategia del enjambre',
      close: 'Cerrar ajustes',
    },
    command: {
      kicker: 'Cadena de mando',
      stanceFlank: 'Flanqueo',
      stanceRetreat: 'Repliegue',
      noLeader: 'sin líder',
      logEmpty: 'Enlace establecido',
    },
    combat: {
      kicker: 'Combate',
      health: 'Salud del objetivo',
      energy: 'Energía de metralletas',
      alive: 'Atacantes vivos',
      bombs: 'Bombas de expansión',
      bombsFlying: '{n} en vuelo',
      bombsInterceptors: { one: '· {n} interceptor', other: '· {n} interceptores' },
      bombsExplosions: { one: '{n} explosión', other: '{n} explosiones' },
      bombsDowned: { one: '· {n} derribada', other: '· {n} derribadas' },
      hint:
        'Cada disparo resta 1 de salud a un atacante; cada colisión resta 2 al objetivo. Las bombas destruyen todo lo que queda dentro de su radio y siempre detonan: los atacantes las detectan y las embisten para apartar la explosión del centro del enjambre.',
    },
    control: {
      count: 'Cantidad',
      countValue: '{n} aves',
      countAria: 'Cantidad de aves',
      separation: 'Separación',
      alignment: 'Alineación',
      cohesion: 'Cohesión',
      seek: 'Ataque',
      distribution: 'Distribución',
      defense: 'Defensa',
      maxSpeed: 'Velocidad',
    },
    fsm: {
      kicker: 'Máquina de estados',
      distribute: 'Distribución',
      dive: 'Ataque',
      retreat: 'Retirada',
      evade: 'Evasión',
      intercept: 'Intercepción',
      hint:
        'Juego de congestión: cada ave elige el sector con mejor pago y evita el escudo.',
    },
    action: {
      resume: 'Reanudar',
      pause: 'Pausar',
      scatter: 'Esparcir',
      abort: 'Abortar',
      reset: 'Reiniciar',
    },
    stats: {
      impacts: { one: '{n} impacto', other: '{n} impactos' },
      blocks: { one: '{n} bloqueo', other: '{n} bloqueos' },
      kills: { one: '{n} derribo', other: '{n} derribos' },
      shots: { one: '{n} disparo', other: '{n} disparos' },
    },
    plan: {
      ordered: 'Plan ordenado',
      divided: 'Plan dividido',
    },
    error: {
      title: 'WebGL no disponible',
      webgl:
        'Tu navegador no ha podido iniciar WebGL. Prueba con otro navegador o activa la aceleración por hardware.',
    },
    log: {
      commandInit: 'Mando inicial · {code}',
      leaderDown: '{code} derribada · {next} asume el escuadrón {squad}',
      leaderDownNoSuccessor: '{code} derribada · sin relevo en el escuadrón {squad}',
      commander: '{code} toma el mando del enjambre',
      noSuccessor: 'Sin relevo disponible · mando en espera',
      targetDown: 'Objetivo destruido · el enjambre rompe filas',
      swarmDown: 'Enjambre aniquilado · el objetivo resiste',
      bombLaunched: 'Objetivo lanza una bomba de expansión',
      bombDetonate: 'Bomba detona · {n} atacantes destruidos',
      bombDetonateEmpty: 'Bomba detona sin bajas',
      bombDetected: 'Bomba detectada · {n} aves la interceptan',
      bombResisted: 'Bomba resistida · el objetivo está demasiado cerca',
      planOrdered: 'Plan ordenado · asalto por oleadas',
      planDivided: 'Plan dividido · ataque por flancos',
    },
  },
}

function readStoredLocale() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && LOCALES.includes(stored)) return stored
  } catch {
    // Sin almacenamiento disponible: se usa el idioma por defecto.
  }
  return DEFAULT_LOCALE
}

/** Idioma activo. Por defecto inglés. */
export const locale = ref(readStoredLocale())

if (typeof document !== 'undefined') {
  document.documentElement.lang = locale.value
}

watch(locale, (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Sin almacenamiento: el idioma solo dura esta sesión.
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = value
  }
})

export function setLocale(value) {
  if (LOCALES.includes(value)) locale.value = value
}

export function toggleLocale() {
  locale.value = locale.value === 'en' ? 'es' : 'en'
}

function lookup(dictionary, key) {
  return key
    .split('.')
    .reduce(
      (node, part) =>
        node && typeof node === 'object' ? node[part] : undefined,
      dictionary,
    )
}

/**
 * Traduce una clave. Admite placeholders `{param}` y variantes de
 * plural `{ one, other }` usando el parámetro `n`.
 */
export function t(key, params = {}) {
  const message =
    lookup(messages[locale.value], key) ?? lookup(messages.en, key) ?? key

  let template = message
  if (message && typeof message === 'object') {
    template = message.other ?? message.one ?? key
    // El plural se decide con el valor numérico (puede venir como texto
    // cuando el número ya está formateado).
    if (params.n !== undefined && Number(params.n) === 1 && message.one) {
      template = message.one
    }
  }

  if (typeof template !== 'string') return key

  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined || params[name] === null
      ? match
      : String(params[name]),
  )
}

/** Formatea un número según el idioma activo. */
export function formatNumber(value) {
  const tag = locale.value === 'es' ? 'es-ES' : 'en-US'
  return Number(value).toLocaleString(tag)
}
