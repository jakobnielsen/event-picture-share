import { useState, useEffect, useRef, useCallback } from 'react'
import imageCompression from 'browser-image-compression'
import { getEvent, createUploadSession } from './api'
import { useLocale } from './i18n'

const SMALL_FILE_BYTES = 1 * 1024 * 1024   // 1 MB — skip compression below this
const LARGE_FILE_BYTES = 15 * 1024 * 1024  // 15 MB — warn user
const UPLOAD_CONCURRENCY = 5               // max parallel uploads

interface CompressionResult {
  file: File
  compressed: boolean
  wasLarge?: boolean
}

async function compressIfNeeded(file: File): Promise<CompressionResult> {
  if (file.size <= SMALL_FILE_BYTES) return { file, compressed: false }

  const isLarge = file.size > LARGE_FILE_BYTES
  const compressed = await imageCompression(file, {
    maxSizeMB: isLarge ? 6 : 2,  // 2 MB target for normal, 6 MB for very large
    alwaysKeepResolution: true,   // quality-reduction only, never resize
    initialQuality: 1,
    preserveExif: true,
    useWebWorker: false,  // avoid concurrent worker limits when compressing in parallel
  })
  return { file: compressed, compressed: true, wasLarge: isLarge }
}

const STATUS = {
  WAITING: 'waiting',
  COMPRESSING: 'compressing',
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
  wasLarge?: boolean
}

interface UploadPageProps {
  token: string
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

    // Phase 1: compress images serially (concurrent canvas operations lock up browsers); videos skip compression
    type Ready = { index: number; processedFile: File }
    const ready: Ready[] = []
    for (let i = 0; i < files.length; i++) {
      const entry = files[i]
      if (entry.raw.type.startsWith('video/')) {
        ready.push({ index: i, processedFile: entry.raw })
      } else {
        updateFile(i, { status: STATUS.COMPRESSING, message: t.status_preparing })
        try {
          const result = await compressIfNeeded(entry.raw)
          if (result.wasLarge) {
            updateFile(i, { wasLarge: true, message: t.large_file_warn })
          }
          ready.push({ index: i, processedFile: result.file })
        } catch {
          updateFile(i, { status: STATUS.ERROR, message: t.err_compression })
        }
      }
    }

    // Phase 2: upload files directly to Drive via browser-initiated resumable session (parallel)
    const uploadOne = async ({ index: i, processedFile }: Ready) => {
      const entry = files[i]
      updateFile(i, { status: STATUS.UPLOADING, progress: 5, message: t.status_uploading })

      // Ask Apps Script for a token + folder to initiate the Drive session from the browser.
      // Browser-initiated sessions include the Origin header, which makes Drive include
      // Access-Control-Allow-Origin on responses — required for CORS to work.
      let sessionRes: Awaited<ReturnType<typeof createUploadSession>>
      try {
        sessionRes = await createUploadSession(token, entry.name, processedFile.type)
        if (!sessionRes.ok) {
          updateFile(i, { status: STATUS.ERROR, progress: 0, message: sessionRes.error ?? t.err_upload })
          return
        }
      } catch {
        updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_network })
        return
      }

      // Initiate the Drive resumable upload session directly from the browser.
      // The browser automatically includes Origin, so Drive sets up CORS for this session.
      let uploadUrl: string
      try {
        const initRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sessionRes.uploadToken}`,
              'Content-Type': 'application/json',
              'X-Upload-Content-Type': processedFile.type,
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
      } catch {
        updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_network })
        return
      }

      updateFile(i, { progress: 10 })

      // PUT the raw file to Drive — no size limit, real upload progress via XHR
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', processedFile.type)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateFile(i, { progress: 10 + Math.round((e.loaded / e.total) * 90) })
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateFile(i, { status: STATUS.DONE, progress: 100, message: 'Uploaded!' })
          } else {
            updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_upload })
          }
          resolve()
        }
        xhr.onerror = () => {
          updateFile(i, { status: STATUS.ERROR, progress: 0, message: t.err_network })
          resolve()
        }
        xhr.send(processedFile)
      })
    }

    const queue = [...ready]
    const pool = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        await uploadOne(queue.shift()!)
      }
    })
    await Promise.all(pool)

    setUploading(false)
    setAllDone(true)
  }, [files, uploading, token, updateFile, t])

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

      {!allDone && (
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
          <ul className="file-list">
            {files.map((f, i) => {
              const statusClass = f.status === STATUS.DONE ? 'done' : f.status === STATUS.ERROR ? 'error' : ''
              return (
                <li key={`${f.name}-${i}`} className={`file-item ${statusClass}`}>
                  <span className="file-item-name">{f.name}</span>
                  {(f.status === STATUS.UPLOADING || f.status === STATUS.COMPRESSING) && (
                    <div className="progress-wrap">
                      <div className="progress-bar" style={{ width: `${f.progress}%` }} />
                    </div>
                  )}
                  <span className="file-item-status">
                    {f.status === STATUS.WAITING     && t.status_ready((f.size / 1024 / 1024).toFixed(1))}
                    {f.status === STATUS.COMPRESSING  && t.status_preparing}
                    {f.status === STATUS.UPLOADING    && (f.message || t.status_uploading)}
                    {f.status === STATUS.DONE         && t.status_done}
                    {f.status === STATUS.ERROR        && `✗ ${f.message}`}
                  </span>
                  {f.wasLarge && f.status !== STATUS.ERROR && (
                    <span className="alert alert-warn" style={{ padding: '4px 8px', marginTop: 2, fontSize: 12 }}>
                      {t.large_file_warn}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, width: '100%' }}>
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
        </>
      )}
    </main>
  )
}
