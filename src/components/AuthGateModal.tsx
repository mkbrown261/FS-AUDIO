import React, { useCallback, useEffect, useRef, useState } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────────
const FS_BASE = 'https://flowst8.cc'
const CLAWFLOW_PRICE = '$40/mo'
const CLAWFLOW_INTRO = 'First month $20'

// ── Types ──────────────────────────────────────────────────────────────────────
export type RequiredAccess =
  | 'any_account'   // just needs a free FlowState sign-in
  | 'clawflow'      // needs ClawFlow (separate AI subscription)

export interface AuthGateConfig {
  toolName: string
  toolIcon?: string
  requiredAccess: RequiredAccess
  description?: string
  creditCost?: number       // optional — shows credit cost in modal
}

interface AuthState {
  signedIn: boolean
  tier: string
  hasClawflow: boolean
  email: string
}

// ── Auth state helpers ─────────────────────────────────────────────────────────
async function getAuthState(): Promise<AuthState> {
  try {
    const user = await window.electronAPI?.getUser?.()
    if (!user) return { signedIn: false, tier: '', hasClawflow: false, hasPro: false, email: '' }
    const tier = ((user as any).tier ?? 'free').toLowerCase()
    const hasPro = ['pro', 'personal_pro', 'team', 'team_starter', 'team_growth', 'enterprise', 'clawflow'].includes(tier)
    return {
      signedIn: true,
      tier,
      hasClawflow: tier === 'clawflow',
      hasPro,
      email: (user as any).email ?? '',
    }
  } catch {
    return { signedIn: false, tier: '', hasClawflow: false, hasPro: false, email: '' }
  }
}

function hasAccess(auth: AuthState, required: RequiredAccess): boolean {
  if (!auth.signedIn) return false
  if (required === 'any_account') return true
  if (required === 'pro') return auth.hasPro
  if (required === 'clawflow') return auth.hasClawflow
  return false
}

// ── useAuthGate hook ───────────────────────────────────────────────────────────
export function useAuthGate() {
  const [modal, setModal] = useState<{
    config: AuthGateConfig
    auth: AuthState
    onGranted: () => void
  } | null>(null)

  const checkAndRun = useCallback(async (
    config: AuthGateConfig,
    onGranted: () => void,
  ) => {
    const auth = await getAuthState()
    if (hasAccess(auth, config.requiredAccess)) {
      onGranted()
    } else {
      setModal({ config, auth, onGranted })
    }
  }, [])

  const closeModal = useCallback(() => setModal(null), [])

  return { modal, checkAndRun, closeModal }
}

// ── AuthGateModal component ────────────────────────────────────────────────────
interface AuthGateModalProps {
  config: AuthGateConfig
  auth: AuthState
  onClose: () => void
  onGranted: () => void
}

export function AuthGateModal({ config, auth, onClose, onGranted }: AuthGateModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Re-check auth when window regains focus (user may have signed in via browser)
  useEffect(() => {
    const handler = () => {
      setChecking(true)
      getAuthState().then(newAuth => {
        if (hasAccess(newAuth, config.requiredAccess)) {
          onClose()
          onGranted()
        }
        setChecking(false)
      })
    }
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [config.requiredAccess, onClose, onGranted])

  // Open a URL in the user's real browser (not an Electron window)
  function openExternal(url: string) {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url)
    } else {
      // Non-Electron fallback (shouldn't happen in desktop app)
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function openSignIn() {
    const state = Math.random().toString(36).slice(2)
    // Always use the IPC bridge so auth opens in the user's system browser
    // NEVER use window.open — it creates another Electron window → 404
    if (window.electronAPI?.startAuth) {
      window.electronAPI.startAuth(state)
    } else {
      // Fallback for web / non-Electron environment only
      const url = `${FS_BASE}/api/fsaudio/auth?state=${encodeURIComponent(state)}&redirect=fsaudio://auth`
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function openClawFlow() {
    openExternal(`${FS_BASE}/#clawflow`)
  }

  function openCreateAccount() {
    openExternal(`${FS_BASE}/auth`)
  }

  const icon = config.toolIcon ?? '⚡'

  // ── Determine modal content based on auth state ──────────────────────────
  let headline = ''
  let body = ''
  let primaryLabel = ''
  let primaryAction = () => {}
  let secondaryLabel = ''
  let secondaryAction = () => {}
  let badge = ''
  let badgeColor = ''

  if (!auth.signedIn) {
    headline = 'Sign in to use ' + config.toolName
    body = 'You need a FlowState account to use this feature. Recording, editing, mixing, and all DAW tools stay completely free — this only applies to AI plugins.'
    primaryLabel = 'Sign In with FlowState'
    primaryAction = openSignIn
    secondaryLabel = 'Create a Free Account'
    secondaryAction = openCreateAccount
    badge = 'FREE ACCOUNT'
    badgeColor = '#6b7280'
  } else if (config.requiredAccess === 'pro') {
    headline = config.toolName + ' requires a Pro plan'
    body = `You're on the Free plan. ${config.toolName} is available on Pro, Team, and Enterprise — upgrade to unlock all AI plugins in FS-Audio.`
    primaryLabel = 'Upgrade to Pro'
    primaryAction = () => openExternal(`${FS_BASE}/pricing`)
    secondaryLabel = 'View Pricing'
    secondaryAction = () => openExternal(`${FS_BASE}/pricing`)
    badge = 'PRO FEATURE'
    badgeColor = '#f59e0b'
  } else if (config.requiredAccess === 'clawflow') {
    headline = config.toolName + ' is part of ClawFlow'
    body = `ClawFlow is a separate AI subscription — it's not a plan upgrade, it's its own thing. It unlocks ClawBot, AI music generation, stem separation, AI mastering, and advanced tools across all your FlowState apps.`
    primaryLabel = `Get ClawFlow — ${CLAWFLOW_PRICE}`
    primaryAction = openClawFlow
    secondaryLabel = 'Learn More About ClawFlow'
    secondaryAction = openClawFlow
    badge = CLAWFLOW_INTRO
    badgeColor = '#a855f7'
  }

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
        animation: 'agfs-fade-in 0.15s ease',
      }}
    >
      <style>{`
        @keyframes agfs-fade-in { from { opacity:0; transform:scale(.95) } to { opacity:1; transform:scale(1) } }
        .agfs-modal {
          background: #0f0f1a;
          border: 1px solid rgba(168,85,247,0.2);
          border-radius: 18px;
          padding: 32px;
          width: 400px;
          max-width: 92vw;
          box-shadow: 0 0 0 1px rgba(168,85,247,0.08), 0 32px 80px rgba(0,0,0,.7);
        }
        .agfs-icon { font-size: 2.2rem; margin-bottom: 14px; display: block; }
        .agfs-badge {
          display: inline-block; padding: 3px 10px; border-radius: 99px;
          font-size: 10px; font-weight: 700; letter-spacing: .08em; margin-bottom: 12px;
        }
        .agfs-headline { font-size: 1.1rem; font-weight: 700; color: #f3f4f6; margin-bottom: 10px; line-height: 1.35; }
        .agfs-body { font-size: .85rem; color: #9ca3af; line-height: 1.65; margin-bottom: 22px; }
        .agfs-user {
          display: flex; align-items: center; gap: 8px;
          background: rgba(168,85,247,0.06); border: 1px solid rgba(168,85,247,0.15);
          border-radius: 8px; padding: 8px 12px; margin-bottom: 18px;
          font-size: .8rem; color: #6b7280;
        }
        .agfs-user strong { color: #d1d5db; }
        .agfs-credit-note {
          display: flex; align-items: center; gap: 6px;
          background: rgba(168,85,247,0.08); border-radius: 8px;
          padding: 8px 12px; margin-bottom: 20px;
          font-size: .8rem; color: #a855f7;
        }
        .agfs-btn-primary {
          width: 100%; padding: 13px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          color: #fff; font-size: .9rem; font-weight: 600; cursor: pointer;
          margin-bottom: 10px; transition: opacity .15s;
        }
        .agfs-btn-primary:hover { opacity: .9; }
        .agfs-btn-secondary {
          width: 100%; padding: 11px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1); background: transparent;
          color: #9ca3af; font-size: .85rem; font-weight: 500; cursor: pointer;
          margin-bottom: 8px; transition: border-color .15s, color .15s;
        }
        .agfs-btn-secondary:hover { border-color: rgba(168,85,247,0.4); color: #d1d5db; }
        .agfs-btn-later {
          width: 100%; padding: 8px; border: none; background: transparent;
          color: #4b5563; font-size: .8rem; cursor: pointer; transition: color .15s;
        }
        .agfs-btn-later:hover { color: #9ca3af; }
        .agfs-checking { display: flex; align-items: center; gap: 8px; font-size: .78rem; color: #6b7280; justify-content: center; margin-top: 10px; }
        @keyframes agfs-spin { to { transform: rotate(360deg) } }
        .agfs-spinner { width: 13px; height: 13px; border: 2px solid #1f2937; border-top-color: #a855f7; border-radius: 50%; animation: agfs-spin .7s linear infinite; }
      `}</style>

      <div className="agfs-modal">
        <span className="agfs-icon">{icon}</span>

        {badge && (
          <div
            className="agfs-badge"
            style={{ background: badgeColor + '1a', color: badgeColor, border: `1px solid ${badgeColor}33` }}
          >
            {badge}
          </div>
        )}

        <div className="agfs-headline">{headline}</div>

        {auth.signedIn && auth.email && (
          <div className="agfs-user">
            <span>Signed in as</span>
            <strong>{auth.email}</strong>
            <span style={{ marginLeft: 'auto', textTransform: 'capitalize', color: '#a855f7' }}>
              {auth.tier || 'free'}
            </span>
          </div>
        )}

        <div className="agfs-body">{body}</div>

        {config.creditCost != null && config.creditCost > 0 && (
          <div className="agfs-credit-note">
            <span>⚡</span>
            <span>This tool costs <strong>{config.creditCost} credits</strong> per use — included with ClawFlow (500 credits/mo)</span>
          </div>
        )}

        {config.description && (
          <div style={{ fontSize: '.78rem', color: '#6b7280', background: 'rgba(255,255,255,.03)', borderRadius: '8px', padding: '10px 12px', marginBottom: '20px', lineHeight: 1.5 }}>
            {config.description}
          </div>
        )}

        <button className="agfs-btn-primary" onClick={primaryAction}>
          {primaryLabel}
        </button>
        <button className="agfs-btn-secondary" onClick={secondaryAction}>
          {secondaryLabel}
        </button>
        <button className="agfs-btn-later" onClick={onClose}>
          Maybe Later — keep working
        </button>

        {checking && (
          <div className="agfs-checking">
            <div className="agfs-spinner" />
            Checking access…
          </div>
        )}
      </div>
    </div>
  )
}

// ── AuthGateWrapper ────────────────────────────────────────────────────────────
export function AuthGateWrapper({
  modal, closeModal, children,
}: {
  modal: ReturnType<typeof useAuthGate>['modal']
  closeModal: () => void
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      {modal && (
        <AuthGateModal
          config={modal.config}
          auth={modal.auth}
          onClose={closeModal}
          onGranted={modal.onGranted}
        />
      )}
    </>
  )
}
