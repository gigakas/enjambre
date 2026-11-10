<script setup>
import { computed, onMounted, ref } from 'vue'
import { useBoids } from './composables/useBoids'
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

const SQUAD_COLORS = {
  A: '#63e6ff',
  B: '#7f9cff',
  C: '#b18cff',
  D: '#ff8fd0',
}

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

/** Último evento de mando, ya traducido al idioma activo. */
const commandLogText = computed(() => {
  const entry = command.value.log?.[0]
  if (!entry) return t('command.logEmpty')
  if (typeof entry === 'string') return entry
  return t(entry.key, entry.params ?? {})
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

          <p class="command__log">
            {{ commandLogText }}
          </p>
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

<style scoped>
.app {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app__canvas {
  position: fixed;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}

.vignette {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(
    125% 105% at 50% 42%,
    transparent 42%,
    rgba(2, 4, 9, 0.62) 100%
  );
}

.ambient {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(
      65% 60% at 74% 16%,
      rgba(80, 120, 255, 0.14),
      transparent 70%
    ),
    radial-gradient(
      55% 55% at 20% 80%,
      rgba(124, 232, 255, 0.08),
      transparent 70%
    );
  mix-blend-mode: screen;
}

/* ---------- Cabecera ---------- */

.hero {
  position: fixed;
  top: 38px;
  left: 42px;
  z-index: 2;
  max-width: 360px;
  pointer-events: none;
}

.hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 16px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #93a9c9;
}

.eyebrow__short {
  display: none;
}

.eyebrow__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7ce8ff;
  box-shadow: 0 0 10px 2px rgba(124, 232, 255, 0.6);
  animation: breathe 2.8s ease-in-out infinite;
}

.hero__title {
  margin: 0;
  font-size: clamp(46px, 5.4vw, 78px);
  font-weight: 200;
  line-height: 0.94;
  letter-spacing: -0.05em;
  background: linear-gradient(112deg, #ffffff 8%, #c3eeff 46%, #a794ff 92%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero__text {
  max-width: 300px;
  margin: 18px 0 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: #8ea2c2;
}

.hero__text span {
  color: #d3ebff;
}

.rules {
  display: flex;
  gap: 18px;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
}

.rules li {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 9.5px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #7c8fae;
}

.rules i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rule-color);
  box-shadow: 0 0 7px var(--rule-color);
}

/* ---------- Estado ---------- */

.status {
  position: fixed;
  top: 40px;
  right: 42px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid rgba(140, 180, 255, 0.14);
  background: rgba(8, 14, 26, 0.55);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  font-size: 11.5px;
  color: #8fa3c2;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.status strong {
  font-weight: 500;
  color: #e7f3ff;
}

.status__divider {
  width: 1px;
  height: 11px;
  background: rgba(140, 180, 255, 0.2);
}

.status__paused {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #ffd08a;
}

.status__lang {
  pointer-events: auto;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(140, 180, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: #a9c0e0;
  font-size: 9px;
  letter-spacing: 0.14em;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.status__lang:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(140, 200, 255, 0.4);
  color: #ffffff;
}

.status__attack {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #ffa078;
}

/* ---------- Combate ---------- */

.battle {
  position: fixed;
  top: 40px;
  left: 50%;
  z-index: 2;
  width: 300px;
  padding: 12px 14px 11px;
  transform: translateX(-50%);
  border-radius: 14px;
  border: 1px solid rgba(255, 150, 110, 0.2);
  background: rgba(16, 11, 14, 0.58);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  pointer-events: none;
  transition:
    border-color 0.4s ease,
    background 0.4s ease;
}

.battle--over {
  border-color: rgba(140, 180, 255, 0.28);
  background: rgba(9, 14, 24, 0.68);
}

.battle__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.battle__label {
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #ffb49a;
}

.battle__plan {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: #9fc4e8;
}

.battle__bar {
  position: relative;
  height: 7px;
  margin-bottom: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.battle__bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.35s ease;
}

.battle__bar--health i {
  background: linear-gradient(90deg, #ff6b5c, #ffb07a);
  box-shadow: 0 0 10px rgba(255, 120, 90, 0.55);
}

.battle__bar--energy i {
  background: linear-gradient(90deg, #63e6ff, #8fb4ff);
  box-shadow: 0 0 10px rgba(99, 230, 255, 0.45);
}

.battle__bar span {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 7px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.72);
}

.battle__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 2px;
  font-size: 9px;
  color: #b9c8de;
  font-variant-numeric: tabular-nums;
}

.battle__foot b {
  font-weight: 600;
  color: #ffffff;
}

.battle__bombs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 150, 110, 0.14);
}

.battle__bombs-label {
  font-size: 8.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #ffb49a;
}

.battle__bombs-pips {
  display: inline-flex;
  gap: 3px;
}

.battle__bombs-pips i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: #ffb457;
  box-shadow: 0 0 7px rgba(255, 180, 87, 0.85);
}

.battle__bombs-pips i.battle__pip--spent {
  background: rgba(255, 255, 255, 0.16);
  box-shadow: none;
}

.battle__bombs-live {
  font-size: 8.5px;
  color: #ffd9a8;
}

.battle__bombs-live--muted {
  color: #7f93b1;
}

.battle__outcome {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 9px 0 0;
  padding-top: 8px;
  border-top: 1px solid rgba(140, 180, 255, 0.16);
}

.battle__outcome b {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.battle__outcome span {
  font-size: 9.5px;
  color: #a8b9d2;
}

.battle__outcome--win b {
  color: #8ef0c0;
}

.battle__outcome--lose b {
  color: #ff9a8a;
}

/* ---------- Pista inferior ---------- */

.hint {
  position: fixed;
  left: 42px;
  bottom: 36px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 18px 11px 14px;
  border-radius: 999px;
  border: 1px solid rgba(140, 180, 255, 0.12);
  background: rgba(8, 14, 26, 0.5);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  pointer-events: none;
  transition:
    border-color 0.45s ease,
    background 0.45s ease;
}

.hint p {
  margin: 0;
  font-size: 12px;
  color: #a5b8d5;
}

.hint--target {
  border-color: rgba(255, 150, 110, 0.34);
  background: rgba(28, 15, 12, 0.55);
}

.hint--target p {
  color: #ffe0d3;
}

.hint--target .hint__pulse::before {
  border-color: rgba(255, 150, 110, 0.55);
}

.hint--target .hint__pulse span {
  background: #ff9a76;
  box-shadow: 0 0 9px rgba(255, 140, 100, 0.9);
}

.hint__pulse {
  position: relative;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
}

.hint__pulse::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(124, 232, 255, 0.5);
  animation: ping 2.6s ease-out infinite;
}

.hint__pulse span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #7ce8ff;
  box-shadow: 0 0 9px rgba(124, 232, 255, 0.9);
}

/* ---------- Panel ---------- */

.panel {
  position: fixed;
  right: 38px;
  bottom: 36px;
  z-index: 3;
  width: 308px;
  padding: 20px;
  border-radius: 20px;
  border: 1px solid rgba(140, 180, 255, 0.14);
  background: linear-gradient(
    165deg,
    rgba(16, 24, 42, 0.84),
    rgba(7, 11, 20, 0.88)
  );
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
  box-shadow:
    0 30px 70px -28px rgba(0, 0, 0, 0.85),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  max-height: calc(100dvh - 72px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(140, 180, 255, 0.25) transparent;
  opacity: 0;
  visibility: hidden;
  transform: translateY(14px) scale(0.98);
  pointer-events: none;
  transition:
    opacity 0.3s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0.3s;
}

.panel::-webkit-scrollbar {
  width: 5px;
}

.panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(140, 180, 255, 0.22);
}

.panel--visible {
  opacity: 1;
  visibility: visible;
  transform: none;
  pointer-events: auto;
}

.panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel__kicker {
  margin: 0 0 5px;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #7d93b6;
}

.panel__title {
  margin: 0;
  font-size: 16.5px;
  font-weight: 500;
  letter-spacing: -0.015em;
  color: #f0f7ff;
}

/* ---------- Mando ---------- */

.section-kicker {
  margin: 0 0 9px;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7d93b6;
}

.command {
  margin-bottom: 14px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(140, 180, 255, 0.12);
  background: rgba(255, 255, 255, 0.025);
}

.command__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}

.command__head .section-kicker {
  margin-bottom: 0;
  white-space: nowrap;
}

.command__stance {
  font-size: 8.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8fe3ff;
  white-space: nowrap;
}

.command__commander {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 9px;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: #8398b8;
}

.command__crown {
  width: 6px;
  height: 6px;
  background: #ffd37a;
  box-shadow: 0 0 8px rgba(255, 211, 122, 0.8);
  transform: rotate(45deg);
}

.command__role {
  font-size: 9px;
  letter-spacing: 0.14em;
  color: #b49bff;
}

.command__commander b {
  font-weight: 600;
  color: #ffd37a;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.command__squads {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.command__squads li {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 10px;
  color: #8fa3c2;
}

.command__squads li > i {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.25);
}

.command__letter {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: #667c9e;
}

.command__squads b {
  font-weight: 500;
  color: #dbe8fb;
  font-variant-numeric: tabular-nums;
}

.command__squads em {
  padding: 0 3px;
  border: 1px solid rgba(255, 211, 122, 0.4);
  border-radius: 4px;
  font-style: normal;
  font-size: 7.5px;
  line-height: 1.3;
  letter-spacing: 0.1em;
  color: #ffd37a;
}

.command__log {
  margin: 9px 0 0;
  padding-top: 7px;
  border-top: 1px solid rgba(140, 180, 255, 0.1);
  font-size: 9.5px;
  line-height: 1.45;
  color: #8097b8;
}

/* ---------- Combate (panel) ---------- */

.combat {
  margin-top: 16px;
  padding: 13px 14px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 150, 110, 0.16);
  background: rgba(255, 120, 90, 0.045);
}

.combat__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.combat__head .section-kicker {
  margin: 0;
}

.combat__plan {
  font-size: 9px;
  letter-spacing: 0.06em;
  color: #ffb49a;
}

.combat__meter {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 5px;
  font-size: 9.5px;
  color: #a7b8d3;
}

.combat__value {
  color: #e7f3ff;
  font-variant-numeric: tabular-nums;
}

.combat__bar {
  height: 6px;
  margin-bottom: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.combat__bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.35s ease;
}

.combat__bar--health {
  background: linear-gradient(90deg, #ff6b5c, #ffb07a);
}

.combat__bar--energy {
  background: linear-gradient(90deg, #63e6ff, #8fb4ff);
}

.combat__bar--swarm {
  background: linear-gradient(90deg, #8cecff, #b49bff);
}

.combat__bar--bomb {
  background: linear-gradient(90deg, #ffb457, #ff6b4a);
}

.combat__rows {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 2px 0 0;
  font-size: 9.5px;
  color: #a7b8d3;
}

.combat__rows b {
  font-weight: 600;
  color: #e7f3ff;
  font-variant-numeric: tabular-nums;
}

.combat__rows em {
  font-style: normal;
  color: #7f93b1;
}

.combat__hint {
  margin: 8px 0 0;
  font-size: 9.5px;
  line-height: 1.55;
  color: #8fa3c2;
}

/* ---------- FSM ---------- */

.fsm {
  margin-bottom: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(140, 180, 255, 0.1);
}

.fsm__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
}

.fsm__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #9fb2cf;
}

.fsm__item > i {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--state-color);
  box-shadow: 0 0 6px var(--state-color);
}

.fsm__item b {
  margin-left: auto;
  font-weight: 500;
  color: #e4efff;
  font-variant-numeric: tabular-nums;
}

.fsm__hint {
  margin: 8px 0 0;
  font-size: 9.5px;
  line-height: 1.45;
  color: #6f86a8;
}

.panel__close {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.04);
  color: #9db0cd;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.panel__close:hover {
  background: rgba(255, 255, 255, 0.09);
  color: #ffffff;
}

.panel__close svg {
  width: 11px;
  height: 11px;
}

/* ---------- Deslizadores ---------- */

.control {
  display: block;
  margin-bottom: 12px;
}

.control__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}

.control__name {
  font-size: 11.5px;
  letter-spacing: 0.03em;
  color: #a9bbd7;
}

.control__value {
  font-size: 10.5px;
  color: #7ce8ff;
  font-variant-numeric: tabular-nums;
}

.control__input {
  display: block;
  width: 100%;
  height: 16px;
  margin: 0;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.control__input::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.1);
  background-image: linear-gradient(90deg, #7ce8ff, #a78bfa);
  background-repeat: no-repeat;
  background-size: var(--fill) 100%;
}

.control__input--count::-webkit-slider-runnable-track {
  background-image: linear-gradient(90deg, #7ce8ff, #f0a6ff);
}

.control__input::-webkit-slider-thumb {
  width: 13px;
  height: 13px;
  margin-top: -5px;
  border-radius: 50%;
  border: 1px solid rgba(124, 232, 255, 0.9);
  background: #e9fcff;
  box-shadow: 0 0 10px rgba(124, 232, 255, 0.55);
  -webkit-appearance: none;
  appearance: none;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.control__input:hover::-webkit-slider-thumb {
  transform: scale(1.12);
  box-shadow: 0 0 14px rgba(124, 232, 255, 0.8);
}

.control__input::-moz-range-track {
  height: 3px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.1);
}

.control__input::-moz-range-progress {
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #7ce8ff, #a78bfa);
}

.control__input--count::-moz-range-progress {
  background: linear-gradient(90deg, #7ce8ff, #f0a6ff);
}

.control__input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(124, 232, 255, 0.9);
  background: #e9fcff;
  box-shadow: 0 0 10px rgba(124, 232, 255, 0.55);
}

/* ---------- Botones ---------- */

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
}

.btn {
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid rgba(150, 185, 255, 0.16);
  background: rgba(255, 255, 255, 0.045);
  color: #c9d8ef;
  font-size: 11.5px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(150, 185, 255, 0.32);
  color: #ffffff;
}

.btn--primary {
  border-color: transparent;
  background: linear-gradient(135deg, #8cecff, #b49bff);
  color: #071019;
  font-weight: 600;
}

.btn--primary:hover {
  filter: brightness(1.08);
  color: #071019;
}

.panel__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin: 14px 0 0;
  font-size: 10px;
  letter-spacing: 0.03em;
  color: #a7b8d3;
  font-variant-numeric: tabular-nums;
}

.panel__stats span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.panel__dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
}

.panel__dot--impact {
  background: #ff9a76;
  box-shadow: 0 0 7px rgba(255, 140, 100, 0.9);
}

.panel__dot--block {
  background: #79ddff;
  box-shadow: 0 0 7px rgba(110, 215, 255, 0.9);
}

.panel__dot--kill {
  background: #ffffff;
  box-shadow: 0 0 7px rgba(210, 240, 255, 0.9);
}

.panel__dot--shot {
  background: #b49bff;
  box-shadow: 0 0 7px rgba(180, 155, 255, 0.9);
}

/* ---------- Lanzador del panel ---------- */

.panel-launcher {
  position: fixed;
  right: 38px;
  bottom: 36px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid rgba(140, 180, 255, 0.18);
  background: rgba(12, 19, 34, 0.72);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #c6d8f0;
  font-size: 11.5px;
  letter-spacing: 0.02em;
  cursor: pointer;
  animation: fade-in 0.3s ease both;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.panel-launcher:hover {
  background: rgba(20, 30, 50, 0.85);
  border-color: rgba(140, 180, 255, 0.32);
}

.panel-launcher svg {
  width: 13px;
  height: 13px;
}

/* ---------- Error WebGL ---------- */

.webgl-error {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 4;
  width: min(420px, calc(100vw - 40px));
  padding: 22px 24px;
  border-radius: 16px;
  border: 1px solid rgba(255, 170, 140, 0.3);
  background: rgba(22, 12, 16, 0.9);
  box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.9);
  transform: translate(-50%, -50%);
}

.webgl-error p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: #e6c7c0;
}

.webgl-error__title {
  margin-bottom: 8px !important;
  font-size: 14px !important;
  font-weight: 600;
  color: #ffd5c8 !important;
}

/* ---------- Responsive ---------- */

@media (max-width: 820px) {
  .hero {
    top: 26px;
    left: 22px;
    right: 22px;
    max-width: none;
  }

  .hero__eyebrow {
    margin-bottom: 12px;
  }

  .hero__title {
    font-size: clamp(38px, 12vw, 58px);
  }

  .hero__text {
    max-width: 260px;
    margin-top: 12px;
    font-size: 12.5px;
  }

  .rules {
    margin-top: 14px;
    gap: 14px;
  }

  .status {
    top: 22px;
    right: 20px;
    padding: 7px 13px;
    font-size: 10.5px;
  }

  .battle {
    top: auto;
    right: 16px;
    bottom: 128px;
    left: 16px;
    width: auto;
    transform: none;
  }

  .hint {
    left: 16px;
    right: 16px;
    bottom: 16px;
    justify-content: center;
    border-radius: 16px;
    padding: 10px 14px;
  }

  .hint p {
    font-size: 11.5px;
  }

  .panel {
    right: 16px;
    bottom: 76px;
    width: min(320px, calc(100vw - 32px));
    max-height: calc(100dvh - 230px);
    overflow-y: auto;
  }

  .panel-launcher {
    right: 16px;
    bottom: 76px;
  }
}

@media (max-width: 600px) {
  .eyebrow__long {
    display: none;
  }

  .eyebrow__short {
    display: inline;
  }
}

@media (max-width: 460px) {
  .hero__text,
  .rules {
    display: none;
  }
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.86);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes ping {
  0% {
    opacity: 0.9;
    transform: scale(0.5);
  }
  70%,
  100% {
    opacity: 0;
    transform: scale(1.9);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
