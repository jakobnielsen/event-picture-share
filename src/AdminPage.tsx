import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { createEvent, listEvents, type EventRecord } from './api'

const ADMIN_KEY_STORAGE = 'eps_admin_key'
const BASE_PATH = import.meta.env.BASE_URL  // '/event-picture-share/'

function buildUploadUrl(token: string): string {
  const origin = globalThis.location.origin
  return `${origin}${BASE_PATH}?token=${token}`
}

// ── EventCard ─────────────────────────────────────────────────

interface EventCardProps {
  event: EventRecord
}

function EventCard({ event }: EventCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrVisible, setQrVisible] = useState(false)
  const url = buildUploadUrl(event.token)

  const showQr = async () => {
    setQrVisible(true)
    // Wait for canvas to mount
    setTimeout(async () => {
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, url, {
          width: 220,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#202124', light: '#ffffff' },
        })
      }
    }, 0)
  }

  const downloadQr = async () => {
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, url, {
      width: 512,
      margin: 3,
      errorCorrectionLevel: 'M',
      color: { dark: '#202124', light: '#ffffff' },
    })
    const a = document.createElement('a')
    a.download = `qr-${event.name.replaceAll(' ', '-').toLowerCase()}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  const createdDate = event.createdAt
    ? new Date(event.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : ''

  return (
    <div className="event-card">
      <h3>{event.name}</h3>
      {createdDate && <p className="event-card-meta">Created {createdDate}</p>}
      <div className="event-card-actions">
        <button className="btn btn-secondary" onClick={qrVisible ? () => setQrVisible(false) : showQr}>
          {qrVisible ? 'Hide QR' : '🔲 Show QR'}
        </button>
        <button className="btn btn-secondary" onClick={downloadQr}>
          ⬇ Download QR
        </button>
        {event.folderUrl && (
          <a className="btn btn-secondary" href={event.folderUrl} target="_blank" rel="noreferrer">
            📁 Drive folder
          </a>
        )}
      </div>
      {qrVisible && (
        <div className="qr-wrap">
          <canvas ref={canvasRef} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', margin: 0 }}>{url}</p>
        </div>
      )}
    </div>
  )
}

// ── AdminPage ─────────────────────────────────────────────────

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string>(() => localStorage.getItem(ADMIN_KEY_STORAGE) ?? '')
  const [keyInput, setKeyInput] = useState('')
  const [authenticated, setAuthenticated] = useState(() => !!localStorage.getItem(ADMIN_KEY_STORAGE))

  const [events, setEvents] = useState<EventRecord[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_KEY_STORAGE)
    setAdminKey('')
    setAuthenticated(false)
    setEvents([])
    setKeyInput('')
  }

  // Load events once authenticated
  useEffect(() => {
    if (!authenticated || !adminKey) return
    setLoadingEvents(true)
    setEventsError(null)
    listEvents(adminKey)
      .then(data => {
        if (data.ok) {
          setEvents((data.events ?? []).slice().reverse()) // newest first
        } else {
          setEventsError(data.error ?? 'Failed to load events')
          if (data.error === 'Invalid adminKey') handleLogout()
        }
      })
      .catch(() => setEventsError('Network error'))
      .finally(() => setLoadingEvents(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, adminKey])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyInput.trim()) return
    const key = keyInput.trim()
    localStorage.setItem(ADMIN_KEY_STORAGE, key)
    setAdminKey(key)
    setAuthenticated(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setCreateError(null)
    try {
      const data = await createEvent(adminKey, name)
      if (data.ok) {
        setNewName('')
        const newEvent: EventRecord = {
          name,
          token: data.token,
          folderId: data.folderId,
          folderUrl: data.folderUrl,
          createdAt: new Date().toISOString(),
        }
        setEvents(prev => [newEvent, ...prev])
      } else {
        setCreateError(data.error ?? 'Failed to create event')
      }
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }

  // ── Auth gate ───────────────────────────────────────────────
  if (!authenticated) {
    return (
      <main className="page">
        <div className="page-header">
          <h1>🔑 Admin</h1>
          <p>Enter your admin key to manage events</p>
        </div>
        <div className="card">
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="admin-key">Admin key</label>
              <input
                id="admin-key"
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="Paste your admin key"
                autoComplete="current-password"
              />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={!keyInput.trim()}>
              Sign in
            </button>
          </form>
        </div>
      </main>
    )
  }

  // ── Admin dashboard ─────────────────────────────────────────
  return (
    <main className="page">
      <div className="page-header">
        <h1>🗂 Events</h1>
        <p>
          Manage photo events &nbsp;·&nbsp;{' '}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
            onClick={handleLogout}
          >
            Sign out
          </button>
        </p>
      </div>

      {/* Create event form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 500 }}>New event</h2>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label htmlFor="event-name">Event name</label>
            <input
              id="event-name"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Summer Wedding 2026"
              maxLength={100}
            />
          </div>
          {createError && <div className="alert alert-error">{createError}</div>}
          <button className="btn btn-primary btn-full" type="submit" disabled={creating || !newName.trim()}>
            {creating ? 'Creating…' : 'Create event & generate QR'}
          </button>
        </form>
      </div>

      <hr className="divider" />

      {/* Events list */}
      {loadingEvents && <div className="spinner" />}
      {eventsError && <div className="alert alert-error">{eventsError}</div>}
      {!loadingEvents && !eventsError && events.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No events yet. Create one above.</p>
      )}
      {events.length > 0 && (
        <div className="events-list">
          {events.map(ev => (
            <EventCard key={ev.token} event={ev} />
          ))}
        </div>
      )}
    </main>
  )
}
