import { defineMock } from '@cormijs/plugin-mock'

const users = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: `User ${index + 1}` }))

export default defineMock({
  // the body wraps the payload in `data`, which `dataField: data` unwraps in useRequest()
  'GET /api/users': (request) => {
    const page = Number(new URL(request.url).searchParams.get('page') ?? 1)
    return { success: true, data: { list: users.slice((page - 1) * 5, page * 5), total: users.length } }
  },
  'GET /api/headers': request => ({
    data: { app: request.headers.get('x-app'), authorization: request.headers.get('authorization') },
  }),
  'GET /api/broken': () => Response.json({ success: false, message: 'the server is on fire' }, { status: 500 }),
})
