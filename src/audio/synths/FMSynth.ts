/**
 * FS-AUDIO FM Synthesizer
 * 6-operator FM synthesis with DX7-style algorithms
 */

export interface FMOperator {
  ratio: number          // Frequency ratio (0.5 - 16)
  level: number          // Output level (0 - 1)
  attack: number         // Envelope attack (ms)
  decay: number          // Envelope decay (ms)
  sustain: number        // Envelope sustain (0 - 1)
  release: number        // Envelope release (ms)
  detune: number         // Fine detune (cents, -100 to +100)
  feedback: number       // Self-feedback (0 - 1, only for carriers)
}

export interface FMAlgorithm {
  id: number
  name: string
  description: string
  // Connection matrix: [mod_op][carrier_op] = amount
  // 6x6 matrix where 1 = modulation connection
  connections: number[][]
}

export interface FMSynthParams {
  algorithm: number      // 0-31 (DX7-style algorithms)
  operators: FMOperator[]
  globalDetune: number   // Global pitch (cents)
  outputLevel: number    // Master volume
  pitchEGAmount: number  // Pitch envelope amount
  lfoRate: number        // LFO speed (Hz)
  lfoAmount: number      // LFO depth
  lfoDestination: 'pitch' | 'amplitude' | 'filter'
}

// DX7-inspired algorithms (simplified to 8 for now)
export const FM_ALGORITHMS: FMAlgorithm[] = [
  {
    id: 0,
    name: 'Classic Stack',
    description: '6→5→4→3→2→1 (serial modulation)',
    connections: [
      [0,0,0,0,0,0], // Op 1 (carrier)
      [1,0,0,0,0,0], // Op 2 → 1
      [0,1,0,0,0,0], // Op 3 → 2
      [0,0,1,0,0,0], // Op 4 → 3
      [0,0,0,1,0,0], // Op 5 → 4
      [0,0,0,0,1,0], // Op 6 → 5
    ],
  },
  {
    id: 1,
    name: 'Dual Carriers',
    description: 'Two independent stacks',
    connections: [
      [0,0,0,0,0,0], // Op 1 (carrier)
      [1,0,0,0,0,0], // Op 2 → 1
      [0,1,0,0,0,0], // Op 3 → 2
      [0,0,0,0,0,0], // Op 4 (carrier)
      [0,0,0,1,0,0], // Op 5 → 4
      [0,0,0,0,1,0], // Op 6 → 5
    ],
  },
  {
    id: 2,
    name: 'Bell',
    description: 'Multiple modulators to single carrier',
    connections: [
      [0,0,0,0,0,0], // Op 1 (carrier)
      [1,0,0,0,0,0], // Op 2 → 1
      [1,0,0,0,0,0], // Op 3 → 1
      [1,0,0,0,0,0], // Op 4 → 1
      [1,0,0,0,0,0], // Op 5 → 1
      [1,0,0,0,0,0], // Op 6 → 1
    ],
  },
  {
    id: 3,
    name: 'Brass',
    description: 'Parallel carriers with shared modulators',
    connections: [
      [0,0,0,0,0,0], // Op 1 (carrier)
      [0,0,0,0,0,0], // Op 2 (carrier)
      [0,0,0,0,0,0], // Op 3 (carrier)
      [1,1,1,0,0,0], // Op 4 → 1,2,3
      [1,1,1,0,0,0], // Op 5 → 1,2,3
      [1,1,1,0,0,0], // Op 6 → 1,2,3
    ],
  },
  {
    id: 4,
    name: 'Strings',
    description: 'Detune spread with modulation',
    connections: [
      [0,0,0,0,0,0], // Op 1 (carrier)
      [0,0,0,0,0,0], // Op 2 (carrier, detuned)
      [0,0,0,0,0,0], // Op 3 (carrier, detuned)
      [1,1,1,0,0,0], // Op 4 → 1,2,3
      [1,1,1,0,0,0], // Op 5 → 1,2,3
      [0,0,0,0,0,0], // Op 6 unused
    ],
  },
  {
    id: 5,
    name: 'Additive',
    description: 'All carriers (organ-like)',
    connections: [
      [0,0,0,0,0,0], // Op 1 (carrier)
      [0,0,0,0,0,0], // Op 2 (carrier)
      [0,0,0,0,0,0], // Op 3 (carrier)
      [0,0,0,0,0,0], // Op 4 (carrier)
      [0,0,0,0,0,0], // Op 5 (carrier)
      [0,0,0,0,0,0], // Op 6 (carrier)
    ],
  },
  {
    id: 6,
    name: 'Feedback Loop',
    description: 'Carrier with feedback and modulator',
    connections: [
      [1,0,0,0,0,0], // Op 1 → self (feedback)
      [1,0,0,0,0,0], // Op 2 → 1
      [1,0,0,0,0,0], // Op 3 → 1
      [0,0,0,0,0,0], // Op 4 unused
      [0,0,0,0,0,0], // Op 5 unused
      [0,0,0,0,0,0], // Op 6 unused
    ],
  },
  {
    id: 7,
    name: 'Complex',
    description: 'Cross-modulation',
    connections: [
      [0,0,0,0,0,0], // Op 1 (carrier)
      [1,0,0,0,0,0], // Op 2 → 1
      [0,1,0,0,0,0], // Op 3 → 2
      [0,0,0,0,0,0], // Op 4 (carrier)
      [0,0,1,1,0,0], // Op 5 → 3,4
      [0,0,0,0,1,0], // Op 6 → 5
    ],
  },
]

export class FMSynth {
  private context: AudioContext
  private output: GainNode
  
  // 6 operators (oscillators)
  private operators: OscillatorNode[] = []
  private operatorGains: GainNode[] = []
  
  // Envelopes for each operator
  private envelopes: GainNode[] = []
  
  // LFO
  private lfo: OscillatorNode
  private lfoGain: GainNode
  
  // Current algorithm
  private algorithm: FMAlgorithm
  
  // Active note tracking
  private activeNotes: Map<number, {
    oscillators: OscillatorNode[]
    gains: GainNode[]
    stopTime: number
  }> = new Map()
  
  constructor(context: AudioContext) {
    this.context = context
    this.output = context.createGain()
    this.output.gain.value = 0.5
    
    // Create LFO
    this.lfo = context.createOscillator()
    this.lfo.frequency.value = 5
    this.lfo.type = 'sine'
    this.lfoGain = context.createGain()
    this.lfoGain.gain.value = 0
    this.lfo.connect(this.lfoGain)
    this.lfo.start()
    
    // Default to algorithm 0
    this.algorithm = FM_ALGORITHMS[0]
  }
  
  /**
   * Trigger a note
   */
  noteOn(midiNote: number, velocity: number, params: FMSynthParams) {
    // Stop existing note if playing
    if (this.activeNotes.has(midiNote)) {
      this.noteOff(midiNote, params)
    }
    
    const freq = this.midiToFreq(midiNote + params.globalDetune / 100)
    const now = this.context.currentTime
    
    const oscillators: OscillatorNode[] = []
    const gains: GainNode[] = []
    
    // Create 6 operators
    for (let i = 0; i < 6; i++) {
      const op = params.operators[i]
      
      // Create oscillator
      const osc = this.context.createOscillator()
      osc.type = 'sine' // FM uses sine waves
      osc.frequency.value = freq * op.ratio * Math.pow(2, op.detune / 1200)
      
      // Create envelope gain
      const envGain = this.context.createGain()
      envGain.gain.value = 0
      
      // ADSR envelope
      const attackTime = op.attack / 1000
      const decayTime = op.decay / 1000
      const releaseTime = op.release / 1000
      
      envGain.gain.setValueAtTime(0, now)
      envGain.gain.linearRampToValueAtTime(op.level * velocity, now + attackTime)
      envGain.gain.linearRampToValueAtTime(op.level * op.sustain * velocity, now + attackTime + decayTime)
      
      osc.connect(envGain)
      oscillators.push(osc)
      gains.push(envGain)
    }
    
    // Connect operators according to algorithm
    this.connectOperators(oscillators, gains, this.algorithm)
    
    // Connect to output (only carriers)
    this.connectCarriers(gains, this.algorithm)
    
    // Start all oscillators
    oscillators.forEach(osc => osc.start(now))
    
    // Store note
    this.activeNotes.set(midiNote, {
      oscillators,
      gains,
      stopTime: 0
    })
  }
  
  /**
   * Release a note
   */
  noteOff(midiNote: number, params: FMSynthParams) {
    const note = this.activeNotes.get(midiNote)
    if (!note) return
    
    const now = this.context.currentTime
    
    // Apply release envelope
    note.gains.forEach((gain, i) => {
      const op = params.operators[i]
      const releaseTime = op.release / 1000
      
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + releaseTime)
    })
    
    // Stop oscillators after release
    const maxRelease = Math.max(...params.operators.map(op => op.release / 1000))
    note.oscillators.forEach(osc => {
      osc.stop(now + maxRelease + 0.1)
    })
    
    note.stopTime = now + maxRelease + 0.1
    
    // Clean up after release
    setTimeout(() => {
      this.activeNotes.delete(midiNote)
    }, (maxRelease + 0.2) * 1000)
  }
  
  /**
   * Connect operators based on algorithm
   */
  private connectOperators(oscillators: OscillatorNode[], gains: GainNode[], algorithm: FMAlgorithm) {
    const connections = algorithm.connections
    
    for (let mod = 0; mod < 6; mod++) {
      for (let carrier = 0; carrier < 6; carrier++) {
        if (connections[mod][carrier] > 0) {
          // Modulator → Carrier frequency
          if (mod === carrier) {
            // Self-feedback
            const feedbackGain = this.context.createGain()
            feedbackGain.gain.value = 0.5
            gains[mod].connect(feedbackGain)
            feedbackGain.connect(oscillators[carrier].frequency)
          } else {
            // Cross-modulation
            const modGain = this.context.createGain()
            modGain.gain.value = 100 // FM index
            gains[mod].connect(modGain)
            modGain.connect(oscillators[carrier].frequency)
          }
        }
      }
    }
  }
  
  /**
   * Connect carrier operators to output
   */
  private connectCarriers(gains: GainNode[], algorithm: FMAlgorithm) {
    // An operator is a carrier if it's not modulating anyone else
    // or if it's in the output chain
    for (let i = 0; i < 6; i++) {
      let isCarrier = true
      
      // Check if this operator modulates others
      for (let j = 0; j < 6; j++) {
        if (i !== j && algorithm.connections[i][j] > 0) {
          isCarrier = false
          break
        }
      }
      
      if (isCarrier) {
        gains[i].connect(this.output)
      }
    }
  }
  
  /**
   * Update algorithm
   */
  setAlgorithm(algorithmId: number) {
    if (algorithmId >= 0 && algorithmId < FM_ALGORITHMS.length) {
      this.algorithm = FM_ALGORITHMS[algorithmId]
    }
  }
  
  /**
   * MIDI to frequency conversion
   */
  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12)
  }
  
  /**
   * Connect to destination
   */
  connect(destination: AudioNode) {
    this.output.connect(destination)
  }
  
  /**
   * Disconnect all
   */
  disconnect() {
    this.output.disconnect()
    this.lfo.stop()
    
    // Stop all active notes
    this.activeNotes.forEach(note => {
      note.oscillators.forEach(osc => osc.stop())
    })
    this.activeNotes.clear()
  }
}
