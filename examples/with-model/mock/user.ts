import { defineMock } from '@cormijs/plugin-mock'

export default defineMock({
  'GET /api/me': { name: 'Cormi', role: 'admin' },
  'POST /api/todos/:id/toggle': (request, { params }) => ({ id: Number(params.id), toggled: true }),
})
