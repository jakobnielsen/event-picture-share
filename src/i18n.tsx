import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Locale = 'en' | 'da'

// ── Translations ──────────────────────────────────────────────

const en = {
  // LandingPage
  landing_title: 'Event Photo Share',
  landing_desc: "Scan the QR code at your event to upload photos and videos directly to the organizer.",

  // UploadPage — static UI
  upload_subtitle: 'Upload your photos and videos from the event',
  upload_success: 'All files uploaded successfully! Thank you 🎉',
  drop_aria: 'Select photos or videos to upload',
  drop_label: 'Tap to select photos or videos',
  drop_hint: 'or drag & drop here',
  input_aria: 'Select photos or videos',
  btn_uploading: 'Uploading…',
  btn_clear: 'Clear',
  btn_retry: 'Retry',

  // UploadPage — dynamic
  status_ready: (mb: string) => `Ready — ${mb} MB`,
  btn_upload: (n: number) => `Upload ${n} file${n === 1 ? '' : 's'}`,
  file_summary: (n: number, size: string) => `${n} ${n === 1 ? 'file' : 'files'} · ${size} total`,
  // UploadPage — per-file status labels
  status_preparing: 'Preparing…',
  status_uploading: 'Uploading…',
  status_done: '✓ Uploaded',
  status_already_uploaded: '✓ Already uploaded',
  status_retrying: (attempt: number, max: number) => `Resuming… (${attempt}/${max})`,
  large_file_warn: 'Large file — quality preserved as much as possible',

  // UploadPage — error messages
  err_invalid_link: 'Invalid link.',
  err_event_expired: 'This event has ended and is no longer accepting uploads.',
  err_event_closed: 'This event has been closed by the organizer.',
  err_connection: 'Could not reach the server. Check your connection.',
  err_qr_hint: 'Make sure you scanned the correct QR code.',
  err_network: 'Network error',
  err_upload: 'Upload failed',

  // AdminPage — auth gate
  admin_title: 'Admin',
  admin_subtitle: 'Enter your admin key to manage events',
  admin_key_label: 'Admin key',
  admin_key_placeholder: 'Paste your admin key',
  admin_signin: 'Sign in',

  // AdminPage — dashboard
  admin_events_title: 'Events',
  admin_events_subtitle: 'Manage photo events',
  admin_signout: 'Sign out',
  admin_new_event: 'New event',
  admin_event_name_label: 'Event name',
  admin_event_name_placeholder: 'e.g. Summer Wedding 2026',
  admin_creating: 'Creating…',
  admin_create_btn: 'Create event & generate QR',
  admin_no_events: 'No events yet. Create one above.',
  admin_err_network: 'Network error',
  admin_err_load: 'Failed to load events',
  admin_err_create: 'Failed to create event',
  admin_expiry_label: 'Expires after (days)',
  admin_err_revoke: 'Failed to close event',

  // EventCard
  card_created: (date: string) => `Created ${date}`,
  card_expires: (date: string) => `Expires ${date}`,
  card_expired: 'Expired',
  card_revoked: 'Closed',
  card_revoke_btn: 'Close event',
  card_revoke_confirm: 'Close this event? Attendees will no longer be able to upload.',
  card_reopen_btn: 'Reopen',
  card_reopen_confirm: 'Reopen this event for uploads?',
  card_err_revoke: 'Failed to close event',
  card_err_reopen: 'Failed to reopen event',
  card_delete_btn: 'Delete',
  card_delete_confirm: 'Delete this event? This cannot be undone.',
  card_delete_folder_confirm: 'Also move the Drive folder and ALL photos/videos to trash?',
  card_err_delete: 'Failed to delete event',
  card_hide_qr: 'Hide QR',
  card_show_qr: '🔲 Show QR',
  card_download_qr: '⬇ Download QR',
  card_drive: '📁 Google Drive folder',

  // QR Scanner
  scan_btn: 'Scan QR code',
  scan_title: 'Scan QR code',
  scan_hint: 'Point the camera at the event QR code',
  scan_no_camera: 'Camera not available',
  scan_no_permission: 'Camera permission denied',
  scan_error: 'Could not start camera',
  scan_close: 'Close',
}

const da: typeof en = {
  landing_title: 'Event Billededeling',
  landing_desc: 'Scan QR-koden ved dit arrangement for at uploade billeder og videoer direkte til arrangøren.',

  upload_subtitle: 'Upload dine billeder og videoer fra arrangementet',
  upload_success: 'Alle filer er uploadet! Tak 🎉',
  drop_aria: 'Vælg billeder eller videoer til upload',
  drop_label: 'Tryk for at vælge billeder eller videoer',
  drop_hint: 'eller træk og slip her',
  input_aria: 'Vælg billeder eller videoer',
  btn_uploading: 'Uploader…',
  btn_clear: 'Ryd',
  btn_retry: 'Prøv igen',

  status_ready: (mb: string) => `Klar — ${mb} MB`,
  btn_upload: (n: number) => `Upload ${n} fil${n === 1 ? '' : 'er'}`,
  file_summary: (n: number, size: string) => `${n} ${n === 1 ? 'fil' : 'filer'} · ${size} i alt`,
  status_preparing: 'Forbereder…',
  status_uploading: 'Uploader…',
  status_done: '✓ Uploadet',
  status_already_uploaded: '✓ Allerede uploadet',
  status_retrying: (attempt: number, max: number) => `Genoptager… (${attempt}/${max})`,
  large_file_warn: 'Stor fil — kvaliteten bevares så vidt muligt',

  err_invalid_link: 'Ugyldigt link.',
  err_event_expired: 'Dette arrangement er afsluttet og modtager ikke længere uploads.',
  err_event_closed: 'Dette arrangement er lukket af arrangøren.',
  err_connection: 'Kunne ikke nå serveren. Tjek din forbindelse.',
  err_qr_hint: 'Sørg for at du scannede den rigtige QR-kode.',
  err_network: 'Netværksfejl',
  err_upload: 'Upload mislykkedes',

  admin_title: 'Admin',
  admin_subtitle: 'Indtast din adminnøgle for at administrere arrangementer',
  admin_key_label: 'Adminnøgle',
  admin_key_placeholder: 'Indsæt din adminnøgle',
  admin_signin: 'Log ind',

  admin_events_title: 'Arrangementer',
  admin_events_subtitle: 'Administrer fotoarrangementer',
  admin_signout: 'Log ud',
  admin_new_event: 'Nyt arrangement',
  admin_event_name_label: 'Arrangementsnavn',
  admin_event_name_placeholder: 'f.eks. Sommerfest 2026',
  admin_creating: 'Opretter…',
  admin_create_btn: 'Opret arrangement & generer QR',
  admin_no_events: 'Ingen arrangementer endnu. Opret et ovenfor.',
  admin_err_network: 'Netværksfejl',
  admin_err_load: 'Kunne ikke hente arrangementer',
  admin_err_create: 'Kunne ikke oprette arrangement',
  admin_expiry_label: 'Udløber efter (dage)',
  admin_err_revoke: 'Kunne ikke lukke arrangementet',

  card_created: (date: string) => `Oprettet ${date}`,
  card_expires: (date: string) => `Udløber ${date}`,
  card_expired: 'Udløbet',
  card_revoked: 'Lukket',
  card_revoke_btn: 'Luk arrangement',
  card_revoke_confirm: 'Luk dette arrangement? Gæster kan ikke længere uploade.',
  card_reopen_btn: 'Åbn igen',
  card_reopen_confirm: 'Åbn dette arrangement for uploads igen?',
  card_err_revoke: 'Kunne ikke lukke arrangementet',
  card_err_reopen: 'Kunne ikke åbne arrangementet igen',
  card_delete_btn: 'Slet',
  card_delete_confirm: 'Slet dette arrangement? Dette kan ikke fortrydes.',
  card_delete_folder_confirm: 'Vil du også flytte Drive-mappen og ALLE billeder/videoer til papirkurven?',
  card_err_delete: 'Kunne ikke slette arrangementet',
  card_hide_qr: 'Skjul QR',
  card_show_qr: '🔲 Vis QR',
  card_download_qr: '⬇ Download QR',
  card_drive: '📁 Google Drive-mappe',
  // QR Scanner
  scan_btn: 'Scan QR-kode',
  scan_title: 'Scan QR-kode',
  scan_hint: 'Ret kameraet mod arrangementets QR-kode',
  scan_no_camera: 'Kamera ikke tilgængeligt',
  scan_no_permission: 'Kameraadgang afvist',
  scan_error: 'Kunne ikke starte kamera',
  scan_close: 'Luk',}

const translations: Record<Locale, typeof en> = { en, da }

// ── Context ───────────────────────────────────────────────────

interface LocaleContextValue {
  locale: Locale
  t: typeof en
  toggleLocale: () => void
}

const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', t: en, toggleLocale: () => {} })

function getInitialLocale(): Locale {
  const stored = localStorage.getItem('eps_locale') as Locale | null
  if (stored === 'en' || stored === 'da') return stored
  return navigator.language.startsWith('da') ? 'da' : 'en'
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale)

  const toggleLocale = useCallback(() => {
    setLocale(prev => {
      const next = prev === 'en' ? 'da' : 'en'
      localStorage.setItem('eps_locale', next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ locale, t: translations[locale], toggleLocale }), [locale, toggleLocale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function LocaleToggle() {
  const { locale, toggleLocale } = useLocale()
  return (
    <button
      className="theme-toggle"
      onClick={toggleLocale}
      aria-label={locale === 'en' ? 'Skift til dansk' : 'Switch to English'}
      title={locale === 'en' ? 'Skift til dansk' : 'Switch to English'}
    >
      {locale === 'en' ? '🇩🇰 DA' : '🇬🇧 EN'}
    </button>
  )
}
