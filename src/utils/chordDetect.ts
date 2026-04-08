/**
 * Chord detection from a set of MIDI pitch numbers.
 * Returns a human-readable chord name like "Cmaj7", "Dm", "G7", etc.
 * No external dependencies.
 */

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

// Interval patterns relative to root (sorted ascending, mod 12)
// Each entry: [intervalSet, suffix]
const CHORD_PATTERNS: [number[], string][] = [
  // 4-note chords first (more specific)
  [[0,4,7,11], 'maj7'],
  [[0,3,7,10], 'm7'],
  [[0,4,7,10], '7'],
  [[0,4,7,9],  '6'],
  [[0,3,7,9],  'm6'],
  [[0,4,8,10], '7#5'],
  [[0,2,7,10], '7sus2'],
  [[0,5,7,10], '7sus4'],
  [[0,3,6,10], 'm7b5'],
  [[0,4,8,11], 'maj7#5'],
  [[0,3,6,9],  'dim7'],
  [[0,4,7,14], 'add9'],   // 14 mod 12 = 2 (9th)
  [[0,3,7,14], 'madd9'],

  // 3-note chords
  [[0,4,7],    ''],       // major
  [[0,3,7],    'm'],      // minor
  [[0,4,8],    'aug'],
  [[0,3,6],    'dim'],
  [[0,5,7],    'sus4'],
  [[0,2,7],    'sus2'],
  [[0,4,6],    'b5'],

  // 2-note (dyads / power chords)
  [[0,7],      '5'],
  [[0,4],      '(no5)'],
  [[0,3],      'm(no5)'],
]

/**
 * Detect the chord name from an array of MIDI pitches.
 * @param pitches - array of MIDI pitch numbers (0-127)
 * @returns chord name string, or empty string if no match / < 2 notes
 */
export function detectChord(pitches: number[]): string {
  if (pitches.length < 2) return ''

  // Reduce to pitch classes (0-11) and deduplicate
  const classes = [...new Set(pitches.map(p => p % 12))].sort((a, b) => a - b)
  if (classes.length < 2) return ''

  // Try each possible root
  for (const root of classes) {
    const intervals = classes.map(c => (c - root + 12) % 12).sort((a, b) => a - b)

    for (const [pattern, suffix] of CHORD_PATTERNS) {
      if (intervalsMatch(intervals, pattern)) {
        return NOTE_NAMES[root] + suffix
      }
    }
  }

  // Fallback: list note names
  return classes.map(c => NOTE_NAMES[c]).join('/')
}

function intervalsMatch(actual: number[], pattern: number[]): boolean {
  if (pattern.length > actual.length) return false
  // All pattern intervals must be present in actual
  return pattern.every(p => actual.includes(p % 12))
}

/**
 * Given a beat position, find all notes that sound at that beat
 * and detect their chord.
 */
export function detectChordAtBeat(
  notes: Array<{ pitch: number; startBeat: number; durationBeats: number }>,
  beat: number,
): string {
  const active = notes
    .filter(n => n.startBeat <= beat && beat < n.startBeat + n.durationBeats)
    .map(n => n.pitch)
  return detectChord(active)
}

/**
 * Detect chord from a selection of note IDs.
 */
export function detectChordFromSelection(
  notes: Array<{ id: string; pitch: number }>,
  selectedIds: Set<string>,
): string {
  const pitches = notes.filter(n => selectedIds.has(n.id)).map(n => n.pitch)
  return detectChord(pitches)
}
