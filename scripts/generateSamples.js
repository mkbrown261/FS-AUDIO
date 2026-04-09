#!/usr/bin/env node
/**
 * Generate synthetic audio samples for built-in SFZ instruments
 * This avoids bundling large sample libraries
 */

const fs = require('fs');
const path = require('path');

// WAV file writer
function writeWAV(filename, sampleRate, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * 2;
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  
  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Write samples
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
  }
  
  fs.writeFileSync(filename, buffer);
  console.log(`✓ Generated ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

// Generate 808 Kick
function generate808Kick() {
  const sampleRate = 44100;
  const duration = 1.5;
  const samples = [];
  
  for (let i = 0; i < sampleRate * duration; i++) {
    const t = i / sampleRate;
    
    // Pitch envelope (60Hz -> 40Hz)
    const pitchEnv = 60 * Math.exp(-t * 8) + 40;
    
    // Amplitude envelope
    const ampEnv = Math.exp(-t * 4);
    
    // Sine wave with pitch envelope
    const phase = 2 * Math.PI * pitchEnv * t;
    const sine = Math.sin(phase);
    
    // Add some harmonics
    const harmonic = 0.3 * Math.sin(phase * 2);
    
    samples.push((sine + harmonic) * ampEnv);
  }
  
  return samples;
}

// Generate 808 Snare
function generate808Snare() {
  const sampleRate = 44100;
  const duration = 0.3;
  const samples = [];
  
  for (let i = 0; i < sampleRate * duration; i++) {
    const t = i / sampleRate;
    
    // Tone component (200Hz)
    const tone = Math.sin(2 * Math.PI * 200 * t) * 0.5;
    
    // Noise component
    const noise = (Math.random() * 2 - 1) * 0.8;
    
    // Envelope
    const env = Math.exp(-t * 15);
    
    samples.push((tone + noise) * env);
  }
  
  return samples;
}

// Generate 808 Hi-Hat
function generate808HiHat() {
  const sampleRate = 44100;
  const duration = 0.15;
  const samples = [];
  
  for (let i = 0; i < sampleRate * duration; i++) {
    const t = i / sampleRate;
    
    // High-frequency noise
    const noise = (Math.random() * 2 - 1);
    
    // Envelope
    const env = Math.exp(-t * 25);
    
    samples.push(noise * env * 0.6);
  }
  
  return samples;
}

// Generate Electric Piano note
function generateEPiano(frequency) {
  const sampleRate = 44100;
  const duration = 3.0;
  const samples = [];
  
  for (let i = 0; i < sampleRate * duration; i++) {
    const t = i / sampleRate;
    
    // Multiple harmonics for EP sound
    const fundamental = Math.sin(2 * Math.PI * frequency * t);
    const harmonic2 = 0.5 * Math.sin(2 * Math.PI * frequency * 2 * t);
    const harmonic3 = 0.3 * Math.sin(2 * Math.PI * frequency * 3 * t);
    const harmonic4 = 0.2 * Math.sin(2 * Math.PI * frequency * 4 * t);
    
    // Bell-like envelope
    const env = Math.exp(-t * 1.5);
    
    const sample = (fundamental + harmonic2 + harmonic3 + harmonic4) * env;
    samples.push(sample * 0.5);
  }
  
  return samples;
}

// Generate Synth Bass note
function generateSynthBass(frequency) {
  const sampleRate = 44100;
  const duration = 2.0;
  const samples = [];
  
  for (let i = 0; i < sampleRate * duration; i++) {
    const t = i / sampleRate;
    
    // Sawtooth wave (rich in harmonics)
    const phase = (frequency * t) % 1.0;
    const saw = (phase * 2 - 1);
    
    // Square wave component
    const square = phase < 0.5 ? 1 : -1;
    
    // Mix
    const wave = saw * 0.7 + square * 0.3;
    
    // ADSR envelope
    let env;
    if (t < 0.01) {
      env = t / 0.01; // Attack
    } else if (t < 0.1) {
      env = 1.0 - (t - 0.01) * 0.3 / 0.09; // Decay
    } else {
      env = 0.7 * Math.exp(-(t - 0.1) * 0.8); // Sustain/Release
    }
    
    samples.push(wave * env * 0.4);
  }
  
  return samples;
}

// Main
const outputDir = path.join(__dirname, '../public/sfz-instruments/samples');

// Create samples directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🎵 Generating synthetic samples...\n');

// 808 Drums
writeWAV(path.join(outputDir, '808-kick.wav'), 44100, generate808Kick());
writeWAV(path.join(outputDir, '808-snare.wav'), 44100, generate808Snare());
writeWAV(path.join(outputDir, '808-hihat.wav'), 44100, generate808HiHat());

// Electric Piano (chromatic scale from C2 to C6)
const epNotes = [
  { name: 'C2', freq: 65.41 },
  { name: 'E2', freq: 82.41 },
  { name: 'G2', freq: 98.00 },
  { name: 'C3', freq: 130.81 },
  { name: 'E3', freq: 164.81 },
  { name: 'G3', freq: 196.00 },
  { name: 'C4', freq: 261.63 },
  { name: 'E4', freq: 329.63 },
  { name: 'G4', freq: 392.00 },
  { name: 'C5', freq: 523.25 },
  { name: 'E5', freq: 659.25 },
  { name: 'C6', freq: 1046.50 }
];

epNotes.forEach(note => {
  writeWAV(
    path.join(outputDir, `ep-${note.name.toLowerCase()}.wav`),
    44100,
    generateEPiano(note.freq)
  );
});

// Synth Bass (low notes)
const bassNotes = [
  { name: 'E1', freq: 41.20 },
  { name: 'A1', freq: 55.00 },
  { name: 'E2', freq: 82.41 },
  { name: 'A2', freq: 110.00 }
];

bassNotes.forEach(note => {
  writeWAV(
    path.join(outputDir, `bass-${note.name.toLowerCase()}.wav`),
    44100,
    generateSynthBass(note.freq)
  );
});

console.log('\n✅ Sample generation complete!');
console.log(`📁 Output: ${outputDir}`);

const totalSize = fs.readdirSync(outputDir)
  .map(f => fs.statSync(path.join(outputDir, f)).size)
  .reduce((a, b) => a + b, 0);

console.log(`💾 Total size: ${(totalSize / 1024).toFixed(1)} KB`);
