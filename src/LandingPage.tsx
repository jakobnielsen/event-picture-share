export default function LandingPage() {
  return (
    <main className="page" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <span className="landing-icon" aria-hidden="true">📷</span>
      <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 12px' }}>Event Photo Share</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.6 }}>
        Scan the QR code at your event to upload photos directly to the organizer's Google Drive.
      </p>
    </main>
  )
}
