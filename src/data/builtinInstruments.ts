// Built-in SFZ Instruments
// These are pre-loaded instruments that ship with FS-AUDIO

export interface BuiltInInstrument {
  id: string
  name: string
  category: 'piano' | 'drums' | 'bass' | 'synth' | 'strings' | 'brass' | 'other'
  sfzPath: string
  description: string
}

export const BUILTIN_INSTRUMENTS: BuiltInInstrument[] = [
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
]

export function getBuiltInInstrument(id: string): BuiltInInstrument | undefined {
  return BUILTIN_INSTRUMENTS.find(i => i.id === id)
}

export function getInstrumentsByCategory(category: string): BuiltInInstrument[] {
  return BUILTIN_INSTRUMENTS.filter(i => i.category === category)
}
