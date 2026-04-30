import { useLocale } from './i18n'

export default function LandingPage() {
  const { t } = useLocale()
  return (
    <main className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <span className="landing-icon" aria-hidden="true">📷</span>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 12px' }}>{t.landing_title}</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.6 }}>
        {t.landing_desc}
      </p>
    </main>
  )
}
