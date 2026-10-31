import { defineMock } from '@cormi/plugin-mock'

export default defineMock({
  'GET /api/todos': [
    { id: 1, text: 'fetch with react-query' },
    { id: 2, text: 'count with dva' },
  ],
})
