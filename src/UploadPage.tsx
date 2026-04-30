import { useState, useEffect, useRef, useCallback } from 'react'
import { getEvent, createUploadSession } from './api'
import { useLocale } from './i18n'

const UPLOAD_CONCURRENCY = 5               // max parallel uploads
const UPLOAD_MAX_RETRIES = 3               // auto-retry attempts on network failure

const STATUS = {
  WAITING: 'waiting',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
} as const

type FileStatus = (typeof STATUS)[keyof typeof STATUS]

interface FileEntry {
  name: string
  size: number
  raw: File
  status: FileStatus
  progress: number
  message: string
  uploadUrl?: string   // Drive resumable session URL, persisted for retry
  retryable?: boolean  // show manual retry button after auto-retries exhausted
}

interface UploadPageProps {
  token: string
}

// ── Resumable upload helpers ───────────────────────────────────────────

/** Asks Drive how many bytes it has received for a stalled session.
 *  Returns the byte offset to resume from, or null if unrecoverable. */
async function queryResumeOffset(uploadUrl: string, fileSize: number): Promise<number | null> {
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `*/${fileSize}` },
    })
    if (res.status === 308) {
      const range = res.headers.get('Range')
      if (!range) return 0  // nothing received yet
      const match = range.match(/^bytes=0-(\d+)$/)
      return match ? parseInt(match[1], 10) + 1 : 0
    }
    if (res.status === 200 || res.status === 201) return fileSize  // already complete
    return null
  } catch {
    return null
  }
}

/** Uploads a file slice to a Drive resumable session URL.
 *  On failure, queries Drive for the resume offset and retries up to UPLOAD_MAX_RETRIES times.
 *  Reports progress (0–100) and retry attempt via callbacks. */
async function uploadToUrl(
  file: File,
  uploadUrl: string,
  onProgress: (pct: number) => void,
  onRetrying: (attempt: number) => void,
): Promise<'done' | 'error'> {
  let startByte = 0

  for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      onRetrying(attempt)
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
      const offset = await queryResumeOffset(uploadUrl, file.size)
      if (offset === null) return 'error'
      if (offset >= file.size) return 'done'
      startByte = offset
    }

    const result = await new Promise<'done' | 'retry'>((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      if (startByte > 0) {
        xhr.setRequestHeader(
          'Content-Range',
          `bytes ${startByte}-${file.size - 1}/${file.size}`,
        )
      }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round(((startByte + e.loaded) / file.size) * 100))
        }
      }
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? 'done' : 'retry')
      xhr.onerror = () => resolve('retry')
      xhr.send(file.slice(startByte))
    })

    if (result === 'done') return 'done'
  }

  return 'error'
}

export default function UploadPage({ token }: UploadPageProps) {
  const { t } = useLocale()
  const [eventName, setEventName] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [uploading, setUploading] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getEvent(token)
      .then(data => {
        if (data.ok) setEventName(data.name)
        else setLoadError(data.error ?? t.err_invalid_link)
      })
      .catch(() => setLoadError(t.err_connection))
  }, [token, t])

  const updateFile = useCallback((index: number, patch: Partial<FileEntry>) => {
    setFiles(prev => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }, [])

  const handleFiles = useCallback((selected: FileList | null) => {
    if (!selected) return
    const arr = Array.from(selected).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (!arr.length) return
    setAllDone(false)
    setFiles(arr.map(f => ({
      name: f.name,
      size: f.size,
      raw: f,
      status: STATUS.WAITING,
      progress: 0,
      message: '',
    })))
  }, [])

  const startUpload = useCallback(async () => {
    if (!files.length || uploading) return
    setUploading(true)
    setAllDone(false)

    // Keep screen on during uploads so the browser isn't suspended on mobile
    let wakeLock: WakeLockSentinel | null = null
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen')
    } catch { /* not available — proceed without */ }

    const doUpload = async (i: number, file: File, existingUploadUrl?: string) => {
      const entry = files[i]
      updateFile(i, { status: STATUS.UPLOADING, progress: 5, message: t.status_uploading, retryable: false })

      let uploadUrl: string | undefined = existingUploadUrl
      if (!uploadUrl) {
        // Get a short-lived OAuth token + folder from Apps Script
        let sessionRes: Awaited<ReturnType<typeof createUploadSession>>
        try {
          sessionRes = await createUploadSession(token, entry.name, file.type)
          if (!sessionRes.ok) {
            updateFile(i, { status: STATUS.ERROR, progress: 0, message: sessionRes.error ?? t.err_upload })
            return
          }
        } catch {
          updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_network })
          return
        }

        // Initiate Drive resumable session from the browser (required for CORS)
        try {
          const initRes = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${sessionRes.uploadToken}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Type': file.type,
              },
              body: JSON.stringify({ name: sessionRes.safeName, parents: [sessionRes.folderId] }),
            },
          )
          const location = initRes.headers.get('Location')
          if (!initRes.ok || !location) {
            updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_upload })
            return
          }
          uploadUrl = location
          // Store URL in state so a manual retry can resume without calling Apps Script again
          updateFile(i, { uploadUrl, progress: 10 })
        } catch {
          updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_network })
          return
        }
      }

      const result = await uploadToUrl(
        file,
        uploadUrl,
        (pct) => updateFile(i, { progress: 10 + Math.round(pct * 0.9) }),
        (attempt) => updateFile(i, { message: t.status_retrying(attempt, UPLOAD_MAX_RETRIES) }),
      )

      if (result === 'done') {
        updateFile(i, { status: STATUS.DONE, progress: 100, message: '' })
      } else {
        updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_upload, retryable: true })
      }
    }

    try {
      const queue = files.map((f, i) => ({ index: i, file: f.raw }))
      const pool = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          const { index, file } = queue.shift()!
          await doUpload(index, file)
        }
      })
      await Promise.all(pool)
    } finally {
      wakeLock?.release()
    }

    setUploading(false)
    setAllDone(true)
  }, [files, uploading, token, updateFile, t])

  const retryFile = useCallback(async (i: number) => {
    const entry = files[i]
    if (!entry.uploadUrl) return
    updateFile(i, { status: STATUS.UPLOADING, progress: 0, retryable: false, message: t.status_uploading })
    const result = await uploadToUrl(
      entry.raw,
      entry.uploadUrl,
      (pct) => updateFile(i, { progress: pct }),
      (attempt) => updateFile(i, { message: t.status_retrying(attempt, UPLOAD_MAX_RETRIES) }),
    )
    if (result === 'done') {
      updateFile(i, { status: STATUS.DONE, progress: 100, message: '' })
    } else {
      updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_upload, retryable: true })
    }
  }, [files, updateFile, t])

  const reset = () => {
    setFiles([])
    setAllDone(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Loading / error states ──────────────────────────────────
  if (loadError) {
    return (
      <main className="page" style={{ justifyContent: 'center' }}>
        <div className="alert alert-error" style={{ marginTop: 40 }}>
          ⚠️ {loadError}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t.err_qr_hint}
        </p>
      </main>
    )
  }

  if (!eventName) {
    return (
      <main className="page" style={{ justifyContent: 'center' }}>
        <div className="spinner" />
      </main>
    )
  }

  // ── Main upload UI ──────────────────────────────────────────
  return (
    <main className="page">
      <div className="page-header">
        <h1>📷 {eventName}</h1>
        <p>{t.upload_subtitle}</p>
      </div>

      {allDone && files.every(f => f.status === STATUS.DONE) && (
        <div className="alert alert-success">
          {t.upload_success}
        </div>
      )}

      {!allDone && !uploading && (
        <div
          className={`drop-zone${dragOver ? ' drag-over' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={t.drop_aria}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        >
          <span className="drop-zone-icon">🖼️</span>
          <strong>{t.drop_label}</strong>
          <br />
          <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{t.drop_hint}</span>
          <span style={{ fontSize: 11, marginTop: 6, display: 'block', color: 'var(--text-muted)' }}>
            {t.drop_info}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={e => handleFiles(e.target.files)}
            aria-label={t.input_aria}
          />
        </div>
      )}

      {files.length > 0 && (
        <>
          <div style={{
            position: 'sticky', top: 52, zIndex: 10,
            background: 'var(--bg)', paddingBottom: 8, paddingTop: 12,
            display: 'flex', gap: 10, width: '100%',
          }}>
            {!allDone && (
              <button
                className="btn btn-primary btn-full"
                onClick={startUpload}
                disabled={uploading || files.every(f => f.status === STATUS.DONE)}
              >
                {uploading ? t.btn_uploading : t.btn_upload(files.length)}
              </button>
            )}
            {(allDone || !uploading) && (
              <button className="btn btn-secondary" onClick={reset} disabled={uploading}>
                {t.btn_clear}
              </button>
            )}
          </div>

          <ul className="file-list">
            {files.map((f, i) => {
              const statusClass = f.status === STATUS.DONE ? 'done' : f.status === STATUS.ERROR ? 'error' : ''
              return (
                <li key={`${f.name}-${i}`} className={`file-item ${statusClass}`}>
                  <span className="file-item-name">{f.name}</span>
                  {f.status === STATUS.UPLOADING && (
                    <div className="progress-wrap">
                      <div className="progress-bar" style={{ width: `${f.progress}%` }} />
                    </div>
                  )}
                  <span className="file-item-status">
                    {f.status === STATUS.WAITING   && t.status_ready((f.size / 1024 / 1024).toFixed(1))}
                    {f.status === STATUS.UPLOADING  && (f.message || t.status_uploading)}
                    {f.status === STATUS.DONE       && t.status_done}
                    {f.status === STATUS.ERROR      && `✗ ${f.message}`}
                  </span>
                  {f.retryable && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '4px 10px', marginTop: 4 }}
                      onClick={() => retryFile(i)}
                    >
                      {t.btn_retry}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
