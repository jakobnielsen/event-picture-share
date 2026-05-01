import { useEffect, useRef, useState } from 'react'
import { useLocale } from './i18n'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
}

export default function InstallPrompt({ ignoreStandalone = false }: { ignoreStandalone?: boolean }) {
  const { t } = useLocale()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosTooltip, setShowIosTooltip] = useState(false)
  const [ios, setIos] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ignoreStandalone && isInStandaloneMode()) return

    if (isIos()) {
      setIos(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Close iOS tooltip when clicking outside
  useEffect(() => {
    if (!showIosTooltip) return
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowIosTooltip(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showIosTooltip])

  if (!deferredPrompt && !ios) return null

  if (ios) {
    return (
      <div className="install-wrap" ref={tooltipRef}>
        <button
          className="theme-toggle"
          title={t.install_btn}
          aria-label={t.install_btn}
          onClick={() => setShowIosTooltip(v => !v)}
        >
          📲
        </button>
        {showIosTooltip && (
          <div className="install-tooltip">
            {t.install_ios_hint}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      className="theme-toggle"
      title={t.install_btn}
      aria-label={t.install_btn}
      onClick={async () => {
        if (!deferredPrompt) return
        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted' || outcome === 'dismissed') {
          setDeferredPrompt(null)
        }
      }}
    >
      📲
    </button>
  )
}
