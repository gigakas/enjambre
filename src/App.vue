<script setup>
import { computed, onMounted, ref } from 'vue'
import { useBoids } from './composables/useBoids'
import { SQUAD_COLOR_BY_LETTER as SQUAD_COLORS } from './lib/palette'
import { formatNumber, locale, t, toggleLocale } from './i18n'

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
  targetHealth,
  targetEnergy,
  alive,
  total,
  plan,
  battleState,
  kills,
  collisions,
  shots,
  bombStock,
  bombActive,
  bombInterceptors,
  bombExplosions,
  bombIntercepts,
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

const controls = computed(() => [
  { key: 'separation', label: t('control.separation'), min: 0, max: 3, step: 0.05 },
  { key: 'alignment', label: t('control.alignment'), min: 0, max: 3, step: 0.05 },
  { key: 'cohesion', label: t('control.cohesion'), min: 0, max: 3, step: 0.05 },
  { key: 'seek', label: t('control.seek'), min: 0, max: 3, step: 0.05 },
  { key: 'distribution', label: t('control.distribution'), min: 0, max: 2, step: 0.05 },
  { key: 'defense', label: t('control.defense'), min: 0, max: 2, step: 0.05 },
  { key: 'maxSpeed', label: t('control.maxSpeed'), min: 3, max: 14, step: 0.1 },
])

const fsm = computed(() => ({
  distribute: stateCounts.value[0] + stateCounts.value[1],
  dive: stateCounts.value[2],
  retreat: stateCounts.value[3],
  evade: stateCounts.value[4],
  intercept: stateCounts.value[5] ?? 0,
}))

const stanceLabel = computed(() =>
  command.value.stance === 'repliegue'
    ? t('command.stanceRetreat')
    : t('command.stanceFlank'),
)

const healthPercent = computed(() =>
  Math.max(0, Math.min(100, targetHealth.value)),
)

const energyPercent = computed(() =>
  Math.max(0, Math.min(100, targetEnergy.value)),
)

const alivePercent = computed(() =>
  total.value > 0 ? (alive.value / total.value) * 100 : 0,
)

const planLabel = computed(() =>
  plan.value === 'ordenado' ? t('plan.ordered') : t('plan.divided'),
)

const outcome = computed(() => {
  if (battleState.value === 'target-down') {
    return {
      title: t('outcome.targetDownTitle'),
      text: t('outcome.targetDownText'),
      tone: 'win',
    }
  }
  if (battleState.value === 'swarm-down') {
    return {
      title: t('outcome.swarmDownTitle'),
      text: t('outcome.swarmDownText'),
      tone: 'lose',
    }
  }
  return null
})

const hintText = computed(() => {
  if (!hasTarget.value) return t('hint.idle')
  if (battleState.value === 'target-down') return t('hint.targetDown')
  if (battleState.value === 'swarm-down') return t('hint.swarmDown')

  const commander = command.value.commander?.code
  const status = t('hint.status', {
    plan: planLabel.value,
    alive: alive.value,
    total: total.value,
    hp: Math.round(targetHealth.value),
  })

  if (bombActive.value > 0) {
    return t('hint.bomb', { n: bombInterceptors.value })
  }
  if (!panelOpen.value && commander) {
    return t('hint.command', { code: commander, status })
  }
  return t('hint.footer', { status })
})

/** Últimos eventos de mando, ya traducidos al idioma activo. */
const commandLogEntries = computed(() => {
  const entries = command.value.log ?? []
  if (!entries.length) return [t('command.logEmpty')]
  return entries.map((entry) =>
    typeof entry === 'string' ? entry : t(entry.key, entry.params ?? {}),
  )
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
        <span class="eyebrow__long">{{ t('app.eyebrowLong') }}</span>
        <span class="eyebrow__short">{{ t('app.eyebrowShort') }}</span>
      </p>
      <h1 class="hero__title">{{ t('app.title') }}</h1>
      <p class="hero__text">
        {{ t('app.intro') }}
        <span>{{ t('app.hint') }}</span>
      </p>
      <ul class="rules" aria-hidden="true">
        <li><i style="--rule-color: #7ce8ff"></i>{{ t('app.rules.separation') }}</li>
        <li><i style="--rule-color: #a78bfa"></i>{{ t('app.rules.alignment') }}</li>
        <li><i style="--rule-color: #f0a6ff"></i>{{ t('app.rules.cohesion') }}</li>
      </ul>
    </header>

    <div class="status">
      <span><strong>{{ count }}</strong> {{ t('status.birdsLabel') }}</span>
      <span class="status__divider"></span>
      <span><strong>{{ fps }}</strong> fps</span>
      <span v-if="hasTarget" class="status__attack">{{ t('status.attack') }}</span>
      <span v-if="paused" class="status__paused">{{ t('status.paused') }}</span>
      <button
        type="button"
        class="status__lang"
        :aria-label="t('status.language')"
        :title="t('status.language')"
        @click="toggleLocale"
      >
        {{ locale === 'en' ? 'EN' : 'ES' }}
      </button>
    </div>

    <div
      v-if="hasTarget"
      class="battle"
      :class="{ 'battle--over': Boolean(outcome) }"
    >
      <div class="battle__head">
        <span class="battle__label">{{ t('battle.label') }}</span>
        <span class="battle__plan">{{ planLabel }}</span>
      </div>
      <div class="battle__bar battle__bar--health">
        <i :style="{ width: `${healthPercent}%` }"></i>
        <span>{{ Math.round(targetHealth) }} / 100</span>
      </div>
      <div class="battle__bar battle__bar--energy">
        <i :style="{ width: `${energyPercent}%` }"></i>
        <span>{{ t('battle.energy', { n: Math.round(targetEnergy) }) }}</span>
      </div>
      <div class="battle__foot">
        <span>{{ t('battle.birds', { alive, total }) }}</span>
        <span>{{ t('battle.kills', { n: kills }) }}</span>
        <span>{{ t('battle.collisions', { n: collisions }) }}</span>
      </div>
      <div class="battle__bombs">
        <span class="battle__bombs-label">{{ t('battle.bombs') }}</span>
        <span class="battle__bombs-pips">
          <i
            v-for="n in 5"
            :key="n"
            :class="{ 'battle__pip--spent': n > bombStock }"
          ></i>
        </span>
        <span v-if="bombActive > 0" class="battle__bombs-live">
          {{ t('battle.bombsFlying', { n: bombActive, m: bombInterceptors }) }}
        </span>
        <span v-else class="battle__bombs-live battle__bombs-live--muted">
          {{ t('battle.bombsLeft', { n: bombStock }) }}
        </span>
      </div>
      <p v-if="outcome" class="battle__outcome" :class="`battle__outcome--${outcome.tone}`">
        <b>{{ outcome.title }}</b>
        <span>{{ outcome.text }}</span>
      </p>
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
      {{ t('launcher.parameters') }}
    </button>

    <aside class="panel" :class="{ 'panel--visible': panelOpen }">
      <div class="panel__head">
        <div>
          <p class="panel__kicker">{{ t('panel.kicker') }}</p>
          <h2 class="panel__title">{{ t('panel.title') }}</h2>
        </div>
        <button
          type="button"
          class="panel__close"
          :aria-label="t('panel.close')"
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
            <p class="section-kicker">{{ t('command.kicker') }}</p>
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
              <b>{{ squad.leader?.code || t('command.noLeader') }}</b>
              <em v-if="squad.leader?.isCommander">CMD</em>
            </li>
          </ul>

          <ul class="command__log">
            <li v-for="(entry, index) in commandLogEntries" :key="index">
              {{ entry }}
            </li>
          </ul>
        </section>

        <section v-if="hasTarget" class="combat">
          <div class="combat__head">
            <p class="section-kicker">{{ t('combat.kicker') }}</p>
            <span class="combat__plan">{{ planLabel }}</span>
          </div>

          <div class="combat__meter">
            <span class="combat__name">{{ t('combat.health') }}</span>
            <span class="combat__value">{{ Math.round(targetHealth) }} / 100</span>
          </div>
          <div class="combat__bar">
            <i
              class="combat__bar--health"
              :style="{ width: `${healthPercent}%` }"
            ></i>
          </div>

          <div class="combat__meter">
            <span class="combat__name">{{ t('combat.energy') }}</span>
            <span class="combat__value">{{ Math.round(targetEnergy) }} / 100</span>
          </div>
          <div class="combat__bar">
            <i
              class="combat__bar--energy"
              :style="{ width: `${energyPercent}%` }"
            ></i>
          </div>

          <div class="combat__meter">
            <span class="combat__name">{{ t('combat.alive') }}</span>
            <span class="combat__value">{{ alive }} / {{ total }}</span>
          </div>
          <div class="combat__bar">
            <i
              class="combat__bar--swarm"
              :style="{ width: `${alivePercent}%` }"
            ></i>
          </div>

          <div class="combat__meter">
            <span class="combat__name">{{ t('combat.bombs') }}</span>
            <span class="combat__value">{{ bombStock }} / 5</span>
          </div>
          <div class="combat__bar">
            <i
              class="combat__bar--bomb"
              :style="{ width: `${(bombStock / 5) * 100}%` }"
            ></i>
          </div>

          <p class="combat__rows">
            <span>
              {{ t('combat.bombsFlying', { n: bombActive }) }}
              <em v-if="bombInterceptors > 0">
                {{ t('combat.bombsInterceptors', { n: bombInterceptors }) }}
              </em>
            </span>
            <span>
              {{ t('combat.bombsExplosions', { n: bombExplosions }) }}
              <em>{{ t('combat.bombsDowned', { n: bombIntercepts }) }}</em>
            </span>
          </p>

          <p class="combat__hint">
            {{ t('combat.hint') }}
          </p>
        </section>

        <label class="control">
          <span class="control__head">
            <span class="control__name">{{ t('control.count') }}</span>
            <span class="control__value">{{ t('control.countValue', { n: count }) }}</span>
          </span>
          <input
            v-model.number="count"
            class="control__input control__input--count"
            type="range"
            :min="minBoids"
            :max="maxBoids"
            step="50"
            :style="{ '--fill': `${countFill}%` }"
            :aria-label="t('control.countAria')"
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
          <p class="section-kicker">{{ t('fsm.kicker') }}</p>
          <div class="fsm__grid">
            <span class="fsm__item">
              <i style="--state-color: #63e6ff"></i>
              <span>{{ t('fsm.distribute') }}</span>
              <b>{{ fsm.distribute }}</b>
            </span>
            <span class="fsm__item">
              <i style="--state-color: #ff9a76"></i>
              <span>{{ t('fsm.dive') }}</span>
              <b>{{ fsm.dive }}</b>
            </span>
            <span class="fsm__item">
              <i style="--state-color: #b69cff"></i>
              <span>{{ t('fsm.retreat') }}</span>
              <b>{{ fsm.retreat }}</b>
            </span>
            <span class="fsm__item">
              <i style="--state-color: #ff8fb0"></i>
              <span>{{ t('fsm.evade') }}</span>
              <b>{{ fsm.evade }}</b>
            </span>
            <span class="fsm__item">
              <i style="--state-color: #ffc861"></i>
              <span>{{ t('fsm.intercept') }}</span>
              <b>{{ fsm.intercept }}</b>
            </span>
          </div>
          <p class="fsm__hint">
            {{ t('fsm.hint') }}
          </p>
        </section>

        <div class="actions">
          <button
            type="button"
            class="btn btn--primary"
            @click="togglePause"
          >
            {{ paused ? t('action.resume') : t('action.pause') }}
          </button>
          <button type="button" class="btn" @click="scatter">{{ t('action.scatter') }}</button>
          <button type="button" class="btn" @click="clearTarget">{{ t('action.abort') }}</button>
          <button type="button" class="btn" @click="reset">{{ t('action.reset') }}</button>
        </div>

        <p v-if="hasTarget" class="panel__stats">
          <span>
            <i class="panel__dot panel__dot--impact"></i>
            {{ t('stats.impacts', { n: formatNumber(impacts) }) }}
          </span>
          <span>
            <i class="panel__dot panel__dot--block"></i>
            {{ t('stats.blocks', { n: formatNumber(blocks) }) }}
          </span>
          <span>
            <i class="panel__dot panel__dot--kill"></i>
            {{ t('stats.kills', { n: formatNumber(kills) }) }}
          </span>
          <span>
            <i class="panel__dot panel__dot--shot"></i>
            {{ t('stats.shots', { n: formatNumber(shots) }) }}
          </span>
        </p>
      </div>
    </aside>

    <div v-if="error" class="webgl-error" role="alert">
      <p class="webgl-error__title">{{ t('error.title') }}</p>
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<style scoped src="./App.css"></style>
