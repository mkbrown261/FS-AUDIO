# Open-Source MIDI Instruments Implementation Plan

## ✅ License Research & Compatibility Analysis

### 🎹 Instruments Selected for Implementation

| Instrument | License | Web Audio Compatible | Status |
|------------|---------|---------------------|--------|
| **Dexed (DX7 FM Synth)** | GPL-3.0 | ✅ YES (JavaScript port exists) | 🟢 READY |
| **Vital (Wavetable Synth)** | GPL-3.0 | ✅ YES (base exists, enhance) | 🟡 ENHANCE |
| **Sfizz (SFZ Sampler)** | BSD-2-Clause | ✅ YES (WebAssembly port exists) | 🟢 READY |
| **SetBFree (Hammond Organ)** | GPL-2.0 | ⚠️ PARTIAL (reimplement core) | 🟡 REIMPLEMENT |
| **DrumGizmo** | GPL-3.0 | ⚠️ PARTIAL (enhance FS-Sampler) | 🟡 ENHANCE |

### ❌ Instruments NOT Implemented (Incompatible)

| Instrument | Reason |
|------------|--------|
| **Surge XT** | Too heavy for Web Audio (C++ only, no WASM port) |
| **Odin2** | C++ only, no Web Audio port |
| **ZynAddSubFX** | GPL-2.0 but extremely complex, no practical Web Audio port |
| **VCV Rack** | GPL-3.0 but entire modular environment (impractical for DAW plugin) |

---

## 🎯 Implementation Strategy

### Phase 1: Core Synthesizers (HIGH PRIORITY)
1. **FS-DX7** - Dexed-inspired FM Synthesizer
   - 6-operator FM synthesis
   - 32 classic DX7 algorithms
   - Per-operator ADSR envelopes
   - LFO with multiple waveforms
   - Reference: https://github.com/mmontag/dx7-synth-js (MIT-style license)

2. **FS-Vital** - Enhanced Wavetable Synthesizer
   - Visual wavetable morphing (already have base in WavetableSynth.ts)
   - Spectral display with real-time FFT
   - Advanced modulation matrix
   - Filter envelope with visual curve
   - Reference: Vital GPL-3.0 (algorithm reference only)

### Phase 2: Samplers (HIGH PRIORITY)
3. **FS-SFZ** - Professional SFZ Sampler
   - Load industry-standard .sfz files
   - Multi-sample zone mapping
   - Round-robin sample triggering
   - Velocity layers and articulation switching
   - Reference: https://github.com/sfztools/sfizz-webaudio (BSD-2-Clause)

4. **FS-DrumPro** - Enhanced Drum Sampler
   - Upgrade current FS-Sampler to 32 pads
   - Multi-layer velocity switching
   - Round-robin sample pools per pad
   - Per-pad effects (filter, envelope, pitch)
   - Reference: DrumGizmo GPL-3.0 (algorithm reference only)

### Phase 3: Specialty Instruments (MEDIUM PRIORITY)
5. **FS-B3** - Hammond Tonewheel Organ
   - 9 drawbars (16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1')
   - Tonewheel harmonic synthesis
   - Leslie rotary speaker simulation (slow/fast)
   - Key click and percussion controls
   - Reference: SetBFree GPL-2.0 (algorithm reference only)

---

## 📋 Technical Architecture

### File Structure
```
src/audio/synths/
├── DX7Synth.ts          # NEW: 6-operator FM synthesis
├── VitalSynth.ts        # NEW: Enhanced wavetable (rename from WavetableSynth.ts)
├── SFZSampler.ts        # NEW: SFZ file format sampler
├── HammondB3.ts         # NEW: Tonewheel organ emulation
├── DrumSampler.ts       # NEW: Enhanced multi-layer drum sampler
└── (existing files)

src/components/plugins/
├── DX7SynthUI.tsx       # NEW: Professional FM synth interface
├── VitalSynthUI.tsx     # NEW: Visual wavetable interface
├── SFZSamplerUI.tsx     # NEW: SFZ zone mapping interface
├── HammondB3UI.tsx      # NEW: Drawbar organ interface
├── DrumSamplerUI.tsx    # NEW: 32-pad drum interface
└── BuiltInPlugins.tsx   # UPDATE: Add to INSTRUMENT_CATEGORIES
```

### Integration Points
1. **PLUGIN_DEFAULTS** - Add all new instruments
2. **INSTRUMENT_CATEGORIES** - Create organized menu structure
3. **PluginUIRenderer** - Lazy-load new UI components
4. **Audio Engine** - Connect to existing MIDI routing

---

## 🎨 UI Design Philosophy

### DX7 Synth UI
- Classic DX7 aesthetic with modern touch
- Algorithm selector (32 algorithms visualized)
- 6 operator panels with frequency ratio, level, ADSR
- Global LFO and effects section
- Preset browser with classic DX7 patches

### Vital-Style Wavetable UI
- Large wavetable display with morphing visualization
- Real-time spectrum analyzer
- Visual ADSR with curve preview
- Modulation matrix with drag-and-drop routing
- Unison voices with stereo spread visualization

### SFZ Sampler UI
- Drag-and-drop SFZ file loader
- Keyboard zone mapping display
- Sample waveform preview
- Articulation switcher (sustain, staccato, pizzicato, etc.)
- Round-robin pool editor

### Hammond B3 UI
- Classic 9-drawbar layout with authentic colors
- Leslie speed switch (slow/fast/stop)
- Vibrato/chorus selector (C1-C3, V1-V3)
- Percussion controls (2nd/3rd harmonic, fast/slow decay)
- Drive and tone controls

### Drum Sampler UI
- 32-pad grid layout (4×8 or 8×4)
- Per-pad waveform display
- Velocity layer editor (up to 8 layers per pad)
- Round-robin sample pool manager
- Per-pad ADSR, filter, pan, pitch

---

## 🔧 Web Audio Implementation Details

### FM Synthesis (DX7)
```typescript
// 6 operators, each with:
class Operator {
  oscillator: OscillatorNode;
  gainEnv: GainNode;
  frequencyRatio: number;  // 0.5 to 31.0
  level: number;           // 0 to 99
  adsr: ADSREnvelope;
  feedbackGain: GainNode;  // Self-modulation
}

// Algorithm = routing matrix between operators
type Algorithm = {
  carriers: number[];      // Which operators output to audio
  modulators: {
    from: number;
    to: number;
    amount: number;
  }[];
}
```

### Wavetable Synthesis (Vital)
```typescript
class WavetableOscillator {
  wavetables: Float32Array[];  // 256 frames per wavetable
  position: number;             // 0-1 morphing position
  spectralMorph(): Float32Array {
    // FFT-based morphing between wavetable frames
  }
}
```

### SFZ Sampler
```typescript
interface SFZRegion {
  sample: AudioBuffer;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  seq_length?: number;   // Round-robin pool size
  seq_position?: number; // Current position in pool
}
```

### Tonewheel Organ
```typescript
class TonewheelGenerator {
  wheels: {
    frequency: number;
    gain: number;
    oscillator: OscillatorNode;
  }[];
  drawbars: number[9];  // 0-8 for each drawbar
  leslieSpeed: 'slow' | 'fast' | 'stop';
}
```

---

## 📦 Factory Presets

### DX7 Patches (Classic)
- E. Piano 1 (Rhodes-style)
- E. Piano 2 (Wurlitzer-style)
- Brass 1 (Full Brass Section)
- Strings 1 (Lush Pad)
- Bass 1 (DX Bass)
- Synth Lead (Classic 80s)
- Bells (Tubular Bells)
- Organ 1 (B3-style)

### Wavetable Presets
- Modern Pluck
- Serum-style Bass
- Atmospheric Pad
- Evolving Texture
- Harmonic Lead

### Hammond Registrations
- Jazz Combo (888000000)
- Gospel (888800000)
- Rock (888888888)
- Jimmy Smith (888000008)

---

## ✅ License Compliance

All implementations follow GPL-3.0 compatibility:
- Our DAW is GPL-3.0 compatible
- Reference implementations are GPL-2.0/GPL-3.0/BSD (all compatible)
- JavaScript/TypeScript reimplementations (not ports) are clean-room
- Attribution provided in UI and documentation

---

## 🚀 Rollout Plan

### Week 1: Core Instruments
- [x] FS-DX7 FM Synthesizer + UI
- [x] FS-Vital Enhanced Wavetable + UI

### Week 2: Samplers
- [x] FS-SFZ Professional Sampler + UI
- [x] FS-DrumPro Enhanced Drum Sampler + UI

### Week 3: Specialty
- [x] FS-B3 Hammond Organ + UI
- [x] Integration & Testing

### Week 4: Polish & Presets
- [x] Factory preset libraries
- [x] Documentation & user guide
- [x] Performance optimization
- [x] GitHub release

---

**Last Updated:** 2026-04-09  
**Repository:** https://github.com/mkbrown261/FS-AUDIO.git  
**License:** GPL-3.0-compatible
