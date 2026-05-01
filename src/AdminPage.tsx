import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { createEvent, listEvents, revokeEvent, reopenEvent, deleteEvent, type EventRecord } from './api'
import { useLocale } from './i18n'

const ADMIN_KEY_STORAGE = 'eps_admin_key'
const BASE_PATH = import.meta.env.BASE_URL  // '/event-picture-share/'

function buildUploadUrl(token: string): string {
  const origin = globalThis.location.origin
  return `${origin}${BASE_PATH}?token=${token}`
}

// ── EventCard ─────────────────────────────────────────────────

interface EventCardProps {
  event: EventRecord
  onRevoke: (token: string) => void
  onReopen: (token: string) => void
  onDelete: (token: string, deleteFolder: boolean) => void
}

function EventCard({ event, onRevoke, onReopen, onDelete }: EventCardProps) {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrVisible, setQrVisible] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
  const expiresDate = event.expiresAt
    ? new Date(event.expiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : ''
  const isExpired = !!event.expiresAt && new Date(event.expiresAt) < new Date()
  const isClosed = event.revoked || isExpired

  return (
    <div className={`event-card${isClosed ? ' event-card--closed' : ''}`}>
      <h3>{event.name}</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {createdDate && <span className="event-card-meta">{t.card_created(createdDate)}</span>}
        {event.revoked
          ? <span className="event-card-badge event-card-badge--revoked">{t.card_revoked}</span>
          : isExpired
            ? <span className="event-card-badge event-card-badge--expired">{t.card_expired}</span>
            : expiresDate
              ? <span className="event-card-meta">{t.card_expires(expiresDate)}</span>
              : null
        }
      </div>
      <div className="event-card-actions">
        {!isClosed && (
          <button className="btn btn-secondary" onClick={qrVisible ? () => setQrVisible(false) : showQr}>
            {qrVisible ? t.card_hide_qr : t.card_show_qr}
          </button>
        )}
        <button className="btn btn-secondary" onClick={downloadQr}>
          {t.card_download_qr}
        </button>
        {event.folderUrl && (
          <a className="btn btn-secondary" href={event.folderUrl} target="_blank" rel="noreferrer">
            {t.card_drive}
          </a>
        )}
        {!isClosed && (
          <button
            className="btn btn-danger"
            disabled={revoking}
            onClick={async () => {
              if (!confirm(t.card_revoke_confirm)) return
              setRevoking(true)
              onRevoke(event.token)
            }}
          >
            {t.card_revoke_btn}
          </button>
        )}
        {isClosed && (
          <button
            className="btn btn-secondary"
            disabled={reopening}
            onClick={async () => {
              if (!confirm(t.card_reopen_confirm)) return
              setReopening(true)
              onReopen(event.token)
            }}
          >
            {t.card_reopen_btn}
          </button>
        )}
        <button
          className="btn btn-danger"
          disabled={deleting}
          onClick={async () => {
            if (!confirm(t.card_delete_confirm)) return
            const withFolder = confirm(t.card_delete_folder_confirm)
            setDeleting(true)
            onDelete(event.token, withFolder)
          }}
        >
          {t.card_delete_btn}
        </button>
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
  const { t } = useLocale()
  const [adminKey, setAdminKey] = useState<string>(() => localStorage.getItem(ADMIN_KEY_STORAGE) ?? '')
  const [keyInput, setKeyInput] = useState('')
  const [authenticated, setAuthenticated] = useState(() => !!localStorage.getItem(ADMIN_KEY_STORAGE))

  const [events, setEvents] = useState<EventRecord[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [expiryDays, setExpiryDays] = useState(14)
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
          setEventsError(data.error ?? t.admin_err_load)
          if (data.error === 'Invalid adminKey') handleLogout()
        }
      })
      .catch(() => setEventsError(t.admin_err_network))
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
      const data = await createEvent(adminKey, name, expiryDays)
      if (data.ok) {
        setNewName('')
        setExpiryDays(14)
        const newEvent: EventRecord = {
          name,
          token: data.token,
          folderId: data.folderId,
          folderUrl: data.folderUrl,
          createdAt: new Date().toISOString(),
          expiresAt: data.expiresAt,
          revoked: false,
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

  const handleRevoke = async (token: string) => {
    try {
      await revokeEvent(adminKey, token)
      setEvents(prev => prev.map(ev => ev.token === token ? { ...ev, revoked: true } : ev))
    } catch {
      // Silently fail — the card will still show as active until next reload
    }
  }

  const handleReopen = async (token: string) => {
    try {
      const res = await reopenEvent(adminKey, token)
      if (res.ok) {
        setEvents(prev => prev.map(ev =>
          ev.token === token ? { ...ev, revoked: false, expiresAt: res.expiresAt } : ev
        ))
      }
    } catch {
      // Silently fail
    }
  }

  const handleDelete = async (token: string, deleteFolder: boolean) => {
    try {
      await deleteEvent(adminKey, token, deleteFolder)
      setEvents(prev => prev.filter(ev => ev.token !== token))
    } catch {
      // Silently fail
    }
  }

  // ── Auth gate ───────────────────────────────────────────────
  if (!authenticated) {
    return (
      <main className="page">
        <div className="page-header">
          <h1>🔑 {t.admin_title}</h1>
          <p>{t.admin_subtitle}</p>
        </div>
        <div className="card">
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="admin-key">{t.admin_key_label}</label>
              <input
                id="admin-key"
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={t.admin_key_placeholder}
                autoComplete="current-password"
              />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={!keyInput.trim()}>
              {t.admin_signin}
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
        <h1>🗂 {t.admin_events_title}</h1>
        <p>
          {t.admin_events_subtitle} &nbsp;·&nbsp;{' '}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
            onClick={handleLogout}
          >
            {t.admin_signout}
          </button>
        </p>
      </div>

      {/* Create event form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 500 }}>{t.admin_new_event}</h2>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label htmlFor="event-name">{t.admin_event_name_label}</label>
            <input
              id="event-name"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t.admin_event_name_placeholder}
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label htmlFor="expiry-days">{t.admin_expiry_label}</label>
            <input
              id="expiry-days"
              type="number"
              min={1}
              max={365}
              value={expiryDays}
              onChange={e => setExpiryDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 14)))}
            />
          </div>
          {createError && <div className="alert alert-error">{createError}</div>}
          <button className="btn btn-primary btn-full" type="submit" disabled={creating || !newName.trim()}>
            {creating ? t.admin_creating : t.admin_create_btn}
          </button>
        </form>
      </div>

      <hr className="divider" />

      {/* Events list */}
      {loadingEvents && <div className="spinner" />}
      {eventsError && <div className="alert alert-error">{eventsError}</div>}
      {!loadingEvents && !eventsError && events.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t.admin_no_events}</p>
      )}
      {events.length > 0 && (
        <div className="events-list">
          {events.map(ev => (
            <EventCard key={ev.token} event={ev} onRevoke={handleRevoke} onReopen={handleReopen} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </main>
  )
}
