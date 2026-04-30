import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Locale = 'en' | 'da'

// ── Translations ──────────────────────────────────────────────

const en = {
  // LandingPage
  landing_title: 'Event Photo Share',
  landing_desc: "Scan the QR code at your event to upload photos directly to the organizer's Google Drive.",

  // UploadPage — static UI
  upload_subtitle: 'Upload your photos and videos from the event',
  upload_success: 'All files uploaded successfully! Thank you 🎉',
  drop_aria: 'Select photos or videos to upload',
  drop_label: 'Tap to select photos or videos',
  drop_hint: 'or drag & drop here',
  drop_info: 'Photos and videos uploaded directly to Drive',
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
  status_retrying: (attempt: number, max: number) => `Resuming… (${attempt}/${max})`,
  large_file_warn: 'Large file — quality preserved as much as possible',

  // UploadPage — error messages
  err_invalid_link: 'Invalid link.',
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

  // EventCard
  card_created: (date: string) => `Created ${date}`,
  card_hide_qr: 'Hide QR',
  card_show_qr: '🔲 Show QR',
  card_download_qr: '⬇ Download QR',
  card_drive: '📁 Drive folder',
}

const da: typeof en = {
  landing_title: 'Event Billededeling',
  landing_desc: 'Scan QR-koden ved dit arrangement for at uploade billeder direkte til arrangørens Google Drive.',

  upload_subtitle: 'Upload dine billeder og videoer fra arrangementet',
  upload_success: 'Alle filer er uploadet! Tak 🎉',
  drop_aria: 'Vælg billeder eller videoer til upload',
  drop_label: 'Tryk for at vælge billeder eller videoer',
  drop_hint: 'eller træk og slip her',
  drop_info: 'Billeder og videoer uploades direkte til Drive',
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
  status_retrying: (attempt: number, max: number) => `Genoptager… (${attempt}/${max})`,
  large_file_warn: 'Stor fil — kvaliteten bevares så vidt muligt',

  err_invalid_link: 'Ugyldigt link.',
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

  card_created: (date: string) => `Oprettet ${date}`,
  card_hide_qr: 'Skjul QR',
  card_show_qr: '🔲 Vis QR',
  card_download_qr: '⬇ Download QR',
  card_drive: '📁 Drev-mappe',
}

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
      {locale === 'en' ? 'DA' : 'EN'}
    </button>
  )
}
