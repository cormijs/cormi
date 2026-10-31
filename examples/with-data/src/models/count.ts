const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** A dva model: the namespace is the file name. */
export default {
  state: 0,
  reducers: {
    add(state: number) {
      return state + 1
    },
  },
  effects: {
    *addLater(_: unknown, { call, put }: any) {
      yield call(delay, 300)
      yield put({ type: 'add' })
    },
  },
}
