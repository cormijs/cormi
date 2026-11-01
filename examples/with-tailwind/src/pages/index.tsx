import { useState } from 'react'

const colors = [
  'bg-sky-50 border-sky-200 text-sky-700',
  'bg-emerald-50 border-emerald-200 text-emerald-700',
  'bg-violet-50 border-violet-200 text-violet-700',
]

export default function HomePage() {
  const [count, setCount] = useState(0)
  return (
    <div className="space-y-6">
      <h1 id="title" className="text-3xl font-bold text-gray-900">Cormi + Tailwind CSS</h1>
      <p className="text-gray-600">
        Utility classes from <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">@cormijs/plugin-tailwindcss</code>,
        a two-line node plugin: a Vite plugin and a stylesheet imported before the app starts.
      </p>
      <button
        className="rounded-lg bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700"
        onClick={() => setCount(count => count + 1)}
      >
        clicked {count}
      </button>
      <div className="grid grid-cols-3 gap-4">
        {colors.map(color => (
          <div key={color} className={`rounded-xl border p-4 text-center text-sm font-medium ${color}`}>
            {color.split('-')[1]}
          </div>
        ))}
      </div>
    </div>
  )
}
