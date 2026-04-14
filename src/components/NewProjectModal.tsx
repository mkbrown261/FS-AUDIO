/**
 * NewProjectModal — Logic-Pro-style project template picker.
 *
 * Shows 5 starter templates:
 *   1. Empty          — 2 audio + 1 MIDI + master
 *   2. Beat Producer  — kick/snare/hi-hat midi tracks + 2 audio + FS-Pressure bus comp
 *   3. Pop Song       — vox, guitar, bass, keys, drums, 2 aux returns (reverb/delay)
 *   4. Podcast        — 3 mic tracks pre-loaded with EQ + de-esser + compressor
 *   5. Film Score     — strings, brass, perc, piano MIDI tracks + FX bus + reverb
 *
 * Calls `store.newProjectFromTemplate(template)` which the store exposes.
 */

import React, { useState } from 'react'
import { useProjectStore } from '../store/projectStore'

// ── Template definitions ─────────────────────────────────────────────────────
interface TrackDef {
  name: string
  type: 'audio' | 'midi' | 'bus'
  color: string
  plugins?: { type: string; name: string; params: Record<string, number | string> }[]
}

interface ProjectTemplate {
  id: string
  label: string
  icon: string
  desc: string
  bpm: number
  timeSignature: [number, number]
  tracks: TrackDef[]
}

const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'empty',
    label: 'Empty Project',
    icon: '⬜',
    desc: 'Start from scratch with 2 audio tracks and 1 MIDI track.',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [
      { name: 'Audio 1', type: 'audio', color: '#a855f7' },
      { name: 'Audio 2', type: 'audio', color: '#ec4899' },
      { name: 'MIDI 1',  type: 'midi',  color: '#3b82f6' },
    ],
  },
  {
    id: 'beat',
    label: 'Beat Producer',
    icon: '🥁',
    desc: '808 drums, bass, sample chops — hip-hop / trap / lo-fi ready.',
    bpm: 90,
    timeSignature: [4, 4],
    tracks: [
      { name: 'Drums', type: 'midi', color: '#ef4444',
        plugins: [{ type: 'fs_dx7', name: 'FS-DX7', params: { algorithm: 0, outputLevel: 0.8 } }] },
      { name: '808 Bass', type: 'midi', color: '#f59e0b',
        plugins: [{ type: 'fs_fm', name: 'FS-FM', params: { outputLevel: 0.9 } }] },
      { name: 'Chops',  type: 'audio', color: '#10b981' },
      { name: 'FX',    type: 'audio', color: '#6366f1' },
      { name: 'Bus Mix', type: 'bus', color: '#8b5cf6',
        plugins: [{ type: 'bus_compressor', name: 'FS-Pressure', params: { threshold: -12, ratio: 4, attack: 0.001, release: 0.1, makeup: 4, mix: 0.8 } }] },
    ],
  },
  {
    id: 'pop',
    label: 'Pop Song',
    icon: '🎤',
    desc: 'Vocals, guitar, keys, bass, drums — full band template.',
    bpm: 128,
    timeSignature: [4, 4],
    tracks: [
      { name: 'Lead Vox',  type: 'audio', color: '#ec4899',
        plugins: [
          { type: 'compressor', name: 'Compressor', params: { threshold: -18, ratio: 4, attack: 0.005, release: 0.08, knee: 5 } },
          { type: 'eq',  name: 'EQ',  params: { lowGain: -2, midGain: 1, highGain: 2 } },
          { type: 'reverb', name: 'FS-Reverb', params: { wet: 0.15, size: 1.8, damping: 0.6, irType: 'plate' } },
        ]},
      { name: 'Bgv 1',    type: 'audio', color: '#f9a8d4' },
      { name: 'Bgv 2',    type: 'audio', color: '#f9a8d4' },
      { name: 'Guitar',   type: 'audio', color: '#f59e0b',
        plugins: [{ type: 'eq', name: 'EQ', params: { lowGain: -6, midGain: 0, highGain: 1 } }] },
      { name: 'Keys',     type: 'midi',  color: '#a78bfa',
        plugins: [{ type: 'fs_wavetable', name: 'FS-Wavetable', params: { waveform: 'sine', attack: 5, decay: 80, sustain: 0.7, release: 300 } }] },
      { name: 'Bass',     type: 'audio', color: '#10b981',
        plugins: [{ type: 'compressor', name: 'Compressor', params: { threshold: -14, ratio: 3, attack: 0.003, release: 0.12, knee: 3 } }] },
      { name: 'Drums',    type: 'midi',  color: '#ef4444',
        plugins: [{ type: 'fs_dx7', name: 'FS-DX7', params: { algorithm: 0, outputLevel: 0.85 } }] },
      { name: 'Verb Aux', type: 'bus',   color: '#6366f1',
        plugins: [{ type: 'reverb', name: 'FS-Reverb', params: { wet: 0.6, size: 2.5, damping: 0.5, irType: 'hall' } }] },
      { name: 'Dly Aux',  type: 'bus',   color: '#0ea5e9',
        plugins: [{ type: 'delay', name: 'FS-Delay', params: { wet: 0.4, time: 0.375, feedback: 0.3, stereoSpread: 0.4 } }] },
    ],
  },
  {
    id: 'podcast',
    label: 'Podcast / Voice',
    icon: '🎙️',
    desc: '3 mic channels with EQ, de-esser and compressor pre-loaded.',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [
      { name: 'Host Mic',  type: 'audio', color: '#3b82f6',
        plugins: [
          { type: 'eq', name: 'EQ', params: { lowGain: -8, midGain: 0, highGain: 1 } },
          { type: 'compressor', name: 'Compressor', params: { threshold: -20, ratio: 5, attack: 0.003, release: 0.08, knee: 4 } },
        ]},
      { name: 'Guest 1',   type: 'audio', color: '#10b981',
        plugins: [
          { type: 'eq', name: 'EQ', params: { lowGain: -8, midGain: 0, highGain: 1 } },
          { type: 'compressor', name: 'Compressor', params: { threshold: -20, ratio: 5, attack: 0.003, release: 0.08, knee: 4 } },
        ]},
      { name: 'Guest 2',   type: 'audio', color: '#f59e0b',
        plugins: [
          { type: 'eq', name: 'EQ', params: { lowGain: -8, midGain: 0, highGain: 1 } },
          { type: 'compressor', name: 'Compressor', params: { threshold: -20, ratio: 5, attack: 0.003, release: 0.08, knee: 4 } },
        ]},
      { name: 'Music Bed', type: 'audio', color: '#8b5cf6' },
      { name: 'SFX',       type: 'audio', color: '#06b6d4' },
    ],
  },
  {
    id: 'filmscore',
    label: 'Film Score',
    icon: '🎬',
    desc: 'Strings, brass, perc, piano — orchestral template at 120 BPM.',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [
      { name: 'Strings',   type: 'midi', color: '#a855f7',
        plugins: [{ type: 'fs_wavetable', name: 'FS-Wavetable', params: { waveform: 'sine', attack: 60, decay: 200, sustain: 0.9, release: 600 } }] },
      { name: 'Brass',     type: 'midi', color: '#f59e0b',
        plugins: [{ type: 'fs_fm', name: 'FS-FM', params: { algorithm: 1, outputLevel: 0.8 } }] },
      { name: 'Woodwinds', type: 'midi', color: '#10b981',
        plugins: [{ type: 'fs_wavetable', name: 'FS-Wavetable', params: { waveform: 'triangle', attack: 20, decay: 100, sustain: 0.8, release: 400 } }] },
      { name: 'Piano',     type: 'midi', color: '#3b82f6',
        plugins: [{ type: 'fs_dx7', name: 'FS-DX7', params: { algorithm: 0, outputLevel: 0.85 } }] },
      { name: 'Perc',      type: 'midi', color: '#ef4444',
        plugins: [{ type: 'fs_dx7', name: 'FS-DX7', params: { algorithm: 3, outputLevel: 0.9 } }] },
      { name: 'Choir',     type: 'midi', color: '#ec4899',
        plugins: [{ type: 'fs_granular', name: 'FS-Granular', params: { position: 0.5, grainSize: 120, density: 15, mix: 1.0, volume: 0.8 } }] },
      { name: 'Orch Bus',  type: 'bus',  color: '#6366f1',
        plugins: [
          { type: 'reverb', name: 'FS-Reverb', params: { wet: 0.4, size: 4, damping: 0.3, irType: 'cathedral' } },
          { type: 'bus_compressor', name: 'FS-Pressure', params: { threshold: -18, ratio: 2, attack: 0.01, release: 0.3, mix: 0.7 } },
        ]},
    ],
  },
]

// ── Component ────────────────────────────────────────────────────────────────
interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called before creating the new project so the engine can clear its cache */
  onBeforeCreate?: () => void
}

export function NewProjectModal({ isOpen, onClose, onBeforeCreate }: NewProjectModalProps) {
  const [selected, setSelected] = useState<string>('empty')
  const [projectName, setProjectName] = useState('Untitled Project')
  const store = useProjectStore()

  if (!isOpen) return null

  const template = TEMPLATES.find(t => t.id === selected) ?? TEMPLATES[0]

  const handleCreate = () => {
    const tmpl = TEMPLATES.find(t => t.id === selected) ?? TEMPLATES[0]
    onBeforeCreate?.()
    store.newProjectFromTemplate(tmpl.tracks, tmpl.bpm, tmpl.timeSignature, projectName.trim() || 'Untitled Project')
    onClose()
  }

  return (
    <>
      <div className="npm-backdrop" onClick={onClose} />
      <div className="npm-modal" role="dialog" aria-modal="true" aria-label="New Project">
        {/* Header */}
        <div className="npm-header">
          <span className="npm-title">New Project</span>
          <button className="npm-close" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="npm-body">
          {/* Template list */}
          <div className="npm-list">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                className={`npm-item${selected === t.id ? ' active' : ''}`}
                onClick={() => setSelected(t.id)}
              >
                <span className="npm-item-icon">{t.icon}</span>
                <div className="npm-item-text">
                  <span className="npm-item-label">{t.label}</span>
                  <span className="npm-item-desc">{t.desc}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <div className="npm-detail">
            <div className="npm-detail-header">
              <span className="npm-detail-icon">{template.icon}</span>
              <div>
                <div className="npm-detail-title">{template.label}</div>
                <div className="npm-detail-meta">{template.bpm} BPM · {template.timeSignature[0]}/{template.timeSignature[1]}</div>
              </div>
            </div>

            <div className="npm-detail-desc">{template.desc}</div>

            {/* Track preview */}
            <div className="npm-tracks-label">Tracks ({template.tracks.length})</div>
            <div className="npm-tracks">
              {template.tracks.map((tr, i) => (
                <div key={i} className="npm-track-row">
                  <div className="npm-track-swatch" style={{ background: tr.color }} />
                  <span className="npm-track-name">{tr.name}</span>
                  <span className="npm-track-type">{tr.type}</span>
                  {tr.plugins && tr.plugins.length > 0 && (
                    <span className="npm-track-plugins">{tr.plugins.map(p => p.name).join(', ')}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Project name input */}
            <div className="npm-name-row">
              <label className="npm-name-label">Project Name</label>
              <input
                className="npm-name-input"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                spellCheck={false}
                autoFocus
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="npm-footer">
          <button className="npm-cancel" onClick={onClose}>Cancel</button>
          <button className="npm-create" onClick={handleCreate}>Create Project</button>
        </div>
      </div>
    </>
  )
}

// Re-export template track def for store usage
export type { TrackDef as TemplateTrackDef }
