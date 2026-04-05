import { create } from 'zustand'

export interface MidiNote {
  id: string
  pitch: number        // 0-127 (60 = middle C)
  velocity: number     // 0-127
  startBeat: number
  durationBeats: number
}

export interface Plugin {
  id: string
  name: string
  type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'limiter' | 'chorus' | 'distortion' | 'vst'
  enabled: boolean
  params: Record<string, number>
  vstPath?: string
}

export interface Send {
  id: string
  busId: string
  level: number      // 0-1
  preFader: boolean
}

export interface Clip {
  id: string
  trackId: string
  startBeat: number
  durationBeats: number
  name: string
  type: 'audio' | 'midi'
  audioUrl?: string
  audioBuffer?: AudioBuffer | null
  midiNotes?: MidiNote[]
  gain: number         // 0-2 (1 = unity)
  fadeIn: number       // beats
  fadeOut: number      // beats
  looped: boolean
  muted: boolean
  color?: string
  aiGenerated: boolean
  waveformPeaks?: number[]
}

export interface Track {
  id: string
  name: string
  type: 'audio' | 'midi' | 'bus' | 'master'
  color: string
  muted: boolean
  solo: boolean
  armed: boolean
  volume: number     // 0-1 (1 = 0 dB)
  pan: number        // -1 to 1
  sends: Send[]
  plugins: Plugin[]
  clips: Clip[]
  height: number     // px
  frozen: boolean
  locked: boolean
  inputGain: number  // 0-2
  outputGain: number // 0-2
}

export interface AutomationPoint {
  beat: number
  value: number
}

export interface AutomationLane {
  trackId: string
  param: string
  points: AutomationPoint[]
}

export interface ProjectState {
  // Project metadata
  name: string
  filePath: string | null
  isDirty: boolean

  // Timing
  bpm: number
  key: string
  timeSignature: [number, number]
  sampleRate: 44100 | 48000 | 88200 | 96000
  bitDepth: 16 | 24 | 32
  bufferSize: 64 | 128 | 256 | 512 | 1024

  // Transport
  isPlaying: boolean
  isRecording: boolean
  isLooping: boolean
  metronomeEnabled: boolean
  metronomeVolume: number
  currentTime: number    // seconds
  loopStart: number      // beats
  loopEnd: number        // beats

  // View
  zoom: number           // pixels per beat base = 40
  pixelsPerBeat: number
  scrollLeft: number
  scrollTop: number
  selectedTrackId: string | null
  selectedClipIds: string[]
  showMixer: boolean
  showPianoRoll: boolean
  showClawbot: boolean
  activePianoRollClipId: string | null
  activePanel: 'mixer' | 'piano-roll' | 'plugins'

  // Tracks
  tracks: Track[]
  automationLanes: AutomationLane[]

  // AI
  clawbotEnabled: boolean
  aiLevel: number  // 0-100
  clawflowActive: boolean

  // Recording
  countIn: number

  // Snap
  snapEnabled: boolean
  snapValue: string

  // Inspector
  inspectorOpen: boolean

  // Undo/redo
  undoStack: Track[][]
  redoStack: Track[][]
}

const TRACK_COLORS = [
  '#a855f7', '#ec4899', '#3b82f6', '#10b981',
  '#f59e0b', '#06b6d4', '#ef4444', '#8b5cf6',
  '#14b8a6', '#f97316', '#84cc16', '#e879f9',
]

function makeTrack(name: string, type: Track['type'], idx: number): Track {
  return {
    id: `track-${Date.now()}-${idx}`,
    name,
    type,
    color: TRACK_COLORS[idx % TRACK_COLORS.length],
    muted: false,
    solo: false,
    armed: false,
    volume: 0.8,
    pan: 0,
    sends: [],
    plugins: [],
    clips: [],
    height: 80,
    frozen: false,
    locked: false,
    inputGain: 1,
    outputGain: 1,
  }
}

function defaultTracks(): Track[] {
  return [
    makeTrack('Audio 1', 'audio', 0),
    makeTrack('Audio 2', 'audio', 1),
    makeTrack('MIDI 1', 'midi', 2),
    makeTrack('Drums', 'midi', 3),
    makeTrack('Bass', 'audio', 4),
    makeTrack('Master', 'master', 11),
  ]
}

interface Actions {
  addTrack: (type: Track['type']) => void
  removeTrack: (id: string) => void
  updateTrack: (id: string, patch: Partial<Track>) => void
  duplicateTrack: (id: string) => void
  moveTrack: (fromIdx: number, toIdx: number) => void

  addClip: (clip: Clip) => void
  removeClip: (id: string) => void
  updateClip: (id: string, patch: Partial<Clip>) => void
  moveClip: (id: string, startBeat: number, trackId: string) => void
  splitClipAtBeat: (clipId: string, beat: number) => void
  duplicateClip: (id: string) => void

  addPlugin: (trackId: string, plugin: Plugin) => void
  removePlugin: (trackId: string, pluginId: string) => void
  updatePlugin: (trackId: string, pluginId: string, params: Record<string, number>) => void
  togglePlugin: (trackId: string, pluginId: string) => void

  setPlaying: (v: boolean) => void
  setRecording: (v: boolean) => void
  setBpm: (v: number) => void
  setKey: (v: string) => void
  setCurrentTime: (v: number) => void
  setLoopRange: (start: number, end: number) => void
  toggleLoop: () => void
  toggleMetronome: () => void

  setZoom: (v: number) => void
  setScrollLeft: (v: number) => void
  setScrollTop: (v: number) => void
  selectTrack: (id: string | null) => void
  selectClip: (id: string, multi?: boolean) => void
  deselectAll: () => void
  setShowMixer: (v: boolean) => void
  setShowPianoRoll: (v: boolean, clipId?: string) => void
  setShowClawbot: (v: boolean) => void
  setActivePanel: (v: ProjectState['activePanel']) => void

  setAiLevel: (v: number) => void
  setClawflowActive: (v: boolean) => void
  setCountIn: (v: number) => void
  setSnapEnabled: (v: boolean) => void
  setSnapValue: (v: string) => void
  setInspectorOpen: (v: boolean) => void

  newProject: () => void
  saveSnapshot: () => void
  undo: () => void
  redo: () => void
  setSampleRate: (v: ProjectState['sampleRate']) => void
  setBitDepth: (v: ProjectState['bitDepth']) => void
}

export const useProjectStore = create<ProjectState & Actions>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  name: 'Untitled Project',
  filePath: null,
  isDirty: false,

  bpm: 120,
  key: 'C major',
  timeSignature: [4, 4],
  sampleRate: 44100,
  bitDepth: 24,
  bufferSize: 256,

  isPlaying: false,
  isRecording: false,
  isLooping: false,
  metronomeEnabled: false,
  metronomeVolume: 0.5,
  currentTime: 0,
  loopStart: 0,
  loopEnd: 16,

  zoom: 1,
  pixelsPerBeat: 40,
  scrollLeft: 0,
  scrollTop: 0,
  selectedTrackId: null,
  selectedClipIds: [],
  showMixer: true,
  showPianoRoll: false,
  showClawbot: false,
  activePianoRollClipId: null,
  activePanel: 'mixer',

  tracks: defaultTracks(),
  automationLanes: [],

  clawbotEnabled: true,
  aiLevel: 50,
  clawflowActive: false,
  countIn: 0,
  snapEnabled: true,
  snapValue: '1/4',
  inspectorOpen: true,

  undoStack: [],
  redoStack: [],

  // ── Track actions ──────────────────────────────────────────────────────────
  addTrack: (type) => {
    const st = get()
    const nonMaster = st.tracks.filter(t => t.type !== 'master')
    const master = st.tracks.find(t => t.type === 'master')
    const newTrack = makeTrack(
      type === 'audio' ? `Audio ${nonMaster.filter(t=>t.type==='audio').length + 1}`
      : type === 'midi' ? `MIDI ${nonMaster.filter(t=>t.type==='midi').length + 1}`
      : `Bus ${nonMaster.filter(t=>t.type==='bus').length + 1}`,
      type,
      nonMaster.length
    )
    set({ tracks: [...nonMaster, newTrack, ...(master ? [master] : [])], isDirty: true })
  },

  removeTrack: (id) => set(st => ({
    tracks: st.tracks.filter(t => t.id !== id),
    selectedTrackId: st.selectedTrackId === id ? null : st.selectedTrackId,
    isDirty: true,
  })),

  updateTrack: (id, patch) => set(st => ({
    tracks: st.tracks.map(t => t.id === id ? { ...t, ...patch } : t),
    isDirty: true,
  })),

  duplicateTrack: (id) => {
    const st = get()
    const track = st.tracks.find(t => t.id === id)
    if (!track) return
    const copy: Track = { ...track, id: `track-${Date.now()}`, name: track.name + ' (copy)', clips: track.clips.map(c => ({ ...c, id: `clip-${Date.now()}-${Math.random()}` })) }
    const idx = st.tracks.indexOf(track)
    const tracks = [...st.tracks]
    tracks.splice(idx + 1, 0, copy)
    set({ tracks, isDirty: true })
  },

  moveTrack: (fromIdx, toIdx) => {
    const tracks = [...get().tracks]
    const [moved] = tracks.splice(fromIdx, 1)
    tracks.splice(toIdx, 0, moved)
    set({ tracks, isDirty: true })
  },

  // ── Clip actions ───────────────────────────────────────────────────────────
  addClip: (clip) => set(st => ({
    tracks: st.tracks.map(t => t.id === clip.trackId ? { ...t, clips: [...t.clips, clip] } : t),
    isDirty: true,
  })),

  removeClip: (id) => set(st => ({
    tracks: st.tracks.map(t => ({ ...t, clips: t.clips.filter(c => c.id !== id) })),
    selectedClipIds: st.selectedClipIds.filter(i => i !== id),
    isDirty: true,
  })),

  updateClip: (id, patch) => set(st => ({
    tracks: st.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => c.id === id ? { ...c, ...patch } : c),
    })),
    isDirty: true,
  })),

  moveClip: (id, startBeat, newTrackId) => set(st => {
    let clip: Clip | null = null
    const tracks = st.tracks.map(t => {
      const c = t.clips.find(c => c.id === id)
      if (c) { clip = c; return { ...t, clips: t.clips.filter(c => c.id !== id) } }
      return t
    })
    if (!clip) return { tracks: st.tracks }
    const theClip: Clip = clip
    const finalClip: Clip = { ...theClip, startBeat, trackId: newTrackId }
    return {
      tracks: tracks.map(t => t.id === newTrackId ? { ...t, clips: [...t.clips, finalClip] } : t),
      isDirty: true,
    }
  }),

  splitClipAtBeat: (clipId, beat) => set(st => {
    let updated = st.tracks
    for (const track of st.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (!clip) continue
      if (beat <= clip.startBeat || beat >= clip.startBeat + clip.durationBeats) break
      const left: Clip = { ...clip, id: `${clip.id}-L`, durationBeats: beat - clip.startBeat }
      const right: Clip = { ...clip, id: `${clip.id}-R`, startBeat: beat, durationBeats: clip.startBeat + clip.durationBeats - beat }
      updated = st.tracks.map(t => t.id === track.id
        ? { ...t, clips: [...t.clips.filter(c => c.id !== clipId), left, right] }
        : t)
      break
    }
    return { tracks: updated, isDirty: true }
  }),

  duplicateClip: (id) => set(st => {
    const tracks = st.tracks.map(t => {
      const clip = t.clips.find(c => c.id === id)
      if (!clip) return t
      const copy: Clip = { ...clip, id: `clip-${Date.now()}`, startBeat: clip.startBeat + clip.durationBeats }
      return { ...t, clips: [...t.clips, copy] }
    })
    return { tracks, isDirty: true }
  }),

  // ── Plugin actions ─────────────────────────────────────────────────────────
  addPlugin: (trackId, plugin) => set(st => ({
    tracks: st.tracks.map(t => t.id === trackId ? { ...t, plugins: [...t.plugins, plugin] } : t),
    isDirty: true,
  })),

  removePlugin: (trackId, pluginId) => set(st => ({
    tracks: st.tracks.map(t => t.id === trackId ? { ...t, plugins: t.plugins.filter(p => p.id !== pluginId) } : t),
    isDirty: true,
  })),

  updatePlugin: (trackId, pluginId, params) => set(st => ({
    tracks: st.tracks.map(t => t.id === trackId
      ? { ...t, plugins: t.plugins.map(p => p.id === pluginId ? { ...p, params: { ...p.params, ...params } } : p) }
      : t),
    isDirty: true,
  })),

  togglePlugin: (trackId, pluginId) => set(st => ({
    tracks: st.tracks.map(t => t.id === trackId
      ? { ...t, plugins: t.plugins.map(p => p.id === pluginId ? { ...p, enabled: !p.enabled } : p) }
      : t),
  })),

  // ── Transport ──────────────────────────────────────────────────────────────
  setPlaying: (v) => set({ isPlaying: v }),
  setRecording: (v) => set({ isRecording: v }),
  setBpm: (v) => set({ bpm: Math.max(20, Math.min(300, v)), isDirty: true }),
  setKey: (v) => set({ key: v, isDirty: true }),
  setCurrentTime: (v) => set({ currentTime: v }),
  setLoopRange: (start, end) => set({ loopStart: start, loopEnd: end }),
  toggleLoop: () => set(st => ({ isLooping: !st.isLooping })),
  toggleMetronome: () => set(st => ({ metronomeEnabled: !st.metronomeEnabled })),

  // ── View ───────────────────────────────────────────────────────────────────
  setZoom: (v) => set({ zoom: v, pixelsPerBeat: Math.max(10, Math.min(200, 40 * v)) }),
  setScrollLeft: (v) => set({ scrollLeft: Math.max(0, v) }),
  setScrollTop: (v) => set({ scrollTop: Math.max(0, v) }),
  selectTrack: (id) => set({ selectedTrackId: id }),
  selectClip: (id, multi = false) => set(st => ({
    selectedClipIds: multi
      ? st.selectedClipIds.includes(id) ? st.selectedClipIds.filter(i => i !== id) : [...st.selectedClipIds, id]
      : [id]
  })),
  deselectAll: () => set({ selectedClipIds: [], selectedTrackId: null }),
  setShowMixer: (v) => set({ showMixer: v }),
  setShowPianoRoll: (v, clipId) => set({ showPianoRoll: v, activePianoRollClipId: clipId ?? null, activePanel: v ? 'piano-roll' : 'mixer' }),
  setShowClawbot: (v) => set({ showClawbot: v }),
  setActivePanel: (v) => set({ activePanel: v }),

  // ── AI ─────────────────────────────────────────────────────────────────────
  setAiLevel: (v) => set({ aiLevel: v }),
  setClawflowActive: (v) => set({ clawflowActive: v }),
  setCountIn: (v) => set({ countIn: v }),
  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setSnapValue: (v) => set({ snapValue: v }),
  setInspectorOpen: (v) => set({ inspectorOpen: v }),

  // ── Project ────────────────────────────────────────────────────────────────
  newProject: () => set({
    name: 'Untitled Project', filePath: null, isDirty: false,
    isPlaying: false, isRecording: false, currentTime: 0,
    tracks: defaultTracks(), selectedTrackId: null, selectedClipIds: [],
    undoStack: [], redoStack: [],
  }),

  saveSnapshot: () => set(st => ({
    undoStack: [...st.undoStack.slice(-49), [...st.tracks]],
    redoStack: [],
  })),

  undo: () => set(st => {
    if (!st.undoStack.length) return st
    const prev = st.undoStack[st.undoStack.length - 1]
    return {
      ...st,
      tracks: prev,
      undoStack: st.undoStack.slice(0, -1),
      redoStack: [...st.redoStack, st.tracks.map(t => ({ ...t }))],
      isDirty: true,
    }
  }),

  redo: () => set(st => {
    if (!st.redoStack.length) return st
    const next = st.redoStack[st.redoStack.length - 1]
    return {
      ...st,
      tracks: next,
      redoStack: st.redoStack.slice(0, -1),
      undoStack: [...st.undoStack, st.tracks.map(t => ({ ...t }))],
      isDirty: true,
    }
  }),

  setSampleRate: (v) => set({ sampleRate: v }),
  setBitDepth: (v) => set({ bitDepth: v }),
}))
