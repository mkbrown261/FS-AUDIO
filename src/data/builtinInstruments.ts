// Built-in SFZ Instruments
// These are pre-loaded instruments that ship with FS-AUDIO

export interface BuiltInInstrument {
  id: string
  name: string
  category: 'piano' | 'drums' | 'bass' | 'guitar' | 'synth' | 'strings' | 'brass' | 'other'
  sfzPath: string
  description: string
}

export const BUILTIN_INSTRUMENTS: BuiltInInstrument[] = [
  // ── Synthesized (generated, ~4MB total) ─────────────────────────────────
  {
    id: '808-drums',
    name: '808 Drums',
    category: 'drums',
    sfzPath: '/sfz-instruments/808-drums.sfz',
    description: 'Classic TR-808 drum machine sounds'
  },
  {
    id: 'electric-piano',
    name: 'Electric Piano',
    category: 'piano',
    sfzPath: '/sfz-instruments/electric-piano.sfz',
    description: 'Rhodes-style electric piano'
  },
  {
    id: 'synth-bass',
    name: 'Synth Bass',
    category: 'bass',
    sfzPath: '/sfz-instruments/synth-bass.sfz',
    description: 'Analog synthesizer bass'
  },
  // ── Real recorded instruments (from lotkey/free-sample-libraries-sfz) ────
  {
    id: 'schecter-bass',
    name: 'Schecter Bass',
    category: 'bass',
    sfzPath: '/sfz-instruments/schecter-bass.sfz',
    description: 'Real Schecter Elite-5 bass · 4 round-robin · 2 velocity layers'
  },
  {
    id: 'guitar-humbucker',
    name: 'Guitar (Humbucker)',
    category: 'guitar',
    sfzPath: '/sfz-instruments/guitar-humbucker.sfz',
    description: 'Baritone Strat, Dimarzio humbucker · vel 0-32 muted, 64+ open'
  },
  {
    id: 'guitar-splitcoil',
    name: 'Guitar (Split Coil)',
    category: 'guitar',
    sfzPath: '/sfz-instruments/guitar-splitcoil.sfz',
    description: 'Baritone Strat, coil split · vel 0-32 muted, 64+ open · brighter'
  },
]

export function getBuiltInInstrument(id: string): BuiltInInstrument | undefined {
  return BUILTIN_INSTRUMENTS.find(i => i.id === id)
}

export function getInstrumentsByCategory(category: string): BuiltInInstrument[] {
  return BUILTIN_INSTRUMENTS.filter(i => i.category === category)
}
