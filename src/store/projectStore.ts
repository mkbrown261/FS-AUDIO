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
  type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'limiter' | 'chorus' | 'distortion' | 'vst' | 'saturation' | 'bus_compressor' | 'spacetime' | 'transient' | 'expander' | 'exciter' | 'tape' | 'stereo_width' | 'sub_enhancer' | 'noise_gate' | 'pitch_correct' | 'parallel_comp' | 'granular' | 'vibrato'
    // Flowstate Pro Suite
    | 'fs_proq' | 'fs_resonance' | 'fs_vintage_verb' | 'fs_echo' | 'fs_tuner'
    | 'fs_mastering' | 'fs_spacer' | 'fs_peak_limiter' | 'fs_alter' | 'fs_glitch'
    | 'fs_wavetable' | 'fs_multiband_comp' | 'fs_tape_delay' | 'fs_vocal_enhance' | 'fs_dimension'
    // AI Plugin Suite
    | 'fs_oracle' | 'fs_clone' | 'fs_architect' | 'fs_phantom' | 'fs_nerve' | 'fs_bpmfinder'
    // Experimental AI Suite
    | 'fs_ghost' | 'fs_prophet' | 'fs_void' | 'fs_alchemy'
    // Instrument Plugins
    | 'fs_analog' | 'fs_sampler'
  enabled: boolean
  params: Record<string, number | string>  // Allow string for waveform types, etc.
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
  fadeInCurve: 'linear' | 'exp' | 's-curve'  // fade curve type
  fadeOutCurve: 'linear' | 'exp' | 's-curve'
  looped: boolean
  muted: boolean
  color?: string
  aiGenerated: boolean
  waveformPeaks?: number[]
  // Crossfade: if set, this clip overlaps with the previous clip by this many beats
  crossfadeBeats?: number
  // Flex Time — non-destructive time stretch (1.0 = no change, 0.5 = half speed, 2.0 = double speed)
  flexRate?: number
  // Flex Pitch — semitone pitch shift without affecting tempo (-24 to +24)
  pitchShift?: number
  // Take folder — which take is active (-1 = not a take-folder clip)
  takeIndex?: number
  // Take folder clips (comp system)
  takes?: Take[]
  activeTakeIndex?: number
}

export interface Take {
  id: string
  name: string
  audioUrl: string
  waveformPeaks?: number[]
  gain?: number
}

export interface Track {
  // Take-folder flag — if true, this track shows takes/comp UI
  isTakeFolder?: boolean
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
  frozenAudioUrl?: string   // URL to pre-rendered frozen audio
  locked: boolean
  inputGain: number  // 0-2
  outputGain: number // 0-2
}

export interface AutomationPoint {
  beat: number
  value: number
}

export type AutomationCurve = 'linear' | 'smooth' | 'step'

export interface AutomationLane {
  id: string
  trackId: string
  /** e.g. 'volume', 'pan', 'eq-low', 'reverb', 'delay' */
  param: string
  label: string
  /** 0–1 normalized range */
  minValue: number
  maxValue: number
  defaultValue: number
  curve: AutomationCurve
  visible: boolean
  points: AutomationPoint[]
}

// Tool modes — matching Logic Pro's toolbox
export type EditTool = 'pointer' | 'scissors' | 'glue' | 'fade' | 'zoom' | 'mute' | 'marquee' | 'pencil'

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
  activePanel: 'mixer' | 'piano-roll' | 'plugins' | 'midi' | 'automation'

  // Tool mode
  activeTool: EditTool

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

  // Plugin windows
  openPluginWindows: Set<string> // Set of plugin IDs with open windows

  // Audio device preferences
  audioInputDeviceId: string   // '' = default
  audioOutputDeviceId: string  // '' = default
  audioLatencyHint: 'interactive' | 'balanced' | 'playback'

  // Clipboard
  clipboardClip: Clip | null

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

  // Fade actions
  setClipFadeIn: (clipId: string, fadeBeats: number) => void
  setClipFadeOut: (clipId: string, fadeBeats: number) => void
  setClipCrossfade: (clipId: string, xfadeBeats: number) => void
  applyFadeInToSelected: () => void
  applyFadeOutToSelected: () => void

  // Glue (join adjacent clips)
  glueClips: (clipIds: string[]) => void

  // Flex Time — set non-destructive stretch rate on a clip
  setClipFlexRate: (clipId: string, rate: number) => void

  // Track Freeze — freeze/unfreeze; frozenAudioUrl is set by the engine after offline render
  freezeTrack: (trackId: string, frozenAudioUrl?: string) => void
  unfreezeTrack: (trackId: string) => void

  // Take folders
  addTakeToClip: (clipId: string, take: Take) => void
  setActiveTake: (clipId: string, takeIndex: number) => void
  deleteTake: (clipId: string, takeIndex: number) => void

  // Send routing
  addSend: (trackId: string, busId: string) => void
  removeSend: (trackId: string, sendId: string) => void
  updateSendLevel: (trackId: string, sendId: string, level: number) => void
  toggleSendPreFader: (trackId: string, sendId: string) => void

  // Automation lanes
  addAutomationLane: (lane: Omit<AutomationLane, 'id' | 'points' | 'visible'>) => void
  removeAutomationLane: (laneId: string) => void
  addAutomationPoint: (laneId: string, point: AutomationPoint) => void
  removeAutomationPoint: (laneId: string, beat: number) => void
  updateAutomationPoint: (laneId: string, beat: number, value: number) => void
  setAutomationCurve: (laneId: string, curve: AutomationCurve) => void
  toggleAutomationLane: (laneId: string) => void

  addPlugin: (trackId: string, plugin: Plugin) => void
  removePlugin: (trackId: string, pluginId: string) => void
  updatePlugin: (trackId: string, pluginId: string, params: Record<string, number | string>) => void
  togglePlugin: (trackId: string, pluginId: string) => void
  openPluginWindow: (pluginId: string) => void
  closePluginWindow: (pluginId: string) => void

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
  setActivePanel: (v: 'mixer' | 'piano-roll' | 'plugins' | 'midi' | 'automation') => void
  setActiveTool: (tool: EditTool) => void

  setAiLevel: (v: number) => void
  setClawflowActive: (v: boolean) => void
  setCountIn: (v: number) => void
  setSnapEnabled: (v: boolean) => void
  setSnapValue: (v: string) => void
  setInspectorOpen: (v: boolean) => void
  setClipboardClip: (clip: Clip | null) => void
  pasteClip: (atBeat: number) => void

  newProject: () => void
  saveProject: () => void
  loadProject: () => void
  setTimeSignature: (num: number, den: number) => void
  setBufferSize: (v: ProjectState['bufferSize']) => void
  setAudioInputDevice: (id: string) => void
  setAudioOutputDevice: (id: string) => void
  setAudioLatencyHint: (v: ProjectState['audioLatencyHint']) => void
  setMetronomeVolume: (v: number) => void
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
  activeTool: 'pointer',

  tracks: defaultTracks(),
  automationLanes: [],

  clawbotEnabled: true,
  aiLevel: 50,
  clawflowActive: false,
  countIn: 0,
  snapEnabled: true,
  snapValue: '1/4',
  inspectorOpen: true,
  openPluginWindows: new Set(),

  audioInputDeviceId: '',
  audioOutputDeviceId: '',
  audioLatencyHint: 'interactive',

  clipboardClip: null,

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
    console.log('[splitClipAtBeat] Starting split. clipId:', clipId, 'beat:', beat)
    let updated = st.tracks
    for (const track of st.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (!clip) continue
      
      console.log('[splitClipAtBeat] Found clip:', clip.id, 'startBeat:', clip.startBeat, 'duration:', clip.durationBeats)
      console.log('[splitClipAtBeat] Track has', track.clips.length, 'clips before split')
      
      if (beat <= clip.startBeat || beat >= clip.startBeat + clip.durationBeats) {
        console.log('[splitClipAtBeat] Beat outside clip range, aborting')
        break
      }
      
      const splitOffset = beat - clip.startBeat
      const leftId = `${clip.id}-L-${Date.now()}`
      const rightId = `${clip.id}-R-${Date.now()}`
      
      const left: Clip = { ...clip, id: leftId, durationBeats: splitOffset, fadeOut: 0, crossfadeBeats: 0 }
      const right: Clip = {
        ...clip, id: rightId,
        startBeat: beat,
        durationBeats: clip.startBeat + clip.durationBeats - beat,
        fadeIn: 0, crossfadeBeats: 0,
      }
      
      console.log('[splitClipAtBeat] Creating left clip:', leftId, 'duration:', left.durationBeats)
      console.log('[splitClipAtBeat] Creating right clip:', rightId, 'start:', right.startBeat, 'duration:', right.durationBeats)
      
      const oldClips = track.clips.filter(c => c.id !== clipId)
      console.log('[splitClipAtBeat] After filtering out', clipId, 'remaining clips:', oldClips.length)
      
      // Create new track with split clips
      const updatedTrack = { ...track, clips: [...oldClips, left, right] }
      updated = updated.map(t => t.id === track.id ? updatedTrack : t)
      
      console.log('[splitClipAtBeat] Track now has', updatedTrack.clips.length, 'clips')
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

  // ── Fade actions ───────────────────────────────────────────────────────────
  setClipFadeIn: (clipId, fadeBeats) => set(st => ({
    tracks: st.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => c.id === clipId
        ? { ...c, fadeIn: Math.max(0, Math.min(fadeBeats, c.durationBeats * 0.9)) }
        : c),
    })),
    isDirty: true,
  })),

  setClipFadeOut: (clipId, fadeBeats) => set(st => ({
    tracks: st.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => c.id === clipId
        ? { ...c, fadeOut: Math.max(0, Math.min(fadeBeats, c.durationBeats * 0.9)) }
        : c),
    })),
    isDirty: true,
  })),

  setClipCrossfade: (clipId, xfadeBeats) => set(st => ({
    tracks: st.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => c.id === clipId
        ? { ...c, crossfadeBeats: Math.max(0, xfadeBeats) }
        : c),
    })),
    isDirty: true,
  })),

  applyFadeInToSelected: () => {
    const st = get()
    for (const id of st.selectedClipIds) {
      get().setClipFadeIn(id, 1) // default 1 beat
    }
  },

  applyFadeOutToSelected: () => {
    const st = get()
    for (const id of st.selectedClipIds) {
      get().setClipFadeOut(id, 1)
    }
  },

  // ── Glue adjacent clips ───────────────────────────────────────────────────
  glueClips: (clipIds) => set(st => {
    if (clipIds.length < 2) return st
    // Find track and clips
    for (const track of st.tracks) {
      const clips = track.clips.filter(c => clipIds.includes(c.id))
      if (clips.length < 2) continue
      const sorted = [...clips].sort((a, b) => a.startBeat - b.startBeat)
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const totalDuration = (last.startBeat + last.durationBeats) - first.startBeat
      const glued: Clip = {
        ...first,
        id: `clip-glue-${Date.now()}`,
        durationBeats: totalDuration,
        name: first.name + ' (glued)',
        fadeIn: first.fadeIn,
        fadeOut: last.fadeOut,
      }
      const updated = track.clips.filter(c => !clipIds.includes(c.id))
      updated.push(glued)
      return {
        tracks: st.tracks.map(t => t.id === track.id ? { ...t, clips: updated } : t),
        selectedClipIds: [glued.id],
        isDirty: true,
      }
    }
    return st
  }),

  // ── Flex Time ─────────────────────────────────────────────────────────────
  setClipFlexRate: (clipId, rate) => set(st => ({
    tracks: st.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => c.id === clipId
        ? { ...c, flexRate: Math.max(0.25, Math.min(4, rate)) }
        : c),
    })),
    isDirty: true,
  })),

  // ── Track Freeze ─────────────────────────────────────────────────────────
  freezeTrack: (trackId, frozenAudioUrl) => set(st => ({
    tracks: st.tracks.map(t => t.id === trackId
      ? { ...t, frozen: true, frozenAudioUrl: frozenAudioUrl ?? t.frozenAudioUrl }
      : t),
    isDirty: true,
  })),
  unfreezeTrack: (trackId) => set(st => ({
    tracks: st.tracks.map(t => t.id === trackId
      ? { ...t, frozen: false, frozenAudioUrl: undefined }
      : t),
    isDirty: true,
  })),

  // ── Take folder actions ───────────────────────────────────────────────────
  addTakeToClip: (clipId, take) => set(st => ({
    tracks: st.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id !== clipId) return c
        const takes = [...(c.takes ?? []), take]
        return { ...c, takes, activeTakeIndex: takes.length - 1 }
      }),
    })),
    isDirty: true,
  })),
  setActiveTake: (clipId, takeIndex) => set(st => ({
    tracks: st.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id !== clipId) return c
        const takes = c.takes ?? []
        if (takeIndex < 0 || takeIndex >= takes.length) return c
        const activeTake = takes[takeIndex]
        return {
          ...c,
          activeTakeIndex: takeIndex,
          audioUrl: activeTake.audioUrl,
          waveformPeaks: activeTake.waveformPeaks,
          gain: activeTake.gain ?? c.gain,
        }
      }),
    })),
    isDirty: true,
  })),
  deleteTake: (clipId, takeIndex) => set(st => ({
    tracks: st.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id !== clipId) return c
        const takes = (c.takes ?? []).filter((_, i) => i !== takeIndex)
        const newActive = Math.min(c.activeTakeIndex ?? 0, takes.length - 1)
        return { ...c, takes, activeTakeIndex: newActive >= 0 ? newActive : undefined }
      }),
    })),
    isDirty: true,
  })),

  // ── Send routing ─────────────────────────────────────────────────────────
  addSend: (trackId, busId) => set(st => ({
    tracks: st.tracks.map(t => {
      if (t.id !== trackId) return t
      // Don't add duplicate sends to same bus
      if (t.sends.some(s => s.busId === busId)) return t
      const send: Send = {
        id: `send-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        busId,
        level: 1,
        preFader: false,
      }
      return { ...t, sends: [...t.sends, send] }
    }),
    isDirty: true,
  })),

  removeSend: (trackId, sendId) => set(st => ({
    tracks: st.tracks.map(t =>
      t.id !== trackId ? t : { ...t, sends: t.sends.filter(s => s.id !== sendId) }
    ),
    isDirty: true,
  })),

  updateSendLevel: (trackId, sendId, level) => set(st => ({
    tracks: st.tracks.map(t =>
      t.id !== trackId ? t : {
        ...t,
        sends: t.sends.map(s => s.id === sendId ? { ...s, level: Math.max(0, Math.min(1, level)) } : s),
      }
    ),
    isDirty: true,
  })),

  toggleSendPreFader: (trackId, sendId) => set(st => ({
    tracks: st.tracks.map(t =>
      t.id !== trackId ? t : {
        ...t,
        sends: t.sends.map(s => s.id === sendId ? { ...s, preFader: !s.preFader } : s),
      }
    ),
    isDirty: true,
  })),

  // ── Automation Lane actions ────────────────────────────────────────────────
  addAutomationLane: (laneDef) => set(st => ({
    automationLanes: [
      ...st.automationLanes,
      { ...laneDef, id: `al-${Date.now()}-${Math.random().toString(36).slice(2)}`, points: [], visible: true },
    ],
    isDirty: true,
  })),

  removeAutomationLane: (laneId) => set(st => ({
    automationLanes: st.automationLanes.filter(l => l.id !== laneId),
    isDirty: true,
  })),

  addAutomationPoint: (laneId, point) => set(st => ({
    automationLanes: st.automationLanes.map(l => {
      if (l.id !== laneId) return l
      // Insert sorted by beat, replacing any existing point at same beat
      const filtered = l.points.filter(p => Math.abs(p.beat - point.beat) > 0.01)
      const pts = [...filtered, point].sort((a, b) => a.beat - b.beat)
      return { ...l, points: pts }
    }),
    isDirty: true,
  })),

  removeAutomationPoint: (laneId, beat) => set(st => ({
    automationLanes: st.automationLanes.map(l =>
      l.id !== laneId ? l : { ...l, points: l.points.filter(p => Math.abs(p.beat - beat) > 0.01) }
    ),
    isDirty: true,
  })),

  updateAutomationPoint: (laneId, beat, value) => set(st => ({
    automationLanes: st.automationLanes.map(l =>
      l.id !== laneId ? l : {
        ...l,
        points: l.points.map(p => Math.abs(p.beat - beat) <= 0.01 ? { ...p, value } : p),
      }
    ),
    isDirty: true,
  })),

  setAutomationCurve: (laneId, curve) => set(st => ({
    automationLanes: st.automationLanes.map(l => l.id !== laneId ? l : { ...l, curve }),
    isDirty: true,
  })),

  toggleAutomationLane: (laneId) => set(st => ({
    automationLanes: st.automationLanes.map(l => l.id !== laneId ? l : { ...l, visible: !l.visible }),
    isDirty: true,
  })),

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

  openPluginWindow: (pluginId) => set(st => ({
    openPluginWindows: new Set(st.openPluginWindows).add(pluginId),
  })),

  closePluginWindow: (pluginId) => set(st => {
    const newSet = new Set(st.openPluginWindows)
    newSet.delete(pluginId)
    return { openPluginWindows: newSet }
  }),

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
  setActiveTool: (tool) => set({ activeTool: tool }),

  // ── AI ─────────────────────────────────────────────────────────────────────
  setAiLevel: (v) => set({ aiLevel: v }),
  setClawflowActive: (v) => set({ clawflowActive: v }),
  setCountIn: (v) => set({ countIn: v }),
  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setSnapValue: (v) => set({ snapValue: v }),
  setInspectorOpen: (v) => set({ inspectorOpen: v }),
  setClipboardClip: (clip) => set({ clipboardClip: clip }),

  pasteClip: (atBeat) => {
    const st = get()
    const src = st.clipboardClip
    if (!src) return
    // Paste onto the selected track, or the clipboard clip's original track
    const targetTrackId = st.selectedTrackId ?? src.trackId
    const track = st.tracks.find(t => t.id === targetTrackId)
    if (!track) return
    get().saveSnapshot()
    const pasted: Clip = {
      ...src,
      id: `clip-paste-${Date.now()}`,
      trackId: targetTrackId,
      startBeat: atBeat,
    }
    set(s => ({
      tracks: s.tracks.map(t => t.id === targetTrackId
        ? { ...t, clips: [...t.clips, pasted] }
        : t),
      selectedClipIds: [pasted.id],
      isDirty: true,
    }))
  },

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
  setBufferSize: (v) => set({ bufferSize: v }),
  setAudioInputDevice: (id) => set({ audioInputDeviceId: id }),
  setAudioOutputDevice: (id) => set({ audioOutputDeviceId: id }),
  setAudioLatencyHint: (v) => set({ audioLatencyHint: v }),
  setMetronomeVolume: (v) => set({ metronomeVolume: Math.max(0, Math.min(1, v)) }),

  setTimeSignature: (num, den) => set({ timeSignature: [num, den], isDirty: true }),

  // ── Persist project to localStorage as JSON ────────────────────────────────
  saveProject: () => {
    const st = get()
    const projectName = st.name.trim() || 'Untitled Project'
    const snapshot = {
      _version: 1,
      name: projectName,
      bpm: st.bpm,
      key: st.key,
      timeSignature: st.timeSignature,
      sampleRate: st.sampleRate,
      bitDepth: st.bitDepth,
      loopStart: st.loopStart,
      loopEnd: st.loopEnd,
      isLooping: st.isLooping,
      metronomeEnabled: st.metronomeEnabled,
      zoom: st.zoom,
      // Serialize tracks — omit AudioBuffer (not serializable), keep metadata + midiNotes
      tracks: st.tracks.map(t => ({
        ...t,
        clips: t.clips.map(c => ({
          ...c,
          audioBuffer: undefined,   // never serializable
        })),
      })),
    }
    const key = `fs-audio-project-${projectName}`
    localStorage.setItem(key, JSON.stringify(snapshot))
    localStorage.setItem('fs-audio-last-project', key)
    set({ isDirty: false })
    // Trigger a save-confirm flash by briefly touching the name
    console.info(`[FS-AUDIO] Project saved to localStorage: ${key}`)
  },

  // ── Load project from localStorage ────────────────────────────────────────
  loadProject: () => {
    // Show a prompt listing available saves
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('fs-audio-project-')) keys.push(k)
    }
    if (keys.length === 0) {
      alert('No saved projects found.\n\nSave a project first with ⌘S.')
      return
    }
    const names = keys.map(k => k.replace('fs-audio-project-', ''))
    const choice = prompt(
      `Load project:\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\nEnter number or name:`,
      '1'
    )
    if (!choice) return
    const idx = parseInt(choice) - 1
    const selectedKey = (idx >= 0 && idx < keys.length) ? keys[idx]
      : keys.find(k => k === `fs-audio-project-${choice}`)
    if (!selectedKey) { alert('Project not found.'); return }
    try {
      const raw = localStorage.getItem(selectedKey)
      if (!raw) { alert('Save data is empty or corrupted.'); return }
      const data = JSON.parse(raw)
      set({
        name: data.name ?? 'Loaded Project',
        bpm: data.bpm ?? 120,
        key: data.key ?? 'C major',
        timeSignature: data.timeSignature ?? [4, 4],
        sampleRate: data.sampleRate ?? 44100,
        bitDepth: data.bitDepth ?? 24,
        loopStart: data.loopStart ?? 0,
        loopEnd: data.loopEnd ?? 16,
        isLooping: data.isLooping ?? false,
        metronomeEnabled: data.metronomeEnabled ?? false,
        zoom: data.zoom ?? 1,
        pixelsPerBeat: (data.zoom ?? 1) * 40,
        tracks: data.tracks ?? defaultTracks(),
        isDirty: false,
        isPlaying: false,
        isRecording: false,
        currentTime: 0,
        selectedClipIds: [],
        selectedTrackId: null,
        undoStack: [],
        redoStack: [],
      })
      console.info(`[FS-AUDIO] Project loaded: ${data.name}`)
    } catch (err) {
      alert('Failed to load project — data may be corrupted.')
      console.error('[FS-AUDIO] Load error:', err)
    }
  },
}))
