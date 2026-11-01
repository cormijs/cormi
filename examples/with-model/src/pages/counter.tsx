import { useModel } from '@cormijs/plugin-model/client'

export default function CounterPage() {
  const { count, increment, decrement, reset } = useModel('counter')
  return (
    <div>
      <h2>Counter</h2>
      <p>The count survives navigation: it lives in the model, not in this page.</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={decrement}>−</button>
        <strong id="count" style={{ fontSize: 28, minWidth: 40, textAlign: 'center' }}>{count}</strong>
        <button onClick={increment}>+</button>
        <button onClick={reset}>reset</button>
      </div>
    </div>
  )
}
