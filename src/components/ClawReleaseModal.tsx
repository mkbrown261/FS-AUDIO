/**
 * ClawReleaseModal — Post-export ClawFlow release & marketing wizard.
 *
 * Shown automatically after a successful bounce. Claw offers to handle
 * the entire post-production workflow:
 *   1. Distribute to UnitedMasters / DistroKid
 *   2. Pitch to Spotify Editorial & playlist curators
 *   3. Generate cover art (free, AI-powered)
 *   4. Register the song (ISRC / PRO)
 *   5. Contact music editors & media outlets
 *
 * Design rules:
 *  - The mascot is the first thing users see — large, centred.
 *  - Copy is confident, not salesy.
 *  - One primary CTA ("Let Claw Handle It") + one dismissal ("Not Yet").
 *  - Dismissing sets sessionStorage so it won't re-appear until next session.
 *  - If the wizard is fully dismissed, it won't re-open for this export session.
 */

import React, { useEffect, useRef, useState } from 'react'

const FLOWSTATE_HUB = 'https://flowst8.cc'

// ─── Mascot SVG fallback ──────────────────────────────────────────────────────
function ClawMascot({ size }: { size: number }) {
  const [err, setErr] = useState(false)
  if (err) {
    // Embedded SVG mascot — works even without the PNG asset
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <defs>
          <radialGradient id="bg_claw" cx="40%" cy="30%">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="100%" stopColor="#1e1b2e" />
          </radialGradient>
          <radialGradient id="glow_claw" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(168,85,247,0.6)" />
            <stop offset="100%" stopColor="rgba(168,85,247,0)" />
          </radialGradient>
        </defs>
        {/* Glow ring */}
        <circle cx="60" cy="60" r="58" fill="url(#glow_claw)" />
        {/* Body */}
        <circle cx="60" cy="60" r="50" fill="url(#bg_claw)" stroke="rgba(168,85,247,.5)" strokeWidth="2" />
        {/* Eyes */}
        <circle cx="44" cy="50" r="7" fill="#c4b5fd" />
        <circle cx="76" cy="50" r="7" fill="#c4b5fd" />
        <circle cx="46" cy="49" r="3" fill="#2e1065" />
        <circle cx="78" cy="49" r="3" fill="#2e1065" />
        <circle cx="47" cy="47" r="1.5" fill="white" opacity="0.8" />
        <circle cx="79" cy="47" r="1.5" fill="white" opacity="0.8" />
        {/* Smile */}
        <path d="M42 70 Q60 84 78 70" stroke="#c4b5fd" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Antenna claws */}
        <path d="M48 22 L44 10 M60 20 L60 8 M72 22 L76 10" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="44" cy="10" r="3" fill="#e879f9" />
        <circle cx="60" cy="8" r="3" fill="#e879f9" />
        <circle cx="76" cy="10" r="3" fill="#e879f9" />
        {/* Vinyl record decorative element */}
        <circle cx="60" cy="102" r="12" fill="rgba(168,85,247,.15)" stroke="rgba(168,85,247,.4)" strokeWidth="1.5" />
        <circle cx="60" cy="102" r="3" fill="rgba(168,85,247,.6)" />
        <path d="M50 98 Q60 95 70 98 Q73 102 70 106 Q60 109 50 106 Q47 102 50 98Z" fill="none" stroke="rgba(168,85,247,.3)" strokeWidth="1" />
      </svg>
    )
  }
  return (
    <img
      src="/assets/clawbot-mascot.png"
      alt="Claw"
      width={size}
      height={size}
      style={{ objectFit: 'contain', display: 'block' }}
      onError={() => setErr(true)}
    />
  )
}

// ─── Feature pills ────────────────────────────────────────────────────────────
const RELEASE_FEATURES = [
  { emoji: '🚀', label: 'Distribute',    desc: 'UnitedMasters & DistroKid' },
  { emoji: '📧', label: 'Playlist Pitch', desc: 'Spotify Editorial + curators' },
  { emoji: '🎨', label: 'Cover Art',      desc: 'AI-generated, free' },
  { emoji: '📝', label: 'Registration',   desc: 'ISRC, PRO, metadata' },
  { emoji: '📣', label: 'Media Outreach', desc: 'Blogs, editors, press' },
] as const

// ─── Props ────────────────────────────────────────────────────────────────────
export interface ClawReleaseModalProps {
  /** Song / project name from the DAW */
  songName: string
  /** BPM from the project */
  bpm?: number
  /** Called when user closes / dismisses */
  onClose: () => void
  /** Called when user clicks "Let Claw Handle It" */
  onLaunchWizard?: () => void
}

const SESSION_DISMISSED_KEY = 'claw_release_modal_dismissed'

export function ClawReleaseModal({ songName, bpm, onClose, onLaunchWizard }: ClawReleaseModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  // Animate in
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  function handleDismiss() {
    // Mark session so it doesn't refire for the rest of this browser session
    try { sessionStorage.setItem(SESSION_DISMISSED_KEY, '1') } catch {}
    setVisible(false)
    setTimeout(onClose, 300) // wait for fade-out animation
  }

  function handleLaunch() {
    // Navigate to FlowState hub with context
    const params = new URLSearchParams({
      claw: 'release',
      track: songName,
      ...(bpm ? { bpm: String(Math.round(bpm)) } : {}),
    })
    const url = `${FLOWSTATE_HUB}/?${params.toString()}`
    // Electron: use IPC to open in system browser if available
    if (typeof (window as any).electronAPI?.openExternal === 'function') {
      ;(window as any).electronAPI.openExternal(url)
    } else {
      window.open(url, '_blank', 'noopener')
    }
    if (onLaunchWizard) onLaunchWizard()
    handleDismiss()
  }

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) handleDismiss()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        // Fade-in / out
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.28s ease',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(160deg, #12102a 0%, #1a1040 50%, #0d0d1a 100%)',
          border: '1px solid rgba(168,85,247,0.45)',
          borderRadius: 20,
          maxWidth: 480,
          width: '100%',
          padding: '32px 28px 24px',
          position: 'relative',
          boxShadow: '0 0 80px rgba(168,85,247,0.25), 0 24px 60px rgba(0,0,0,0.6)',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.97)',
          transition: 'transform 0.3s cubic-bezier(.16,1,.3,1), opacity 0.28s ease',
        }}
      >
        {/* ── Close button ─────────────────────────────────── */}
        <button
          onClick={handleDismiss}
          title="Not now"
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)', fontSize: 16, lineHeight: 1,
            padding: 4, borderRadius: 6, transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.9)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
        >
          ✕
        </button>

        {/* ── Mascot ───────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{
            position: 'relative',
            filter: 'drop-shadow(0 0 24px rgba(168,85,247,0.55))',
          }}>
            <ClawMascot size={100} />
          </div>
        </div>

        {/* ── Headline ─────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '-0.3px',
            lineHeight: 1.25,
            marginBottom: 8,
          }}>
            🎉 Your song is finished.
          </div>
          <div style={{
            fontSize: 14,
            color: 'rgba(196,181,253,0.9)',
            lineHeight: 1.55,
            maxWidth: 360,
            margin: '0 auto',
          }}>
            <strong style={{ color: '#e9d5ff' }}>Claw can take{' '}
            <span style={{
              background: 'linear-gradient(90deg, #a855f7, #06b6d4)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              {songName || 'this record'}
            </span>
            {' '}to the next level</strong> and give you a leg up —
            handling everything between export and your first stream.
          </div>
        </div>

        {/* ── Sub-copy ──────────────────────────────────────── */}
        <div style={{
          textAlign: 'center',
          fontSize: 12,
          color: 'rgba(167,139,250,0.7)',
          marginBottom: 20,
          fontStyle: 'italic',
        }}>
          Let Claw do the post-workflow. You focus on the music.
        </div>

        {/* ── Feature pills ─────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 24,
        }}>
          {RELEASE_FEATURES.map(f => (
            <div
              key={f.label}
              style={{
                background: 'rgba(168,85,247,0.08)',
                border: '1px solid rgba(168,85,247,0.2)',
                borderRadius: 10,
                padding: '9px 11px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{f.emoji}</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e9d5ff' }}>{f.label}</div>
                <div style={{ fontSize: 10, color: 'rgba(196,181,253,0.6)', marginTop: 1 }}>{f.desc}</div>
              </div>
            </div>
          ))}
          {/* 5th pill spans full width */}
          <div
            style={{
              background: 'rgba(168,85,247,0.08)',
              border: '1px solid rgba(168,85,247,0.2)',
              borderRadius: 10,
              padding: '9px 11px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              gridColumn: '1 / -1',
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{RELEASE_FEATURES[4].emoji}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#e9d5ff' }}>{RELEASE_FEATURES[4].label}</div>
              <div style={{ fontSize: 10, color: 'rgba(196,181,253,0.6)', marginTop: 1 }}>{RELEASE_FEATURES[4].desc}</div>
            </div>
          </div>
        </div>

        {/* ── CTAs ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <button
            onClick={handleLaunch}
            style={{
              width: '100%',
              padding: '13px 20px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #9333ea 0%, #7c3aed 50%, #06b6d4 100%)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '0.2px',
              boxShadow: '0 4px 24px rgba(147,51,234,0.45)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 6px 30px rgba(147,51,234,0.6)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(147,51,234,0.45)'
            }}
          >
            ⚡ Let Claw Handle the Post-Workflow
          </button>

          <button
            onClick={handleDismiss}
            style={{
              width: '100%',
              padding: '10px 20px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.45)',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
            }}
          >
            Not yet — I'll handle it myself
          </button>
        </div>

        {/* ── Fine print ───────────────────────────────────── */}
        <div style={{
          textAlign: 'center',
          marginTop: 14,
          fontSize: 10,
          color: 'rgba(255,255,255,0.2)',
          lineHeight: 1.4,
        }}>
          Cover art generation is free. Distribution & pitching require ClawFlow.
          <br />
          Claw will ask your permission before sending anything.
        </div>
      </div>
    </div>
  )
}

/**
 * Utility: check if the release modal was dismissed this session.
 * Call this before conditionally rendering the modal.
 */
export function isClawReleaseModalDismissed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}
