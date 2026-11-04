// The users of the app: a database in a real one. The password of both is `cormi`.

declare module '@cormijs/plugin-auth' {
  interface User {
    name: string
    role: 'admin' | 'member'
  }
}

export const users = [
  { name: 'alice', role: 'admin', password: 'scrypt$16384$8$1$4fqKbL2mK1q32izge8lAJg$6XpNx0nie7ggQWlLNQNgOFsGsHSoI6Pcr9A3rffKhP6_lzDk3WkM_vVCSjfhD7DnIVSZrbkygVBMUN1k6iLqog' },
  { name: 'bob', role: 'member', password: 'scrypt$16384$8$1$o7GG0N7Pn_6wclzAambuWQ$GPKl4VEt9QXR3Xx6uxQpYhNJmKQOarf4dwU5NBEo3d5rGlz4HA9u3BhiP9uv6SvUvexTrq6VvsJSzpBHYGWF6g' },
] as const
