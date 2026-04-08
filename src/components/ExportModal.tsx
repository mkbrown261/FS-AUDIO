import React, { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { ExportOptions, ExportProgress, LUFS_TARGETS } from '../hooks/useExport'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  onBounce: (opts: ExportOptions) => void
  progress: ExportProgress
}

const LUFS_PRESETS = [
  { key: 'none',        label: 'Peak −0.2 dBFS', value: null     },
  { key: 'spotify',     label: 'Spotify −14',    value: -14       },
  { key: 'appleMusic',  label: 'Apple −16',      value: -16       },
  { key: 'youtube',     label: 'YouTube −14',    value: -14       },
  { key: 'soundcloud',  label: 'SoundCloud −14', value: -14       },
  { key: 'tidal',       label: 'Tidal −14',      value: -14       },
  { key: 'amazon',      label: 'Amazon −14',     value: -14       },
  { key: 'ebu_r128',    label: 'EBU R128 −23',   value: -23       },
  { key: 'custom',      label: 'Custom LUFS',    value: 'custom' as const },
] as const

export function ExportModal({ isOpen, onClose, onBounce, progress }: ExportModalProps) {
  const { name, loopStart, loopEnd, bpm, bitDepth: projectBD, sampleRate: projectSR, isLooping, tracks } = useProjectStore()

  const [range, setRange]         = useState<'project' | 'loop'>('project')
  const [mode, setMode]           = useState<'mix' | 'stems'>('mix')
  const [format, setFormat]       = useState<'wav' | 'mp3'>('wav')
  const [bitDepth, setBitDepth]   = useState<16 | 24 | 32>(projectBD as 16 | 24 | 32)
  const [mp3BitRate, setMp3BR]    = useState<128 | 192 | 256 | 320>(192)
  const [sampleRate, setSR]       = useState<44100 | 48000>(44100)
  // Normalize / LUFS
  const [normalizeMode, setNormalizeMode] = useState<string>('none')
  const [customLufs, setCustomLufs]       = useState<number>(-14)
  const [filename, setFilename]           = useState(name.replace(/[^a-z0-9_\- ]/gi, '_') + '_bounce')
  // Stem selection
  const audioTracks = tracks.filter(t => t.type !== 'master' && t.clips.some(c => c.audioUrl))
  const [selectedStems, setSelectedStems] = useState<Set<string>>(() => new Set(audioTracks.map(t => t.id)))

  if (!isOpen) return null

  const loopDurSec = (loopEnd - loopStart) * (60 / bpm)
  let maxBeat = 0
  for (const t of tracks) for (const c of t.clips) { const e = c.startBeat + c.durationBeats; if (e > maxBeat) maxBeat = e }
  const projectDurSec = maxBeat * (60 / bpm)

  const busy = progress.phase === 'rendering' || progress.phase === 'encoding'
  const done = progress.phase === 'done'
  const err  = progress.phase === 'error'

  function fmtSec(s: number) {
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}.${(s % 1).toFixed(1).slice(2)}`
  }

  // Resolve LUFS target from selection
  function resolveLufsTarget(): number | null {
    if (normalizeMode === 'none') return null
    if (normalizeMode === 'custom') return customLufs
    const preset = LUFS_PRESETS.find(p => p.key === normalizeMode)
    if (!preset || preset.value === null || preset.value === 'custom') return null
    return preset.value as number
  }

  const lufsTarget = resolveLufsTarget()
  const normalize = normalizeMode !== 'none'

  return (
    <>
      {/* Backdrop */}
      <div className="export-backdrop" onClick={() => { if (!busy) onClose() }} />

      <div className="export-modal" role="dialog" aria-modal="true" aria-label="Export / Bounce">
        {/* Header */}
        <div className="export-header">
          <div className="export-title">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style={{ marginRight: 6 }}>
              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export / Bounce
          </div>
          <button className="export-close-btn" onClick={onClose} disabled={busy} title="Close">✕</button>
        </div>

        {/* Body */}
        <div className="export-body">
          {/* Mode */}
          <div className="export-section">
            <div className="export-section-label">Export Mode</div>
            <div className="export-btn-group">
              {(['mix', 'stems'] as const).map(m => (
                <button key={m} className={`export-fmt-btn ${mode === m ? 'active' : ''}`}
                  onClick={() => setMode(m)}>
                  {m === 'mix' ? '🎚 Stereo Mix' : '🎛 Stems (per track)'}
                </button>
              ))}
            </div>
            {mode === 'stems' && audioTracks.length > 0 && (
              <div className="export-stem-list">
                <div style={{ fontSize: 9, color: 'var(--text-s)', marginBottom: 6 }}>Select tracks to export:</div>
                {audioTracks.map(t => (
                  <label key={t.id} className="export-stem-row">
                    <input
                      type="checkbox"
                      checked={selectedStems.has(t.id)}
                      onChange={e => {
                        const next = new Set(selectedStems)
                        if (e.target.checked) next.add(t.id)
                        else next.delete(t.id)
                        setSelectedStems(next)
                      }}
                    />
                    <span className="export-stem-dot" style={{ background: t.color }} />
                    <span className="export-stem-name">{t.name}</span>
                    <span className="export-stem-clips">{t.clips.filter(c=>c.audioUrl).length} clip{t.clips.filter(c=>c.audioUrl).length !== 1 ? 's' : ''}</span>
                  </label>
                ))}
                <div className="export-stem-actions">
                  <button className="export-stem-sel-btn" onClick={() => setSelectedStems(new Set(audioTracks.map(t=>t.id)))}>All</button>
                  <button className="export-stem-sel-btn" onClick={() => setSelectedStems(new Set())}>None</button>
                </div>
              </div>
            )}
          </div>

          {/* Range */}
          <div className="export-section">
            <div className="export-section-label">Export Range</div>
            <div className="export-radio-group">
              <label className={`export-radio ${range === 'project' ? 'active' : ''}`}>
                <input type="radio" name="range" value="project" checked={range === 'project'} onChange={() => setRange('project')} />
                <span className="export-radio-dot" />
                <div>
                  <div className="export-radio-title">Entire Project</div>
                  <div className="export-radio-sub">
                    {maxBeat > 0 ? `0:00 → ${fmtSec(projectDurSec)} (${projectDurSec.toFixed(1)}s)` : 'No clips'}
                  </div>
                </div>
              </label>
              <label className={`export-radio ${range === 'loop' ? 'active' : ''}`}>
                <input type="radio" name="range" value="loop" checked={range === 'loop'} onChange={() => setRange('loop')} />
                <span className="export-radio-dot" />
                <div>
                  <div className="export-radio-title">Loop Region {!isLooping && <span style={{ color: 'var(--warn)', fontSize: 9 }}>(loop off)</span>}</div>
                  <div className="export-radio-sub">
                    {fmtSec(loopStart * 60 / bpm)} → {fmtSec(loopEnd * 60 / bpm)} ({loopDurSec.toFixed(1)}s)
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* File Format */}
          <div className="export-section">
            <div className="export-section-label">File Format</div>
            <div className="export-format-row">
              {/* Format WAV/MP3 */}
              <div className="export-param">
                <label>Container</label>
                <div className="export-btn-group">
                  {(['wav', 'mp3'] as const).map(f => (
                    <button key={f} className={`export-fmt-btn ${format === f ? 'active' : ''}`}
                      onClick={() => setFormat(f)}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bit depth (WAV only) */}
              {format === 'wav' && (
                <div className="export-param">
                  <label>Bit Depth</label>
                  <div className="export-btn-group">
                    {([16, 24, 32] as const).map(b => (
                      <button key={b} className={`export-fmt-btn ${bitDepth === b ? 'active' : ''}`}
                        onClick={() => setBitDepth(b)}>
                        {b}-bit{b === 32 ? ' float' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* MP3 bitrate */}
              {format === 'mp3' && (
                <div className="export-param">
                  <label>MP3 Bitrate</label>
                  <div className="export-btn-group">
                    {([128, 192, 256, 320] as const).map(br => (
                      <button key={br} className={`export-fmt-btn ${mp3BitRate === br ? 'active' : ''}`}
                        onClick={() => setMp3BR(br)}>
                        {br}k
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample rate */}
              <div className="export-param">
                <label>Sample Rate</label>
                <div className="export-btn-group">
                  {([44100, 48000] as const).map(sr => (
                    <button key={sr} className={`export-fmt-btn ${sampleRate === sr ? 'active' : ''}`}
                      onClick={() => setSR(sr)}>
                      {sr === 44100 ? '44.1kHz' : '48kHz'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Loudness / Normalize — LUFS targets */}
          <div className="export-section">
            <div className="export-section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Loudness Normalization
              <span style={{ fontSize: 9, color: 'var(--text-s)', fontWeight: 400, marginLeft: 2 }}>ITU-R BS.1770-4</span>
            </div>
            <div className="export-lufs-grid">
              {LUFS_PRESETS.map(preset => (
                <button
                  key={preset.key}
                  className={`export-lufs-btn ${normalizeMode === preset.key ? 'active' : ''}`}
                  onClick={() => setNormalizeMode(preset.key)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {normalizeMode === 'custom' && (
              <div className="export-custom-lufs">
                <label style={{ fontSize: 10, color: 'var(--text-m)', marginRight: 8 }}>Target LUFS:</label>
                <input
                  type="range"
                  min={-40}
                  max={-6}
                  step={0.5}
                  value={customLufs}
                  onChange={e => setCustomLufs(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span className="export-lufs-val">{customLufs.toFixed(1)} LUFS</span>
              </div>
            )}
            {normalizeMode !== 'none' && (
              <div className="export-lufs-hint">
                {normalizeMode === 'none'
                  ? 'No normalization'
                  : normalizeMode === 'custom'
                  ? `Normalize to ${customLufs.toFixed(1)} LUFS integrated`
                  : `Normalize to ${lufsTarget?.toFixed(0)} LUFS — True Peak ≤ −1 dBTP`}
              </div>
            )}
          </div>

          {/* Filename */}
          <div className="export-section">
            <div className="export-section-label">Filename</div>
            <div className="export-filename-row">
              <input
                className="export-filename-input"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                placeholder="bounce"
                disabled={busy}
              />
              <span className="export-ext">.{format}</span>
            </div>
          </div>

          {/* Progress */}
          {busy && (
            <div className="export-progress-wrap">
              <div className="export-progress-label">
                {progress.phase === 'rendering' ? '⚙ Rendering offline...' : `💾 Encoding ${format.toUpperCase()}...`}
              </div>
              <div className="export-progress-bar">
                <div className="export-progress-fill" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            </div>
          )}

          {done && (
            <div className="export-success">
              {mode === 'stems' ? `✓ Stems exported (${selectedStems.size} track${selectedStems.size !== 1 ? 's' : ''}) — check your Downloads folder` : `✓ Bounce complete — check your Downloads folder`}
            </div>
          )}

          {err && (
            <div className="export-error">
              ✕ {progress.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="export-footer">
          <button className="export-cancel-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="export-bounce-btn"
            disabled={busy || maxBeat <= 0 || (mode === 'stems' && selectedStems.size === 0)}
            onClick={() => onBounce({
              range,
              bitDepth,
              sampleRate,
              normalize,
              lufsTarget: lufsTarget ?? undefined,
              format,
              mp3BitRate,
              filename: filename.trim() ? `${filename.trim()}.${format}` : undefined,
              mode,
              stemTrackIds: mode === 'stems' ? [...selectedStems] : undefined,
            })}
          >
            {busy
              ? '⚙ Bouncing...'
              : mode === 'stems'
              ? `⬇ Export ${selectedStems.size} Stem${selectedStems.size !== 1 ? 's' : ''}`
              : `⬇ Bounce to ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </>
  )
}
