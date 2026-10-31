<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

type ServiceName = 'router' | 'html' | 'vite' | 'app'
type State = 'active' | 'pending' | 'disposed'

interface Entry {
  id: string
  name: string
  /** services the plugin injects */
  inject: ServiceName[]
  /** services the plugin provides */
  provides?: ServiceName[]
}

interface Registration {
  id: string
  plugin: string
  service: ServiceName
  call: string
}

// a real cormi.yml, and what each of its plugins registers on ctx
const entries: Entry[] = [
  { id: 'preset', name: '@cormi/preset-react', inject: [], provides: ['router', 'html', 'vite', 'app'] },
  { id: 'layout', name: '@cormi/plugin-layout', inject: ['router', 'app'] },
  { id: 'tailwind', name: '@cormi/plugin-tailwindcss', inject: ['vite', 'app'] },
  { id: 'model', name: '@cormi/plugin-model', inject: ['app'] },
  { id: 'local', name: './plugin.ts', inject: ['html'] },
]

const services: ServiceName[] = ['router', 'html', 'vite', 'app']

const registrations: Registration[] = [
  { id: 'layout-route', plugin: 'layout', service: 'router', call: `layout('plugin-layout/Layout.tsx')` },
  { id: 'local-meta', plugin: 'local', service: 'html', call: `head(<meta name="generator">)` },
  { id: 'preset-react', plugin: 'preset', service: 'vite', call: `plugin(react())` },
  { id: 'tailwind-vite', plugin: 'tailwind', service: 'vite', call: `plugin(tailwindcss())` },
  { id: 'preset-app', plugin: 'preset', service: 'app', call: `entry('src/app.tsx')` },
  { id: 'layout-entry', plugin: 'layout', service: 'app', call: `entry('@cormi/plugin-layout/client')` },
  { id: 'tailwind-css', plugin: 'tailwind', service: 'app', call: `import('tailwindcss')` },
  { id: 'model-entry', plugin: 'model', service: 'app', call: `entry('@cormi/plugin-model/client')` },
]

const enabled = reactive<Record<string, boolean>>(Object.fromEntries(entries.map(entry => [entry.id, true])))

const provided = computed(() => {
  const result = new Set<ServiceName>()
  for (const entry of entries) {
    if (enabled[entry.id]) entry.provides?.forEach(name => result.add(name))
  }
  return result
})

function stateOf(entry: Entry): State {
  if (!enabled[entry.id]) return 'disposed'
  return entry.inject.every(name => provided.value.has(name)) ? 'active' : 'pending'
}

const byId = Object.fromEntries(entries.map(entry => [entry.id, entry]))
const isLive = (registration: Registration) => stateOf(byId[registration.plugin]) === 'active'
const short = (name: string) => name.replace('@cormi/', '')

const log = ref('点击 cormi.yml 中的条目，停用或启用一个插件。')

function toggle(entry: Entry) {
  const before = new Set(entries.filter(item => stateOf(item) === 'active').map(item => item.id))
  const count = (ids: Set<string>) => registrations.filter(item => ids.has(item.plugin)).length
  enabled[entry.id] = !enabled[entry.id]
  const after = new Set(entries.filter(item => stateOf(item) === 'active').map(item => item.id))
  const lost = new Set([...before].filter(id => !after.has(id)))
  const gained = new Set([...after].filter(id => !before.has(id)))
  const others = (ids: Set<string>) => [...ids].filter(id => id !== entry.id).length
  if (!enabled[entry.id]) {
    log.value = `卸载 ${entry.name}：撤回 ${count(lost)} 项注册`
      + (others(lost) ? `，${others(lost)} 个依赖它的插件转入 pending` : '')
  } else {
    log.value = `加载 ${entry.name}：注册 ${count(gained)} 项`
      + (others(gained) ? `，${others(gained)} 个插件恢复 active` : '')
  }
}

// the cords: from the jack of an entry to the jack of each registration
const root = ref<HTMLElement>()
const entryJacks: Record<string, HTMLElement> = {}
const itemJacks: Record<string, HTMLElement> = {}
const cords = ref<{ id: string; plugin: string; d: string; index: number }[]>([])
const hovered = ref<string>()
// the cords are drawn in once on load, one after another
const intro = ref(true)
const drawing = ref(false)

function measure() {
  if (!root.value) return
  const box = root.value.getBoundingClientRect()
  const center = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top }
  }
  cords.value = registrations.flatMap((registration, index) => {
    const from = entryJacks[registration.plugin]
    const to = itemJacks[registration.id]
    if (!from || !to || !to.offsetParent) return []
    const a = center(from)
    const b = center(to)
    const bend = Math.max(40, (b.x - a.x) * 0.5)
    return [{
      id: registration.id,
      plugin: registration.plugin,
      index,
      d: `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`,
    }]
  })
}

let observer: ResizeObserver | undefined
onMounted(async () => {
  await nextTick()
  measure()
  observer = new ResizeObserver(() => measure())
  observer.observe(root.value!)
  document.fonts?.ready.then(() => measure())
  requestAnimationFrame(() => requestAnimationFrame(() => {
    intro.value = false
    drawing.value = true
    setTimeout(() => drawing.value = false, 1600)
  }))
})
onBeforeUnmount(() => observer?.disconnect())
watch(enabled, () => nextTick(measure))

const cordLive = (cord: { plugin: string }) => stateOf(byId[cord.plugin]) === 'active'
</script>

<template>
  <figure class="cm-diagram" :class="{ 'is-intro': intro, 'is-drawing': drawing }">
    <div ref="root" class="cm-board">
      <svg class="cm-cords" aria-hidden="true">
        <path
          v-for="cord in cords"
          :key="cord.id"
          class="cm-cord"
          :class="{
            'is-off': !cordLive(cord),
            'is-hot': hovered === cord.plugin,
            'is-dim': hovered && hovered !== cord.plugin && stateOf(byId[hovered]) === 'active',
          }"
          :style="{ '--i': cord.index }"
          :d="cord.d"
          pathLength="1"
        />
      </svg>

      <div class="cm-column cm-file">
        <div class="cm-label"><span class="cm-tab">cormi.yml</span></div>
        <ul class="cm-entries">
          <li v-for="entry in entries" :key="entry.id">
            <button
              type="button"
              role="switch"
              class="cm-entry"
              :aria-checked="enabled[entry.id]"
              :aria-label="`${enabled[entry.id] ? '停用' : '启用'} ${entry.name}`"
              :data-state="stateOf(entry)"
              @click="toggle(entry)"
              @mouseenter="hovered = entry.id"
              @mouseleave="hovered = undefined"
              @focus="hovered = entry.id"
              @blur="hovered = undefined"
            >
              <span class="cm-lamp" />
              <span class="cm-yaml">
                <span class="cm-line"><span class="y-dash">- </span><span class="y-key">name:</span> <span class="y-str">'{{ entry.name }}'</span></span>
                <span v-if="!enabled[entry.id]" class="cm-line cm-added"><span class="y-dash">{{ '  ' }}</span><span class="y-key">disabled:</span> <span class="y-bool">true</span></span>
              </span>
              <span class="cm-state">{{ stateOf(entry) }}</span>
              <span :ref="el => { if (el) entryJacks[entry.id] = el as HTMLElement }" class="cm-jack" />
            </button>
          </li>
        </ul>
      </div>

      <div class="cm-column cm-ctx">
        <div class="cm-label"><span class="cm-tab cm-tab-plain">ctx 上的注册</span></div>
        <div
          v-for="service in services"
          :key="service"
          class="cm-service"
          :class="{ 'is-gone': !provided.has(service) }"
        >
          <div class="cm-service-name">ctx.{{ service }}</div>
          <ul>
            <li
              v-for="registration in registrations.filter(item => item.service === service)"
              :key="registration.id"
              class="cm-item"
              :class="{ 'is-off': !isLive(registration), 'is-hot': hovered === registration.plugin }"
            >
              <span :ref="el => { if (el) itemJacks[registration.id] = el as HTMLElement }" class="cm-jack" />
              <code>.{{ registration.call }}</code>
              <span class="cm-owner">{{ short(byId[registration.plugin].name) }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <p class="cm-log" aria-live="polite"><span class="cm-log-mark">›</span> {{ log }}</p>
  </figure>
</template>

<style scoped>
.cm-diagram {
  margin: 0;
  border: 1px solid var(--c-rule);
  border-radius: 16px;
  background: var(--c-panel);
  box-shadow: 0 1px 0 var(--c-rule), 0 24px 48px -32px rgba(20, 33, 28, 0.35);
  overflow: hidden;
}

.cm-board {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
  column-gap: clamp(72px, 12vw, 168px);
  padding: 22px 26px 26px;
}

.cm-cords {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.cm-cord {
  fill: none;
  stroke: var(--c-cord);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 0.55s cubic-bezier(0.6, 0, 0.2, 1), opacity 0.2s, stroke-width 0.2s, stroke 0.2s;
}

/* a disposed plugin pulls its cords back in */
.cm-cord.is-off {
  stroke-dashoffset: 1;
}

.cm-cord.is-hot {
  stroke-width: 2.4;
}

.cm-cord.is-dim {
  opacity: 0.28;
}

.is-intro .cm-cord {
  stroke-dashoffset: 1;
}

.is-drawing .cm-cord {
  transition-duration: 0.9s;
  transition-delay: calc(var(--i) * 70ms + 150ms);
}

.cm-column {
  display: flex;
  flex-direction: column;
}

.cm-label {
  margin-bottom: 14px;
}


.cm-tab {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--c-ink-2);
  font-size: 12px;
  font-variation-settings: 'MONO' 1, 'CASL' 0;
  letter-spacing: 0.02em;
}

.cm-tab-plain {
  font-family: var(--font-sans);
  font-variation-settings: 'MONO' 0, 'CASL' 0;
}

.cm-entries,
.cm-service ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* the entries face the middle of what they registered, so cords fan both ways */
.cm-file .cm-entries {
  margin: auto 0;
}

.cm-entry {
  position: relative;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 12px;
  width: 100%;
  margin: 2px 0;
  padding: 9px 12px;
  border-radius: 9px;
  text-align: left;
  font-family: var(--font-mono);
  font-variation-settings: 'MONO' 1, 'CASL' 0;
  font-size: 13.5px;
  line-height: 22px;
  color: var(--c-ink);
  cursor: pointer;
  transition: background 0.15s;
}

.cm-entry:hover {
  background: var(--vp-c-bg-soft);
}

.cm-entry:focus-visible {
  outline: 2px solid var(--c-cord);
  outline-offset: 1px;
}

.cm-lamp {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--c-leaf);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-leaf) 18%, transparent);
  transition: background 0.2s, box-shadow 0.2s;
}

[data-state='pending'] .cm-lamp {
  background: var(--c-amber);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-amber) 22%, transparent);
  animation: cm-wait 1.2s ease-in-out infinite;
}

[data-state='disposed'] .cm-lamp {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--c-ink-3);
}

@keyframes cm-wait {
  50% {
    opacity: 0.35;
  }
}

.cm-yaml {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cm-line {
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.y-dash,
.y-key {
  color: var(--c-ink-3);
}

.y-str {
  color: var(--c-ink);
}

.y-bool {
  color: var(--c-cord-text);
}

[data-state='disposed'] .y-str {
  color: var(--c-ink-3);
}

.cm-added {
  animation: cm-type 0.25s ease-out;
}

@keyframes cm-type {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

.cm-state {
  font-size: 11.5px;
  color: var(--c-leaf);
}

[data-state='pending'] .cm-state {
  color: var(--c-amber);
}

[data-state='disposed'] .cm-state {
  color: var(--c-ink-3);
}

.cm-jack {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c-panel);
  box-shadow: inset 0 0 0 1.5px var(--c-ink-3);
}

.cm-entry .cm-jack {
  position: absolute;
  top: 18px;
  right: -14px;
}

[data-state='active'] .cm-jack {
  background: var(--c-cord);
  box-shadow: none;
}

.cm-service + .cm-service {
  margin-top: 12px;
}

.cm-service-name {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 650;
  color: var(--c-ink-2);
  font-variation-settings: 'MONO' 1, 'CASL' 0;
}

.cm-service.is-gone .cm-service-name {
  color: var(--c-ink-3);
  text-decoration: line-through;
}

.cm-item {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 3px 0 3px 2px;
  font-size: 13px;
  line-height: 20px;
  transition: opacity 0.3s;
}

.cm-item .cm-jack {
  position: absolute;
  top: 9.5px;
  left: -16px;
  background: var(--c-cord);
  box-shadow: none;
}

.cm-item code {
  color: var(--c-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s;
}

.cm-item.is-hot code {
  color: var(--c-cord-text);
}

.cm-item.is-off {
  opacity: 0.38;
}

.cm-item.is-off code {
  text-decoration: line-through;
  text-decoration-color: var(--c-ink-3);
}

.cm-item.is-off .cm-jack {
  background: var(--c-panel);
  box-shadow: inset 0 0 0 1.5px var(--c-ink-3);
}

.cm-owner {
  display: none;
  font-size: 11px;
  color: var(--c-ink-3);
  white-space: nowrap;
}

.cm-log {
  margin: 0;
  padding: 11px 26px;
  border-top: 1px solid var(--c-rule);
  background: var(--vp-c-bg-alt);
  color: var(--c-ink-2);
  font-size: 13px;
}

.cm-log-mark {
  color: var(--c-cord);
  font-weight: 700;
}

@media (max-width: 760px) {
  .cm-board {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 22px;
    padding: 18px 14px 20px;
  }

  .cm-cords,
  .cm-jack {
    display: none;
  }

  .cm-item {
    flex-wrap: wrap;
    column-gap: 8px;
    row-gap: 0;
  }

  .cm-owner {
    display: inline;
  }

  /* the lamp tells the state */
  .cm-entry {
    grid-template-columns: 10px minmax(0, 1fr);
    padding: 8px 6px;
    font-size: 12.5px;
  }

  .cm-state {
    display: none;
  }

  .cm-log {
    padding: 11px 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cm-cord,
  .cm-item,
  .cm-lamp {
    transition: none;
  }

  [data-state='pending'] .cm-lamp,
  .cm-added {
    animation: none;
  }
}
</style>
