<script setup lang="ts">
const node = [
  ['ctx.cormi', 'cwd、mode、paths'],
  ['ctx.router', 'route() · layout() · patch()'],
  ['ctx.html', 'head() · body() · transform()'],
  ['ctx.app', 'entry() · import() · file() · server()'],
  ['ctx.vite', 'plugin() · configure() · input()'],
  ['ctx.server', 'get() · use() · ws()'],
  ['ctx.cli', 'command() · generator()'],
]

const browser = [
  ['ctx.$app', 'wrap() · props · app/mount'],
  ['ctx.$router', 'add() · navigate() · preload()'],
  ['ctx.$federation', 'load() · import()'],
]
</script>

<template>
  <section class="sides">
    <header class="head">
      <h2>两端都是 Cordis Context</h2>
      <p>
        Node 端的插件构建应用，浏览器端的插件运行应用。两边是同一种写法，中间只有一座桥：Node 插件按包名注册浏览器插件，配置序列化后传过去。
      </p>
    </header>
    <div class="board">
      <div class="side">
        <div class="side-label">Node · <code>cormi</code></div>
        <dl>
          <template v-for="[name, methods] in node" :key="name">
            <dt>{{ name }}</dt>
            <dd>{{ methods }}</dd>
          </template>
        </dl>
      </div>
      <div class="bridge">
        <span class="bridge-line" />
        <code class="bridge-call">ctx.app.entry(<br>'@scope/plugin-foo/client',<br>config)</code>
        <span class="bridge-line" />
      </div>
      <div class="side">
        <div class="side-label">浏览器 · <code>cormi/client</code></div>
        <dl>
          <template v-for="[name, methods] in browser" :key="name">
            <dt>{{ name }}</dt>
            <dd>{{ methods }}</dd>
          </template>
        </dl>
        <p class="side-note">
          核心服务在根上提供，名字带 <code>$</code>，与 Node 端的 <code>ctx.app</code>、<code>ctx.router</code> 互不冲突——koishi 的客户端也是这样做的。
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sides {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}

.head {
  max-width: 680px;
  margin-bottom: 32px;
}

.head h2 {
  margin: 0;
  font-size: 30px;
  font-weight: 750;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.head p {
  margin: 12px 0 0;
  color: var(--c-ink-2);
  font-size: 16px;
  line-height: 1.8;
}

.board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px minmax(0, 1fr);
  align-items: start;
}

.side {
  padding: 22px 24px;
  border: 1px solid var(--c-rule);
  border-radius: 14px;
  background: var(--c-panel);
}

.side-label {
  margin-bottom: 14px;
  color: var(--c-ink-2);
  font-size: 13px;
}

.side-label code {
  color: var(--c-ink);
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 18px;
  row-gap: 8px;
  margin: 0;
}

dt {
  font-family: var(--font-mono);
  font-variation-settings: 'MONO' 1, 'CASL' 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--c-ink);
}

dd {
  margin: 0;
  font-family: var(--font-mono);
  font-variation-settings: 'MONO' 1, 'CASL' 0;
  font-size: 13px;
  color: var(--c-ink-2);
}

.side-note {
  margin: 18px 0 0;
  padding-top: 14px;
  border-top: 1px dashed var(--c-rule);
  color: var(--c-ink-3);
  font-size: 13px;
  line-height: 1.7;
}

.side-note code {
  color: var(--c-ink-2);
}

.bridge {
  display: flex;
  align-items: center;
  align-self: center;
}

/* the cord runs from the Node side into the browser side */
.bridge-line {
  flex: 1;
  min-width: 16px;
  height: 1.6px;
  background: var(--c-cord);
}

.bridge-call {
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--c-cord) 40%, transparent);
  border-radius: 8px;
  background: var(--c-cord-soft);
  color: var(--c-cord-text);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

@media (max-width: 860px) {
  .board {
    grid-template-columns: minmax(0, 1fr);
  }

  .bridge {
    flex-direction: column;
  }

  .bridge-line {
    flex: none;
    width: 1.6px;
    height: 20px;
  }
}
</style>
