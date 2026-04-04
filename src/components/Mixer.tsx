import React, { useEffect, useRef, useState } from 'react'
import { useProjectStore, Track } from '../store/projectStore'

function VUMeter({ level }: { level: number }) {
  const segments = 20
  const greenEnd = 14
  const yellowEnd = 18

  return (
    <div className="vu-meter">
      {Array.from({ length: segments }, (_, i) => {
        const segLevel = (segments - i) / segments
        const active = level >= segLevel
        const color = i < segments - yellowEnd ? '#ef4444'
          : i < segments - greenEnd ? '#f59e0b'
          : '#10b981'
        return (
          <div key={i} className="vu-seg" style={{ background: active ? color : '#ffffff11' }} />
        )
      })}
    </div>
  )
}

function ChannelStrip({ track, level }: { track: Track; level: number }) {
  const { updateTrack, addPlugin } = useProjectStore()
  const [showPlugins, setShowPlugins] = useState(false)

  function addBuiltinPlugin(type: string) {
    addPlugin(track.id, {
      id: `plugin-${Date.now()}`,
      name: type.toUpperCase(),
      type: type as any,
      enabled: true,
      params: getDefaultParams(type),
    })
  }

  function getDefaultParams(type: string): Record<string, number> {
    switch (type) {
      case 'eq': return { low: 0, mid: 0, high: 0, lowFreq: 320, midFreq: 1000, highFreq: 3200 }
      case 'compressor': return { threshold: -24, ratio: 4, attack: 3, release: 250, knee: 30, gain: 0 }
      case 'reverb': return { roomSize: 0.5, damping: 0.5, wet: 0.25, pre: 20 }
      case 'delay': return { time: 375, feedback: 0.3, wet: 0.2, syncBpm: 1 }
      case 'limiter': return { ceiling: -0.3, lookahead: 5, truePeak: 1 }
      case 'chorus': return { rate: 0.5, depth: 0.5, mix: 0.3, delay: 25 }
      case 'distortion': return { drive: 0.4, tone: 0.5, mix: 0.5, type: 0 }
      default: return {}
    }
  }

  const volDb = track.volume <= 0 ? '-∞' : ((20 * Math.log10(track.volume)) >= 0 ? '+' : '') + (20 * Math.log10(track.volume)).toFixed(1)

  return (
    <div className={`mixer-channel ${track.type === 'master' ? 'master-channel' : ''}`}>
      <div className="mixer-ch-name" style={{ color: track.color }}>{track.name}</div>

      {/* Insert slots */}
      <div className="insert-slots">
        {Array.from({ length: 4 }, (_, i) => {
          const plugin = track.plugins[i]
          return (
            <div
              key={i}
              className={`insert-slot ${plugin ? 'has-plugin' : ''} ${plugin && !plugin.enabled ? 'disabled' : ''}`}
              title={plugin ? plugin.name : 'Empty insert slot'}
              onClick={() => !plugin && setShowPlugins(true)}
            >
              {plugin ? plugin.name : '—'}
            </div>
          )
        })}
      </div>

      {/* Add plugin dropdown */}
      {showPlugins && (
        <div className="plugin-dropdown">
          {['eq','compressor','reverb','delay','limiter','chorus','distortion'].map(t => (
            <div key={t} className="plugin-option" onClick={() => { addBuiltinPlugin(t); setShowPlugins(false) }}>
              {t.toUpperCase()}
            </div>
          ))}
          <div className="plugin-option" onClick={() => setShowPlugins(false)}>Cancel</div>
        </div>
      )}

      {/* Pan */}
      <div className="mixer-pan-wrap">
        <input
          type="range" min={-100} max={100} value={Math.round(track.pan * 100)}
          className="mixer-pan"
          onChange={e => updateTrack(track.id, { pan: parseInt(e.target.value) / 100 })}
          title={`Pan: ${track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(Math.round(track.pan*100))}` : `R${Math.round(track.pan*100)}`}`}
        />
      </div>

      {/* Fader + VU */}
      <div className="fader-vu-wrap">
        <VUMeter level={level} />
        <input
          type="range" min={0} max={125} step={1}
          className="mixer-fader"
          style={{ writingMode: 'vertical-lr', direction: 'rtl' } as any}
          value={Math.round(track.volume * 100)}
          onChange={e => updateTrack(track.id, { volume: parseInt(e.target.value) / 100 })}
          title={`Volume: ${volDb} dB`}
        />
      </div>

      <div className="mixer-db">{volDb} dB</div>

      {/* Mute / Solo */}
      <div className="mixer-btns">
        <button
          className={`mxbtn ${track.muted ? 'muted' : ''}`}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >M</button>
        <button
          className={`mxbtn ${track.solo ? 'soloed' : ''}`}
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
        >S</button>
        {track.type !== 'master' && (
          <button
            className={`mxbtn ${track.armed ? 'armed' : ''}`}
            onClick={() => updateTrack(track.id, { armed: !track.armed })}
          >⏺</button>
        )}
      </div>
    </div>
  )
}

export function Mixer({ trackLevels }: { trackLevels: Map<string, number> }) {
  const { tracks, showMixer, setShowMixer, activePanel, setActivePanel } = useProjectStore()
  const [mixerHeight, setMixerHeight] = useState(220)
  const resizeRef = useRef<HTMLDivElement>(null)

  function startResize(e: React.MouseEvent) {
    const startY = e.clientY
    const startH = mixerHeight
    const mv = (me: MouseEvent) => setMixerHeight(Math.max(120, Math.min(600, startH - (me.clientY - startY))))
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="bottom-panel" style={{ height: showMixer ? mixerHeight : 36 }}>
      {/* Resize handle */}
      <div className="resize-handle" ref={resizeRef} onMouseDown={startResize} />

      {/* Panel tabs */}
      <div className="bottom-tabs">
        <button className={`btab ${activePanel === 'mixer' ? 'active' : ''}`} onClick={() => { setActivePanel('mixer'); setShowMixer(true) }}>Mixer</button>
        <button className={`btab ${activePanel === 'piano-roll' ? 'active' : ''}`} onClick={() => { setActivePanel('piano-roll'); setShowMixer(true) }}>Piano Roll</button>
        <button className={`btab ${activePanel === 'plugins' ? 'active' : ''}`} onClick={() => { setActivePanel('plugins'); setShowMixer(true) }}>Plugins</button>
        <button className="btab btab-close" onClick={() => setShowMixer(!showMixer)}>{showMixer ? '▼' : '▲'}</button>
      </div>

      {showMixer && activePanel === 'mixer' && (
        <div className="mixer-strip-row">
          {tracks.map(track => (
            <ChannelStrip key={track.id} track={track} level={trackLevels.get(track.id) ?? 0} />
          ))}
        </div>
      )}
    </div>
  )
}
