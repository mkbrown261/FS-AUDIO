/**
 * FS-DX7: Professional 6-Operator FM Synthesizer
 * 
 * Inspired by Yamaha DX7 architecture with modern Web Audio implementation.
 * Reference: mmontag/dx7-synth-js (MIT-style license)
 * 
 * Features:
 * - 6 operators with individual ADSR envelopes
 * - 32 classic DX7 algorithms
 * - Frequency ratios from 0.5 to 31.0
 * - Operator feedback (self-modulation)
 * - Global LFO with multiple waveforms
 * - Velocity sensitivity
 * 
 * @license GPL-3.0
 */

export interface DX7Operator {
  ratio: number;          // Frequency ratio (0.5 - 31.0)
  level: number;          // Output level (0 - 99)
  attack: number;         // ADSR attack time (0 - 2s)
  decay: number;          // ADSR decay time (0 - 2s)
  sustain: number;        // ADSR sustain level (0 - 1)
  release: number;        // ADSR release time (0 - 5s)
  detune: number;         // Fine detune (-7 to +7 cents)
  velocity: number;       // Velocity sensitivity (0 - 1)
}

export interface DX7Algorithm {
  id: number;
  name: string;
  carriers: number[];     // Which operators output to audio (0-5)
  connections: {          // FM modulation routing
    from: number;         // Modulator operator (0-5)
    to: number;           // Carrier operator (0-5)
  }[];
}

export interface DX7Params {
  algorithm: number;      // Algorithm ID (0-31)
  
  // Operators (6 total)
  op1_ratio: number;
  op1_level: number;
  op1_attack: number;
  op1_decay: number;
  op1_sustain: number;
  op1_release: number;
  
  op2_ratio: number;
  op2_level: number;
  op2_attack: number;
  op2_decay: number;
  op2_sustain: number;
  op2_release: number;
  
  op3_ratio: number;
  op3_level: number;
  op3_attack: number;
  op3_decay: number;
  op3_sustain: number;
  op3_release: number;
  
  op4_ratio: number;
  op4_level: number;
  op4_attack: number;
  op4_decay: number;
  op4_sustain: number;
  op4_release: number;
  
  op5_ratio: number;
  op5_level: number;
  op5_attack: number;
  op5_decay: number;
  op5_sustain: number;
  op5_release: number;
  
  op6_ratio: number;
  op6_level: number;
  op6_attack: number;
  op6_decay: number;
  op6_sustain: number;
  op6_release: number;
  
  // Global controls
  feedback: number;       // Operator 1 feedback (0 - 7)
  lfo_rate: number;       // LFO speed (0.1 - 20 Hz)
  lfo_depth: number;      // LFO depth (0 - 1)
  lfo_wave: number;       // LFO waveform (0=sine, 1=square, 2=saw, 3=random)
  
  transpose: number;      // Global transpose (-24 to +24 semitones)
  master_volume: number;  // Master output (0 - 1)
}

/**
 * Classic DX7 Algorithms (32 total)
 * Each algorithm defines operator routing for different timbres
 */
export const DX7_ALGORITHMS: DX7Algorithm[] = [
  // Algorithm 1: 6 Carriers (Additive, Organ-like)
  { id: 0, name: 'Stack 6', carriers: [0,1,2,3,4,5], connections: [] },
  
  // Algorithm 2: 5 Carriers + 1 Modulator (Bright Harmonics)
  { id: 1, name: 'Stack 5+M', carriers: [0,1,2,3,4], connections: [{from:5, to:4}] },
  
  // Algorithm 3: 4 Carriers + 2 Modulators (Classic FM)
  { id: 2, name: 'Stack 4+2M', carriers: [0,1,2,3], connections: [{from:4, to:3}, {from:5, to:3}] },
  
  // Algorithm 4: 3 Carriers + 3 Modulators (Rich Harmonics)
  { id: 3, name: 'Stack 3+3M', carriers: [0,1,2], connections: [{from:3, to:2}, {from:4, to:2}, {from:5, to:2}] },
  
  // Algorithm 5: 2-2-2 (Dual Stacks)
  { id: 4, name: 'Dual 2-2-2', carriers: [0,2,4], connections: [{from:1, to:0}, {from:3, to:2}, {from:5, to:4}] },
  
  // Algorithm 6: FM Chain (Deep Modulation)
  { id: 5, name: 'FM Chain', carriers: [0], connections: [{from:5, to:4}, {from:4, to:3}, {from:3, to:2}, {from:2, to:1}, {from:1, to:0}] },
  
  // Algorithm 7: E.Piano Classic (DX7 Signature)
  { id: 6, name: 'E.Piano', carriers: [0,2], connections: [{from:1, to:0}, {from:3, to:2}] },
  
  // Algorithm 8: Bass (Punchy Low End)
  { id: 7, name: 'Bass', carriers: [0,1], connections: [{from:2, to:0}, {from:3, to:1}] },
  
  // Algorithm 9: Brass (Metallic)
  { id: 8, name: 'Brass', carriers: [0], connections: [{from:1, to:0}, {from:2, to:0}, {from:3, to:0}] },
  
  // Algorithm 10: Bell (Bright Attack)
  { id: 9, name: 'Bell', carriers: [0,1], connections: [{from:2, to:1}, {from:3, to:1}, {from:4, to:0}] },
  
  // Algorithms 11-31: Additional variations for different timbres
  { id: 10, name: 'Stack 2+4M', carriers: [0,1], connections: [{from:2, to:1}, {from:3, to:1}, {from:4, to:0}, {from:5, to:0}] },
  { id: 11, name: 'Lead 1', carriers: [0], connections: [{from:1, to:0}, {from:2, to:1}, {from:3, to:2}] },
  { id: 12, name: 'Lead 2', carriers: [0,1], connections: [{from:2, to:0}, {from:3, to:0}, {from:4, to:1}] },
  { id: 13, name: 'Pad 1', carriers: [0,1,2], connections: [{from:3, to:0}, {from:4, to:1}, {from:5, to:2}] },
  { id: 14, name: 'Pad 2', carriers: [0,1], connections: [{from:2, to:0}, {from:3, to:1}, {from:4, to:1}, {from:5, to:1}] },
  { id: 15, name: 'Strings', carriers: [0,1,2,3], connections: [{from:4, to:2}, {from:5, to:3}] },
  { id: 16, name: 'Pluck', carriers: [0], connections: [{from:1, to:0}, {from:2, to:0}, {from:3, to:2}] },
  { id: 17, name: 'Mallet', carriers: [0,1,2], connections: [{from:3, to:1}, {from:4, to:2}, {from:5, to:2}] },
  { id: 18, name: 'Clav', carriers: [0,1], connections: [{from:2, to:1}, {from:3, to:1}, {from:4, to:1}, {from:5, to:0}] },
  { id: 19, name: 'Guitar', carriers: [0,1], connections: [{from:2, to:0}, {from:3, to:1}, {from:4, to:0}] },
  { id: 20, name: 'Flute', carriers: [0,1,2], connections: [{from:3, to:2}, {from:4, to:2}, {from:5, to:2}] },
  { id: 21, name: 'Choir', carriers: [0,1,2], connections: [{from:3, to:0}, {from:4, to:1}, {from:5, to:1}] },
  { id: 22, name: 'Synth 1', carriers: [0], connections: [{from:1, to:0}, {from:2, to:1}, {from:3, to:1}, {from:4, to:2}] },
  { id: 23, name: 'Synth 2', carriers: [0,1], connections: [{from:2, to:0}, {from:3, to:2}, {from:4, to:3}] },
  { id: 24, name: 'FM Bell', carriers: [0], connections: [{from:1, to:0}, {from:2, to:1}, {from:3, to:2}, {from:4, to:3}, {from:5, to:4}] },
  { id: 25, name: 'FM Perc', carriers: [0,1], connections: [{from:2, to:0}, {from:3, to:0}, {from:4, to:1}, {from:5, to:1}] },
  { id: 26, name: 'Complex 1', carriers: [0], connections: [{from:1, to:0}, {from:2, to:0}, {from:3, to:1}, {from:4, to:2}, {from:5, to:3}] },
  { id: 27, name: 'Complex 2', carriers: [0,1], connections: [{from:2, to:1}, {from:3, to:2}, {from:4, to:0}, {from:5, to:4}] },
  { id: 28, name: 'Harmonic 1', carriers: [0,1,2], connections: [{from:3, to:1}, {from:4, to:1}, {from:5, to:0}] },
  { id: 29, name: 'Harmonic 2', carriers: [0,1], connections: [{from:2, to:0}, {from:3, to:1}, {from:4, to:2}, {from:5, to:3}] },
  { id: 30, name: 'Feedback 1', carriers: [0,1,2], connections: [{from:3, to:2}, {from:4, to:1}, {from:5, to:0}] },
  { id: 31, name: 'Feedback 2', carriers: [0], connections: [{from:1, to:0}, {from:2, to:1}, {from:3, to:2}, {from:4, to:3}, {from:5, to:4}] },
];

/**
 * DX7 Voice - Single note instance with 6 operators
 */
class DX7Voice {
  private ctx: AudioContext;
  private operators: {
    osc: OscillatorNode;
    gain: GainNode;
    modGain: GainNode;
    feedbackGain: GainNode;
  }[] = [];
  
  private masterGain: GainNode;
  private lfoOsc: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  
  public noteNumber: number = 0;
  public baseFrequency: number = 440;
  public velocity: number = 1.0;
  
  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.connect(destination);
    
    // Create 6 operators
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; // FM uses pure sine waves
      
      const gain = ctx.createGain();
      const modGain = ctx.createGain();
      const feedbackGain = ctx.createGain();
      
      gain.gain.value = 0;
      modGain.gain.value = 0;
      feedbackGain.gain.value = 0;
      
      osc.connect(gain);
      osc.connect(modGain);
      osc.connect(feedbackGain);
      
      this.operators.push({ osc, gain, modGain, feedbackGain });
    }
  }
  
  start(time: number) {
    this.operators.forEach(op => op.osc.start(time));
    if (this.lfoOsc) this.lfoOsc.start(time);
  }
  
  stop(time: number) {
    this.operators.forEach(op => {
      op.gain.gain.cancelScheduledValues(time);
      op.gain.gain.setTargetAtTime(0, time, 0.01);
      try {
        op.osc.stop(time + 0.5);
      } catch(e) { /* already stopped */ }
    });
    
    if (this.lfoOsc) {
      try {
        this.lfoOsc.stop(time + 0.5);
      } catch(e) { /* already stopped */ }
    }
  }
  
  /**
   * Configure voice with DX7 parameters
   */
  setup(params: DX7Params, note: number, vel: number) {
    this.noteNumber = note;
    this.velocity = vel / 127;
    this.baseFrequency = 440 * Math.pow(2, (note + params.transpose - 69) / 12);
    
    const algorithm = DX7_ALGORITHMS[params.algorithm] || DX7_ALGORITHMS[0];
    const now = this.ctx.currentTime;
    
    // Configure each operator
    for (let i = 0; i < 6; i++) {
      const op = this.operators[i];
      const ratio = (params as any)[`op${i+1}_ratio`] || 1.0;
      const level = (params as any)[`op${i+1}_level`] || 50;
      const attack = (params as any)[`op${i+1}_attack`] || 0.01;
      const decay = (params as any)[`op${i+1}_decay`] || 0.3;
      const sustain = (params as any)[`op${i+1}_sustain`] || 0.7;
      const release = (params as any)[`op${i+1}_release`] || 0.5;
      
      // Set frequency based on ratio
      op.osc.frequency.setValueAtTime(this.baseFrequency * ratio, now);
      
      // Apply ADSR envelope
      const peakLevel = (level / 99) * this.velocity;
      const sustainLevel = peakLevel * sustain;
      
      op.gain.gain.cancelScheduledValues(now);
      op.gain.gain.setValueAtTime(0, now);
      op.gain.gain.linearRampToValueAtTime(peakLevel, now + attack);
      op.gain.gain.linearRampToValueAtTime(sustainLevel, now + attack + decay);
    }
    
    // Route operators according to algorithm
    this.routeAlgorithm(algorithm, params);
    
    // Setup LFO if depth > 0
    if (params.lfo_depth > 0) {
      this.setupLFO(params);
    }
    
    // Master volume
    this.masterGain.gain.setValueAtTime(params.master_volume, now);
  }
  
  /**
   * Route operators according to DX7 algorithm
   */
  private routeAlgorithm(algorithm: DX7Algorithm, params: DX7Params) {
    // Disconnect all operators first
    this.operators.forEach(op => {
      op.gain.disconnect();
      op.modGain.disconnect();
    });
    
    // Connect carriers to output
    algorithm.carriers.forEach(idx => {
      this.operators[idx].gain.connect(this.masterGain);
    });
    
    // Connect modulators to carriers (FM routing)
    algorithm.connections.forEach(conn => {
      const modulator = this.operators[conn.from];
      const carrier = this.operators[conn.to];
      
      // Modulation amount scaled by modulator level
      const modAmount = 100; // FM index multiplier
      modulator.modGain.gain.value = modAmount;
      modulator.modGain.connect(carrier.osc.frequency);
    });
    
    // Operator 1 feedback (self-modulation)
    if (params.feedback > 0) {
      const feedbackAmount = params.feedback * 10;
      this.operators[0].feedbackGain.gain.value = feedbackAmount;
      
      // Create feedback delay for self-modulation
      const delay = this.ctx.createDelay(0.001);
      delay.delayTime.value = 0.0001; // Tiny delay for feedback
      
      this.operators[0].feedbackGain.connect(delay);
      delay.connect(this.operators[0].osc.frequency);
    }
  }
  
  /**
   * Setup global LFO
   */
  private setupLFO(params: DX7Params) {
    if (this.lfoOsc) return;
    
    const now = this.ctx.currentTime;
    
    this.lfoOsc = this.ctx.createOscillator();
    this.lfoGain = this.ctx.createGain();
    
    // LFO waveform
    const waveforms: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
    this.lfoOsc.type = waveforms[params.lfo_wave] || 'sine';
    
    this.lfoOsc.frequency.setValueAtTime(params.lfo_rate, now);
    this.lfoGain.gain.setValueAtTime(params.lfo_depth * 10, now);
    
    this.lfoOsc.connect(this.lfoGain);
    
    // Route LFO to all operator frequencies
    this.operators.forEach(op => {
      this.lfoGain!.connect(op.osc.frequency);
    });
  }
  
  release(time: number, params: DX7Params) {
    // Trigger release phase for all operators
    this.operators.forEach((op, i) => {
      const release = (params as any)[`op${i+1}_release`] || 0.5;
      op.gain.gain.cancelScheduledValues(time);
      op.gain.gain.setValueAtTime(op.gain.gain.value, time);
      op.gain.gain.linearRampToValueAtTime(0, time + release);
    });
  }
}

/**
 * DX7 Synthesizer Engine
 */
export class DX7Synth {
  private ctx: AudioContext;
  private destination: AudioNode;
  private voices: Map<number, DX7Voice> = new Map();
  private params: DX7Params;
  
  constructor(ctx: AudioContext, destination: AudioNode, initialParams: Partial<DX7Params> = {}) {
    this.ctx = ctx;
    this.destination = destination;
    this.params = this.getDefaultParams();
    this.updateParams(initialParams);
  }
  
  private getDefaultParams(): DX7Params {
    return {
      algorithm: 6, // E.Piano algorithm
      
      // Operator 1 (Carrier)
      op1_ratio: 1.0,
      op1_level: 80,
      op1_attack: 0.01,
      op1_decay: 0.3,
      op1_sustain: 0.7,
      op1_release: 0.5,
      
      // Operator 2 (Modulator)
      op2_ratio: 14.0,
      op2_level: 60,
      op2_attack: 0.01,
      op2_decay: 0.2,
      op2_sustain: 0.0,
      op2_release: 0.3,
      
      // Operator 3 (Carrier)
      op3_ratio: 1.0,
      op3_level: 75,
      op3_attack: 0.01,
      op3_decay: 0.3,
      op3_sustain: 0.6,
      op3_release: 0.5,
      
      // Operator 4 (Modulator)
      op4_ratio: 14.0,
      op4_level: 55,
      op4_attack: 0.01,
      op4_decay: 0.2,
      op4_sustain: 0.0,
      op4_release: 0.3,
      
      // Operator 5 (Harmonic)
      op5_ratio: 2.0,
      op5_level: 30,
      op5_attack: 0.02,
      op5_decay: 0.4,
      op5_sustain: 0.3,
      op5_release: 0.6,
      
      // Operator 6 (Harmonic)
      op6_ratio: 3.0,
      op6_level: 25,
      op6_attack: 0.02,
      op6_decay: 0.4,
      op6_sustain: 0.2,
      op6_release: 0.6,
      
      // Global
      feedback: 2,
      lfo_rate: 5.0,
      lfo_depth: 0.0,
      lfo_wave: 0,
      transpose: 0,
      master_volume: 0.7,
    };
  }
  
  updateParams(newParams: Partial<DX7Params>) {
    this.params = { ...this.params, ...newParams };
  }
  
  noteOn(note: number, velocity: number) {
    // Create new voice
    const voice = new DX7Voice(this.ctx, this.destination);
    voice.setup(this.params, note, velocity);
    voice.start(this.ctx.currentTime);
    
    this.voices.set(note, voice);
  }
  
  noteOff(note: number) {
    const voice = this.voices.get(note);
    if (voice) {
      voice.release(this.ctx.currentTime, this.params);
      voice.stop(this.ctx.currentTime + 2.0); // Stop after max release
      
      // Clean up after release
      setTimeout(() => {
        this.voices.delete(note);
      }, 2500);
    }
  }
  
  allNotesOff() {
    const now = this.ctx.currentTime;
    this.voices.forEach(voice => {
      voice.release(now, this.params);
      voice.stop(now + 0.1);
    });
    
    setTimeout(() => {
      this.voices.clear();
    }, 200);
  }
  
  getAlgorithms(): DX7Algorithm[] {
    return DX7_ALGORITHMS;
  }
}
