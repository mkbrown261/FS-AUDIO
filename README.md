# 🎵 Flowstate Audio

**Professional standalone DAW application** — part of the Flowstate ecosystem.

Flowstate Audio is a desktop audio workstation modeled after Logic Pro's workflow, built with Electron + React + Web Audio API. It runs locally on macOS, Windows, and Linux, with Clawbot AI integration for AI-powered music generation.

---

## 🎹 Quick Start - Using Instruments

**New to Flowstate Audio?** Check out the [INSTRUMENT_GUIDE.md](./INSTRUMENT_GUIDE.md) for:
- How to add instruments (FS-Analog synth, FS-Sampler drums)
- Musical typing keyboard layout
- Piano Roll editing
- MIDI recording workflow

**TL;DR:**
1. Click **"+ MIDI"** to create a MIDI track
2. Select the track, then in the **Inspector Panel** (right side) click **"+ ADD"**
3. Choose **FS-Analog** (synth) or **FS-Sampler** (drums)
4. Play using your keyboard: `Z X C V B N M` (notes), `A S D F G H J` (higher octave)
5. Press the **red circle** on the track to arm, then **Record** to capture MIDI

---

## ✨ Features

| Feature | Details |
|---|---|
| **Multi-Track Recording** | Unlimited audio & MIDI tracks, punch recording, take folders, comping |
| **Piano Roll** | Full MIDI editor — velocity, quantize (1/4–1/32+triplet), chord detection |
| **Flex Time** | Non-destructive time stretching and pitch shifting |
| **Mixer Console** | 4 insert slots per channel, sends, pan, VU meters |
| **Track Automation** | Volume, pan, EQ, plugin parameters — draw or record |
| **VST3 / AU Plugins** | Load your own plugins + 7 built-in (EQ, compressor, reverb, delay, limiter, chorus, distortion) |
| **AI Music Generation** | Suno AI, MusicGen via Replicate — beats, melodies, full tracks (ClawFlow required) |
| **Clawbot AI Panel** | Real-time AI assistant, arrangement suggestions, stem separation, AI mastering |
| **Export** | WAV 16/24/32-bit, MP3, AIFF, individual stems, LUFS normalisation |
| **Cross-Platform** | macOS, Windows, Linux |

---

## ⬇️ Download

| Platform | Download |
|---|---|
| macOS | [FlowstateAudio-mac.dmg](https://github.com/mkbrown261/FS-AUDIO/releases/latest/download/FlowstateAudio-mac.dmg) |
| Windows | [FlowstateAudio-win.exe](https://github.com/mkbrown261/FS-AUDIO/releases/latest/download/FlowstateAudio-win.exe) |
| Linux | [FlowstateAudio-linux.AppImage](https://github.com/mkbrown261/FS-AUDIO/releases/latest/download/FlowstateAudio-linux.AppImage) |

---

## 🦾 Clawbot & ClawFlow

Clawbot is the AI brain of the Flowstate ecosystem, integrated directly into Flowstate Audio.

**ClawFlow subscription ($40/month — first month $20) unlocks:**
- Full Track generation via Suno AI (40⚡)
- Beat & Melody generation via MusicGen (15–20⚡)
- AI stem separation via Moises (25⚡)
- AI mastering via Loudme (20⚡)
- Arrangement suggestions & key/BPM detection
- 500 coins/month included

Activate at [Flowstate Hub](https://flowstate-67g.pages.dev) → Clawbot tab.

---

## 🛠 Development Setup

### Prerequisites
- Node.js 18+
- npm 9+

### Install & run

```bash
git clone https://github.com/mkbrown261/FS-AUDIO
cd FS-AUDIO
npm install

# Run in browser (web mode)
npm run dev

# Run as Electron desktop app
npm run electron:dev
```

### Build distributables

```bash
npm run electron:build
# Output: release/ directory
```

---

## 🏗 Architecture

```
FS-AUDIO/
├── electron/
│   ├── main.js          # Electron main process — window, menu, IPC, file dialogs
│   └── preload.js       # Context bridge (electronAPI)
├── src/
│   ├── App.tsx           # Root layout + keyboard shortcuts + IPC handler
│   ├── store/
│   │   └── projectStore.ts    # Zustand global state (tracks, clips, transport)
│   ├── hooks/
│   │   ├── useAudioEngine.ts  # Web Audio API engine (playback, VU, EQ, compressor)
│   │   └── useTransport.ts    # RAF-based transport with stall detection
│   ├── components/
│   │   ├── Toolbar.tsx        # Transport bar, BPM, key, AI slider
│   │   ├── TrackList.tsx      # Left sidebar track headers
│   │   ├── Timeline.tsx       # Arrange area with clips and playhead
│   │   ├── Mixer.tsx          # Mixer console with VU meters
│   │   ├── PianoRoll.tsx      # MIDI editor
│   │   ├── ClawbotPanel.tsx   # AI assistant panel
│   │   └── StatusBar.tsx      # Sample rate, bit depth, CPU
│   └── styles/
│       └── global.css         # Flowstate dark theme
└── public/
    └── landing/
        └── index.html   # Standalone landing page
```

### Audio Engine
Built on the **Web Audio API** — `AudioContext`, `GainNode`, `StereoPannerNode`, `DynamicsCompressorNode`, `BiquadFilterNode`, `AnalyserNode`. No external audio library dependencies. Works in both Electron and browser contexts.

### State Management
[Zustand](https://github.com/pmndrs/zustand) — single global store with full undo/redo stack (50 snapshots), typed with TypeScript.

---

## 🎨 Color Scheme

| Variable | Value | Use |
|---|---|---|
| `--bg-base` | `#0f0f1a` | App background |
| `--bg-panel` | `#1a1a2e` | Panels, toolbar |
| `--bg-card` | `#16213e` | Cards, mixer channels |
| `--accent` | `#a855f7` | Purple — primary accent |
| `--green` | `#10b981` | Playback, AI, active states |
| `--cyan` | `#06b6d4` | Secondary, pan, LCD |
| `--pink` | `#ec4899` | Tracks, accents |
| `--warn` | `#f59e0b` | Mute, warnings |
| `--danger` | `#ef4444` | Record, delete |

---

## 📄 License

MIT — free to use, modify, and distribute.

Part of the [Flowstate](https://flowstate-67g.pages.dev) ecosystem.
