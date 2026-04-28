import { useState, useEffect, useRef, useCallback } from 'react'
import imageCompression from 'browser-image-compression'
import { getEvent, uploadFile } from './api'

const SMALL_FILE_BYTES = 5 * 1024 * 1024   // 5 MB — skip compression
const LARGE_FILE_BYTES = 15 * 1024 * 1024  // 15 MB — warn user
const UPLOAD_CONCURRENCY = 3               // max parallel uploads

interface CompressionResult {
  file: File
  compressed: boolean
  wasLarge?: boolean
}

async function compressIfNeeded(file: File): Promise<CompressionResult> {
  if (file.size <= SMALL_FILE_BYTES) return { file, compressed: false }

  const isLarge = file.size > LARGE_FILE_BYTES
  const compressed = await imageCompression(file, {
    maxSizeMB: isLarge ? 8 : 6,  // 6 MB target ≈ Google Photos quality, 8 MB for very large
    alwaysKeepResolution: true,   // quality-reduction only, never resize
    initialQuality: 1,
    preserveExif: true,
    useWebWorker: true,
  })
  return { file: compressed, compressed: true, wasLarge: isLarge }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // reader.result is "data:<mime>;base64,<data>" — strip the prefix
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
    const arr = Array.from(selected).filter(f => f.type.startsWith('image/'))
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

    const processOne = async (i: number) => {
      const entry = files[i]

      // Compress
      updateFile(i, { status: STATUS.COMPRESSING, message: 'Preparing…' })
      let processedFile: File
      try {
        const result = await compressIfNeeded(entry.raw)
        processedFile = result.file
        if (result.wasLarge) {
          updateFile(i, { wasLarge: true, message: 'Large file — quality preserved as much as possible' })
        }
      } catch {
        updateFile(i, { status: STATUS.ERROR, message: 'Compression failed' })
        return
      }

      // Convert to base64
      updateFile(i, { status: STATUS.UPLOADING, progress: 10, message: 'Uploading…' })
      let base64: string
      try {
        base64 = await fileToBase64(processedFile)
      } catch {
        updateFile(i, { status: STATUS.ERROR, message: 'Could not read file' })
        return
      }

      updateFile(i, { progress: 50 })

      // Upload
      try {
        const res = await uploadFile(token, entry.name, processedFile.type, base64)
        if (res.ok) {
          updateFile(i, { status: STATUS.DONE, progress: 100, message: 'Uploaded!' })
        } else {
          updateFile(i, { status: STATUS.ERROR, progress: 0, message: res.error ?? 'Upload failed' })
        }
      } catch {
        updateFile(i, { status: STATUS.ERROR, progress: 0, message: 'Network error' })
      }
    }

    // Run up to UPLOAD_CONCURRENCY tasks in parallel
    const indices = files.map((_, i) => i)
    const pool = Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
      while (indices.length > 0) {
        const i = indices.shift()!
        await processOne(i)
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
        <p>Upload your photos from the event</p>
      </div>

      {allDone && files.every(f => f.status === STATUS.DONE) && (
        <div className="alert alert-success">
          All photos uploaded successfully! Thank you 🎉
        </div>
      )}

      {!allDone && (
        <div
          className={`drop-zone${dragOver ? ' drag-over' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Select photos to upload"
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        >
          <span className="drop-zone-icon">🖼️</span>
          <strong>Tap to select photos</strong>
          <br />
          <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>or drag &amp; drop here</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={e => handleFiles(e.target.files)}
            aria-label="Select photos"
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
                {uploading ? 'Uploading…' : `Upload ${files.length} photo${files.length === 1 ? '' : 's'}`}
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
