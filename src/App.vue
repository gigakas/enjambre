<script setup>
import { computed, onMounted, ref } from 'vue'
import { useBoids } from './composables/useBoids'
import { SQUAD_COLOR_BY_LETTER as SQUAD_COLORS } from './lib/palette'

const {
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
  minBoids,
  maxBoids,
  togglePause,
  scatter,
  clearTarget,
  reset,
} = useBoids()

const panelOpen = ref(true)

onMounted(() => {
  if (window.innerWidth < 820) panelOpen.value = false
})

const controls = [
  { key: 'separation', label: 'Separación', min: 0, max: 3, step: 0.05 },
  { key: 'alignment', label: 'Alineación', min: 0, max: 3, step: 0.05 },
  { key: 'cohesion', label: 'Cohesión', min: 0, max: 3, step: 0.05 },
  { key: 'seek', label: 'Ataque', min: 0, max: 3, step: 0.05 },
  { key: 'distribution', label: 'Distribución', min: 0, max: 2, step: 0.05 },
  { key: 'defense', label: 'Defensa', min: 0, max: 2, step: 0.05 },
  { key: 'maxSpeed', label: 'Velocidad', min: 3, max: 14, step: 0.1 },
]

const fsm = computed(() => ({
  distribute: stateCounts.value[0] + stateCounts.value[1],
  dive: stateCounts.value[2],
  retreat: stateCounts.value[3],
  evade: stateCounts.value[4],
}))

const stanceLabel = computed(() =>
  command.value.stance === 'repliegue' ? 'Repliegue' : 'Flanqueo',
)

const hintText = computed(() => {
  if (!hasTarget.value) {
    return 'Toca o haz clic para atacar · arrastra para orbitar.'
  }
  const commander = command.value.commander?.code
  if (!panelOpen.value && commander) {
    return `Mando ${commander} · objetivo defendido; el enjambre busca un ángulo abierto.`
  }
  return 'Objetivo defendido. El enjambre se redistribuye y busca un ángulo abierto.'
})

const countFill = computed(() => {
  const ratio = (count.value - minBoids) / (maxBoids - minBoids)
  return Math.min(100, Math.max(0, ratio * 100))
})

function formatValue(control) {
  return Number(params[control.key]).toFixed(control.step < 0.1 ? 2 : 1)
}

function fillPercent(control) {
  const ratio =
    (params[control.key] - control.min) / (control.max - control.min)
  return Math.min(100, Math.max(0, ratio * 100))
}
</script>

<template>
  <div class="app">
    <canvas ref="canvasRef" class="app__canvas"></canvas>

    <div class="ambient" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>

    <header class="hero">
      <p class="hero__eyebrow">
        <span class="eyebrow__dot"></span>
        <span class="eyebrow__long">Simulación · Boids 3D</span>
        <span class="eyebrow__short">Boids 3D</span>
      </p>
      <h1 class="hero__title">Enjambre</h1>
      <p class="hero__text">
        El objetivo se defiende. Cuatro escuadrones coordinan el ataque y
        buscan el ángulo débil.
        <span>Haz clic para ordenar la ofensiva; arrastra para orbitar.</span>
      </p>
      <ul class="rules" aria-hidden="true">
        <li><i style="--rule-color: #7ce8ff"></i>Separación</li>
        <li><i style="--rule-color: #a78bfa"></i>Alineación</li>
        <li><i style="--rule-color: #f0a6ff"></i>Cohesión</li>
      </ul>
    </header>

    <div class="status">
      <span><strong>{{ count }}</strong> aves</span>
      <span class="status__divider"></span>
      <span><strong>{{ fps }}</strong> fps</span>
      <span v-if="hasTarget" class="status__attack">ataque</span>
      <span v-if="paused" class="status__paused">en pausa</span>
    </div>

    <div class="hint" :class="{ 'hint--target': hasTarget }">
      <span class="hint__pulse" aria-hidden="true"><span></span></span>
      <p>{{ hintText }}</p>
    </div>

    <button
      v-show="!panelOpen"
      type="button"
      class="panel-launcher"
      @click="panelOpen = true"
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2 5h12M2 11h12M5.5 2.5v5M10.5 8.5v5"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
      Parámetros
    </button>

    <aside class="panel" :class="{ 'panel--visible': panelOpen }">
      <div class="panel__head">
        <div>
          <p class="panel__kicker">Mando y comportamiento</p>
          <h2 class="panel__title">Estrategia del enjambre</h2>
        </div>
        <button
          type="button"
          class="panel__close"
          aria-label="Cerrar ajustes"
          @click="panelOpen = false"
        >
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="panel__body">
        <section class="command">
          <div class="command__head">
            <p class="section-kicker">Cadena de mando</p>
            <span class="command__stance">{{ stanceLabel }}</span>
          </div>

          <p class="command__commander">
            <i class="command__crown" aria-hidden="true"></i>
            <span class="command__role">CMD</span>
            <b>{{ command.commander?.code ?? '—' }}</b>
          </p>

          <ul class="command__squads">
            <li v-for="squad in command.squads" :key="squad.letter">
              <i :style="{ background: SQUAD_COLORS[squad.letter] }"></i>
              <span class="command__letter">{{ squad.letter }}</span>
              <b>{{ squad.leader?.code ?? 'sin líder' }}</b>
              <em v-if="squad.leader?.isCommander">CMD</em>
            </li>
          </ul>

          <ul class="command__log">
            <li v-for="(entry, index) in command.log" :key="index">
              {{ entry }}
            </li>
            <li v-if="!command.log.length">Enlace establecido</li>
          </ul>
        </section>

        <label class="control">
          <span class="control__head">
            <span class="control__name">Cantidad</span>
            <span class="control__value">{{ count }} aves</span>
          </span>
          <input
            v-model.number="count"
            class="control__input control__input--count"
            type="range"
            :min="minBoids"
            :max="maxBoids"
            step="50"
            :style="{ '--fill': `${countFill}%` }"
            aria-label="Cantidad de aves"
          />
        </label>

        <label
          v-for="control in controls"
          :key="control.key"
          class="control"
        >
          <span class="control__head">
            <span class="control__name">{{ control.label }}</span>
            <span class="control__value">{{ formatValue(control) }}</span>
          </span>
          <input
            v-model.number="params[control.key]"
            class="control__input"
            type="range"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            :style="{ '--fill': `${fillPercent(control)}%` }"
            :aria-label="control.label"
          />
        </label>

        <section class="fsm">
          <p class="section-kicker">Máquina de estados</p>
          <div class="fsm__grid">
            <span class="fsm__item">
              <i style="--state-color: #63e6ff"></i>
              <span>Distribución</span>
              <b>{{ fsm.distribute }}</b>
            </span>
            <span class="fsm__item">
              <i style="--state-color: #ff9a76"></i>
              <span>Ataque</span>
              <b>{{ fsm.dive }}</b>
            </span>
            <span class="fsm__item">
              <i style="--state-color: #b69cff"></i>
              <span>Retirada</span>
              <b>{{ fsm.retreat }}</b>
            </span>
            <span class="fsm__item">
              <i style="--state-color: #ff8fb0"></i>
              <span>Evasión</span>
              <b>{{ fsm.evade }}</b>
            </span>
          </div>
          <p class="fsm__hint">
            Juego de congestión: cada ave elige el sector con mejor pago y
            evita el escudo.
          </p>
        </section>

        <div class="actions">
          <button
            type="button"
            class="btn btn--primary"
            @click="togglePause"
          >
            {{ paused ? 'Reanudar' : 'Pausar' }}
          </button>
          <button type="button" class="btn" @click="scatter">Esparcir</button>
          <button type="button" class="btn" @click="clearTarget">Abortar</button>
          <button type="button" class="btn" @click="reset">Reiniciar</button>
        </div>

        <p v-if="hasTarget" class="panel__stats">
          <span>
            <i class="panel__dot panel__dot--impact"></i>
            {{ impacts.toLocaleString('es-ES') }}
            {{ impacts === 1 ? 'impacto' : 'impactos' }}
          </span>
          <span>
            <i class="panel__dot panel__dot--block"></i>
            {{ blocks.toLocaleString('es-ES') }}
            {{ blocks === 1 ? 'bloqueo' : 'bloqueos' }}
          </span>
        </p>
      </div>
    </aside>

    <div v-if="error" class="webgl-error" role="alert">
      <p class="webgl-error__title">WebGL no disponible</p>
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<style scoped src="./App.css"></style>
