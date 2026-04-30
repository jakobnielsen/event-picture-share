import { useMemo } from 'react'
import UploadPage from './UploadPage'
import AdminPage from './AdminPage'
import LandingPage from './LandingPage'
import ThemeToggle from './ThemeToggle'
import { LocaleProvider, LocaleToggle } from './i18n'

export default function App() {
  const { page, token } = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (t) return { page: 'upload' as const, token: t }
    if (window.location.hash === '#admin') return { page: 'admin' as const, token: null }
    return { page: 'landing' as const, token: null }
  }, [])

  return (
    <LocaleProvider>
      <div className="top-bar">
        <LocaleToggle />
        <ThemeToggle />
      </div>
      {page === 'upload' && token ? <UploadPage token={token} /> :
       page === 'admin' ? <AdminPage /> :
       <LandingPage />}
    </LocaleProvider>
  )
}
