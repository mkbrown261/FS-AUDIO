// Built-in SFZ Instruments for FS-AUDIO

export type InstrumentCategory = 'piano' | 'drums' | 'bass' | 'guitar' | 'synth' | 'strings' | 'other'

export interface BuiltInInstrument {
  id: string
  name: string
  category: InstrumentCategory
  description: string
  sfzPath: string            // path to .sfz file served by Vite/Electron
  samplesBaseUrl: string     // base URL for sample files (local or remote)
  /** approx MB to download on first use; 0 = already bundled */
  downloadSizeMb: number
  /** true = samples are bundled in /public, no download needed */
  bundled: boolean
  /** GitHub raw URL root for streaming/caching samples */
  remoteBaseUrl?: string
}

const GITHUB_RAW = 'https://raw.githubusercontent.com/lotkey/free-sample-libraries-sfz/main'

export const BUILTIN_INSTRUMENTS: BuiltInInstrument[] = [
  // ── Bundled (generated, no download) ───────────────────────────────────
  {
    id: 'electric-piano',
    name: 'Electric Piano',
    category: 'piano',
    description: 'Rhodes-style electric piano — bundled, no download',
    sfzPath: '/sfz-instruments/electric-piano.sfz',
    samplesBaseUrl: '/sfz-instruments',
    downloadSizeMb: 0,
    bundled: true,
  },
  {
    id: '808-drums',
    name: '808 Drums',
    category: 'drums',
    description: 'Classic TR-808 drum machine — bundled, no download',
    sfzPath: '/sfz-instruments/808-drums.sfz',
    samplesBaseUrl: '/sfz-instruments',
    downloadSizeMb: 0,
    bundled: true,
  },
  {
    id: 'synth-bass',
    name: 'Synth Bass',
    category: 'bass',
    description: 'Analog-style synth bass — bundled, no download',
    sfzPath: '/sfz-instruments/synth-bass.sfz',
    samplesBaseUrl: '/sfz-instruments',
    downloadSizeMb: 0,
    bundled: true,
  },

  // ── Real recorded instruments (download on first use, cached forever) ──
  {
    id: 'schecter-bass',
    name: 'Schecter Bass',
    category: 'bass',
    description: 'Real Schecter Elite-5 bass • EMG HZ pickups • recorded direct — downloads ~105 MB once',
    sfzPath: '/sfz-instruments/schecter-bass.sfz',
    samplesBaseUrl: '',   // filled at runtime from remoteBaseUrl + cache
    downloadSizeMb: 105,
    bundled: false,
    remoteBaseUrl: `${GITHUB_RAW}/bass`,
  },
  {
    id: 'guitar-humbucker',
    name: 'Baritone Guitar (Humbucker)',
    category: 'guitar',
    description: 'Fender Baritone Strat • Dimarzio D-Activator humbucker • high-gain metal — downloads ~143 MB once',
    sfzPath: '/sfz-instruments/guitar-humbucker.sfz',
    samplesBaseUrl: '',
    downloadSizeMb: 143,
    bundled: false,
    remoteBaseUrl: `${GITHUB_RAW}/guitar/humbucker`,
  },
  {
    id: 'guitar-splitcoil',
    name: 'Baritone Guitar (Split Coil)',
    category: 'guitar',
    description: 'Fender Baritone Strat • North coil split • brighter high-gain tone — downloads ~143 MB once',
    sfzPath: '/sfz-instruments/guitar-splitcoil.sfz',
    samplesBaseUrl: '',
    downloadSizeMb: 143,
    bundled: false,
    remoteBaseUrl: `${GITHUB_RAW}/guitar/split`,
  },
]

export function getBuiltInInstrument(id: string): BuiltInInstrument | undefined {
  return BUILTIN_INSTRUMENTS.find(i => i.id === id)
}

export function getInstrumentsByCategory(category: InstrumentCategory): BuiltInInstrument[] {
  return BUILTIN_INSTRUMENTS.filter(i => i.category === category)
}

/** All filenames referenced by the bass SFZ */
export const SCHECTER_BASS_SAMPLES = [
  'G#0_1_1.wav','G#0_2_1.wav','G#0_3_1.wav','G#0_4_1.wav',
  'G#0_1_2.wav','G#0_2_2.wav','G#0_3_2.wav','G#0_4_2.wav',
  'D#1_1_1.wav','D#1_2_1.wav','D#1_3_1.wav','D#1_4_1.wav',
  'D#1_1_2.wav','D#1_2_2.wav','D#1_3_2.wav','D#1_4_2.wav',
  'G#1_1_1.wav','G#1_2_1.wav','G#1_3_1.wav','G#1_4_1.wav',
  'G#1_1_2.wav','G#1_2_2.wav','G#1_3_2.wav','G#1_4_2.wav',
  'C#2_1_1.wav','C#2_2_1.wav','C#2_3_1.wav','C#2_4_1.wav',
  'C#2_1_2.wav','C#2_2_2.wav','C#2_3_2.wav','C#2_4_2.wav',
  'F2_1_1.wav', 'F2_2_1.wav', 'F2_3_1.wav', 'F2_4_1.wav',
  'F2_1_2.wav', 'F2_2_2.wav', 'F2_3_2.wav', 'F2_4_2.wav',
]
