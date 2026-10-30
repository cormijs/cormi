export default function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">About</h1>
      <p className="leading-relaxed text-gray-600">
        Tailwind scans <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">src/</code> for class names.
        To customize the theme, write your own stylesheet with <code>@import "tailwindcss"</code> and pass it
        as the <code>css</code> option of the plugin in <code>cormi.yml</code>.
      </p>
    </div>
  )
}
