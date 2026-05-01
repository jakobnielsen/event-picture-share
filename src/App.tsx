import { useMemo } from 'react'
import UploadPage from './UploadPage'
import LandingPage from './LandingPage'
import ThemeToggle from './ThemeToggle'
import InstallPrompt from './InstallPrompt'
import { LocaleProvider, LocaleToggle } from './i18n'

export default function App() {
  const { page, token } = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (t) return { page: 'upload' as const, token: t }
    return { page: 'landing' as const, token: null }
  }, [])

  return (
    <LocaleProvider>
      <div className="top-bar">
        <InstallPrompt />
        <LocaleToggle />
        <ThemeToggle />
      </div>
      {page === 'upload' && token ? <UploadPage token={token} /> : <LandingPage />}
    </LocaleProvider>
  )
}
