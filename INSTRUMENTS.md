# Built-in SFZ Instruments

FS-AUDIO now includes **professional built-in instruments** that are ready to use immediately.

## 🎹 Available Instruments

### 808 Drums
Classic TR-808 drum machine sounds:
- **Kick** (Key 36/C2)
- **Snare** (Key 38/D2)
- **Hi-Hat** (Keys 42 & 46)

**Size**: ~168 KB

### Electric Piano
Rhodes-style electric piano with 12 chromatic samples covering the full keyboard range (C2-C6).

**Range**: 24 keys (2 octaves) to 96 keys (full piano)
**Size**: ~3.1 MB

### Synth Bass
Analog synthesizer bass with rich harmonic content:
- Sawtooth + square wave hybrid
- 4 bass notes (E1, A1, E2, A2)
- Perfect for electronic music

**Size**: ~689 KB

## 📦 Total Size

**All instruments combined: ~4 MB**

This is **50-100x smaller** than typical commercial sample libraries (which can be 200 MB - 2 GB per instrument).

## ✨ How It Works

Instead of bundling large multi-velocity, multi-round-robin sample libraries, we:

1. **Generate samples programmatically** using high-quality synthesis algorithms
2. **Use pitch-shifting** for note ranges (standard SFZ technique)
3. **Create authentic waveforms** that sound professional

### Sample Generation

Samples are automatically generated during build using `scripts/generateSamples.js`:

```bash
npm run samples
```

This creates WAV files in `public/sfz-instruments/samples/`.

## 🎵 Using Built-in Instruments

1. Select a **MIDI track**
2. Open the **Plugins panel** (right side)
3. Add **"FS-SFZ Sampler"** from Instrument Plugins
4. Click one of the built-in instruments:
   - **808 Drums**
   - **Electric Piano**
   - **Synth Bass**
5. Play notes using:
   - **Musical Typing** (Shift+P)
   - **MIDI controller**
   - **MIDI clips**

## 🔧 Technical Details

### Audio Quality
- **Sample Rate**: 44.1 kHz
- **Bit Depth**: 16-bit PCM
- **Format**: WAV (uncompressed)

### Synthesis Methods

**808 Drums**:
- Kick: Sine wave with pitch envelope (60Hz → 40Hz) + harmonics
- Snare: Tone (200Hz sine) + white noise
- Hi-Hat: High-frequency noise with fast decay

**Electric Piano**:
- Multiple sine harmonics (fundamental + 2nd, 3rd, 4th)
- Bell-like exponential decay envelope
- Chromatic sampling (every 3-4 semitones)

**Synth Bass**:
- Sawtooth wave (70%) + square wave (30%)
- ADSR envelope with fast attack
- Rich harmonic content

## 🎯 Benefits

✅ **Zero external dependencies** - everything built-in
✅ **Fast loading** - no large file downloads
✅ **Professional quality** - carefully tuned synthesis
✅ **Small app size** - only 4MB for all instruments
✅ **Consistent across platforms** - generated samples are identical everywhere

## 🚀 Future Enhancements

Planned additions:
- More drum kits (909, acoustic)
- Orchestral instruments (strings, brass)
- More keyboard instruments (organ, clavinet)
- Guitar & bass samples
- Vocal samples

---

**Note**: Users can still load their own SFZ libraries by clicking "Load SFZ File..." in the plugin UI.
