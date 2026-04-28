import { useState, useEffect, useRef, useCallback } from 'react'
import imageCompression from 'browser-image-compression'
import { getEvent, createUploadSession } from './api'

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
        else setLoadError(data.error ?? 'Invalid link.')
      })
      .catch(() => setLoadError('Could not reach the server. Check your connection.'))
  }, [token])

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
        updateFile(i, { status: STATUS.COMPRESSING, message: 'Preparing…' })
        try {
          const result = await compressIfNeeded(entry.raw)
          if (result.wasLarge) {
            updateFile(i, { wasLarge: true, message: 'Large file — quality preserved as much as possible' })
          }
          ready.push({ index: i, processedFile: result.file })
        } catch {
          updateFile(i, { status: STATUS.ERROR, message: 'Compression failed' })
        }
      }
    }

    // Phase 2: upload files directly to Drive via resumable session (parallel, real progress)
    const uploadOne = async ({ index: i, processedFile }: Ready) => {
      const entry = files[i]
      updateFile(i, { status: STATUS.UPLOADING, progress: 5, message: 'Uploading…' })

      // Ask Apps Script to create a Drive resumable upload session
      let uploadUrl: string
      try {
        const sessionRes = await createUploadSession(token, entry.name, processedFile.type)
        if (!sessionRes.ok) {
          updateFile(i, { status: STATUS.ERROR, progress: 0, message: sessionRes.error ?? 'Upload failed' })
          return
        }
        uploadUrl = sessionRes.uploadUrl
      } catch {
        updateFile(i, { status: STATUS.ERROR, progress: 0, message: 'Network error' })
        return
      }

      // PUT the raw file directly to Drive — no base64, no size limit, real progress
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', processedFile.type)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateFile(i, { progress: 5 + Math.round((e.loaded / e.total) * 95) })
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateFile(i, { status: STATUS.DONE, progress: 100, message: 'Uploaded!' })
          } else {
            updateFile(i, { status: STATUS.ERROR, progress: 0, message: 'Upload failed' })
          }
          resolve()
        }
        xhr.onerror = () => {
          updateFile(i, { status: STATUS.ERROR, progress: 0, message: 'Network error' })
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
  }, [files, uploading, token, updateFile])

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
          Make sure you scanned the correct QR code.
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
        <p>Upload your photos and videos from the event</p>
      </div>

      {allDone && files.every(f => f.status === STATUS.DONE) && (
        <div className="alert alert-success">
          All files uploaded successfully! Thank you 🎉
        </div>
      )}

      {!allDone && (
        <div
          className={`drop-zone${dragOver ? ' drag-over' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Select photos or videos to upload"
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        >
          <span className="drop-zone-icon">🖼️</span>
          <strong>Tap to select photos or videos</strong>
          <br />
          <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>or drag &amp; drop here</span>
          <span style={{ fontSize: 11, marginTop: 6, display: 'block', color: 'var(--text-muted)' }}>
            Photos are compressed automatically · Videos supported
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={e => handleFiles(e.target.files)}
            aria-label="Select photos or videos"
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
                    {f.status === STATUS.WAITING     && `Ready — ${(f.size / 1024 / 1024).toFixed(1)} MB`}
                    {f.status === STATUS.COMPRESSING  && 'Preparing…'}
                    {f.status === STATUS.UPLOADING    && (f.message || 'Uploading…')}
                    {f.status === STATUS.DONE         && '✓ Uploaded'}
                    {f.status === STATUS.ERROR        && `✗ ${f.message}`}
                  </span>
                  {f.wasLarge && f.status !== STATUS.ERROR && (
                    <span className="alert alert-warn" style={{ padding: '4px 8px', marginTop: 2, fontSize: 12 }}>
                      Large file — quality preserved as much as possible
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
                {uploading ? 'Uploading…' : `Upload ${files.length} file${files.length === 1 ? '' : 's'}`}
              </button>
            )}
            {(allDone || !uploading) && (
              <button className="btn btn-secondary" onClick={reset} disabled={uploading}>
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </main>
  )
}
