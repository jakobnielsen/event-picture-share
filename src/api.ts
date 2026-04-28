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

/** POST action:upload — saves a base64-encoded image to the event's Drive folder */
export async function uploadFile(
  token: string,
  filename: string,
  mimeType: string,
  base64Data: string,
): Promise<ApiResponse<UploadResponse>> {
  return postJson<UploadResponse>({ action: 'upload', token, filename, mimeType, data: base64Data })
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
