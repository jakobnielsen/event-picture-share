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

/** POST action:upload — saves a base64-encoded image to the event's Drive folder.
 *  Uses XHR so callers can receive real upload-progress events (0–100). */
export function uploadFile(
  token: string,
  filename: string,
  mimeType: string,
  base64Data: string,
  onProgress?: (percent: number) => void,
): Promise<ApiResponse<UploadResponse>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', BASE_URL)
    xhr.setRequestHeader('Content-Type', 'text/plain')
    xhr.responseType = 'json'

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => resolve(xhr.response as ApiResponse<UploadResponse>)
    xhr.onerror = () => reject(new Error('Network error'))

    xhr.send(JSON.stringify({ action: 'upload', token, filename, mimeType, data: base64Data }))
  })
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
