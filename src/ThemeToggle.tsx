import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('eps_theme') as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('eps_theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'light' ? 'dark' : 'light'))

  return { theme, toggle }
}

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <div className="top-bar">
      <button
        className="theme-toggle"
        onClick={toggle}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
    </div>
  )
}
