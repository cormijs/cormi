# @cormijs/ai

The AI service of a Cormi app (`ctx.ai`): chat completions, streaming responses, tool calling, and automatic exposure of `server/api` routes as MCP tools.

```yaml
- name: '@cormijs/ai'
  config:
    provider: openai # or anthropic
    model: gpt-4o-mini
    mcp: /mcp
```

这是 [Cormi](https://github.com/cormijs/cormi) 的一部分：以 Cordis 为插件宿主的全栈框架。文档见 [AI Native 与 `@cormijs/ai`](https://cormi.js.org/guide/ai)。
