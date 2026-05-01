import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AdminPage from './AdminPage'
import ThemeToggle from './ThemeToggle'
import InstallPrompt from './InstallPrompt'
import { LocaleProvider, LocaleToggle } from './i18n'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <LocaleProvider>
      <div className="top-bar">
        <InstallPrompt />
        <LocaleToggle />
        <ThemeToggle />
      </div>
      <AdminPage />
    </LocaleProvider>
  </StrictMode>,
)
