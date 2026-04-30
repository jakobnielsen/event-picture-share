import { useState } from 'react'
import { useLocale } from './i18n'
import QrScanner from './QrScanner'

export default function LandingPage() {
  const { t } = useLocale()
  const [scanning, setScanning] = useState(false)

  function handleDetect(token: string) {
    window.location.search = `?token=${encodeURIComponent(token)}`
  }

  return (
    <main className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <span className="landing-icon" aria-hidden="true">📷</span>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 12px' }}>{t.landing_title}</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.6 }}>
        {t.landing_desc}
      </p>
      <button
        className="btn btn-primary"
        style={{ marginTop: 24 }}
        onClick={() => setScanning(true)}
      >
        {t.scan_btn}
      </button>

      {scanning && (
        <QrScanner onDetect={handleDetect} onClose={() => setScanning(false)} />
      )}
    </main>
  )
}
