const BASE_URL = import.meta.env.VITE_APPS_SCRIPT_URL

// ── Response types ────────────────────────────────────────────

export interface ApiError {
  ok: false
  error: string
}

export interface GetEventResponse {
  ok: true
  name: string
  createdAt: string
}

export interface UploadResponse {
  ok: true
}

export interface CreateUploadSessionResponse {
  ok: true
  uploadToken: string
  folderId: string
  safeName: string
}

export interface EventRecord {
  name: string
  token: string
  folderId: string
  folderUrl: string
  createdAt: string
}

export interface CreateEventResponse {
  ok: true
  token: string
  folderId: string
  folderUrl: string
}

export interface ListEventsResponse {
  ok: true
  events: EventRecord[]
}

type ApiResponse<T> = T | ApiError

// ── Helpers ───────────────────────────────────────────────────

async function postJson<T>(body: object): Promise<ApiResponse<T>> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    // Use text/plain to avoid CORS preflight — Apps Script does not handle OPTIONS
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
    redirect: 'follow',
  })
  return res.json() as Promise<ApiResponse<T>>
}

// ── API calls ─────────────────────────────────────────────────

/** GET ?action=getEvent&token=TOKEN */
export async function getEvent(token: string): Promise<ApiResponse<GetEventResponse>> {
  const url = `${BASE_URL}?action=getEvent&token=${encodeURIComponent(token)}`
  const res = await fetch(url, { redirect: 'follow' })
  return res.json() as Promise<ApiResponse<GetEventResponse>>
}

/** POST action:upload — legacy base64 upload, kept for reference. */
export async function uploadFile(
  token: string,
  filename: string,
  mimeType: string,
  base64Data: string,
  onProgress?: (percent: number) => void,
): Promise<ApiResponse<UploadResponse>> {
  // fetch doesn't expose upload progress, so we animate a ticker while waiting
  let ticking = true
  let fake = 0
  if (onProgress) {
    onProgress(0)
    const tick = () => {
      if (!ticking) return
      fake = fake + (95 - fake) * 0.07
      onProgress(Math.round(fake))
      setTimeout(tick, 300)
    }
    setTimeout(tick, 300)
  }
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'upload', token, filename, mimeType, data: base64Data }),
      redirect: 'follow',
    })
    return res.json() as Promise<ApiResponse<UploadResponse>>
  } finally {
    ticking = false
  }
}

/** POST action:createUploadSession — returns a Drive resumable upload URL.
 *  The browser then PUTs the raw file directly to Drive (no size limit, real progress). */
export async function createUploadSession(
  token: string,
  filename: string,
  mimeType: string,
): Promise<ApiResponse<CreateUploadSessionResponse>> {
  return postJson<CreateUploadSessionResponse>({ action: 'createUploadSession', token, filename, mimeType })
}

/** POST action:createEvent — creates a Drive subfolder and returns a new token */
export async function createEvent(
  adminKey: string,
  name: string,
): Promise<ApiResponse<CreateEventResponse>> {
  return postJson<CreateEventResponse>({ action: 'createEvent', adminKey, name })
}

/** POST action:listEvents — returns all events for the admin dashboard */
export async function listEvents(adminKey: string): Promise<ApiResponse<ListEventsResponse>> {
  return postJson<ListEventsResponse>({ action: 'listEvents', adminKey })
}
