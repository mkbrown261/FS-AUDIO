import { useRef, useCallback, useEffect } from 'react'
import { useProjectStore, Clip } from '../store/projectStore'

interface TrackNodes {
  gain: GainNode
  panner: StereoPannerNode
  analyser: AnalyserNode
  eq: BiquadFilterNode[]
  lowShelf?: BiquadFilterNode
  midPeak?: BiquadFilterNode
  highShelf?: BiquadFilterNode
  compressor: DynamicsCompressorNode
  reverb?: ConvolverNode
  reverbGain?: GainNode
  delay?: DelayNode
  delayFeedback?: GainNode
  delayWet?: GainNode
  // Elite plugins
  satLowWS?: WaveShaperNode
  satMidWS?: WaveShaperNode
  satHighWS?: WaveShaperNode
  satLowLP?: BiquadFilterNode
  satMidHP?: BiquadFilterNode
  satMidLP?: BiquadFilterNode
  satHighHP?: BiquadFilterNode
  satMixDry?: GainNode
  satMixWet?: GainNode
  satOutputGain?: GainNode
  pressureComp?: DynamicsCompressorNode
  pressureMakeup?: GainNode
  pressureDry?: GainNode
  pressureWet?: GainNode
  spaceReverb?: ConvolverNode
  spaceReverbGain?: GainNode
  spaceShimmerGain?: GainNode
  spacePingDelay?: DelayNode
  spacePongDelay?: DelayNode
  spacePingGain?: GainNode
  spacePongGain?: GainNode
  spaceDlyWet?: GainNode
  transientComp?: DynamicsCompressorNode
  transientMakeup?: GainNode
  // FS-Nova (Multiband Expander/Gate)
  novaGate?: DynamicsCompressorNode
  novaMakeup?: GainNode
  novaDry?: GainNode
  novaWet?: GainNode
  // FS-Prism (Harmonic Exciter)
  prismHP?: BiquadFilterNode
  prismWS?: WaveShaperNode
  prismWet?: GainNode
  prismDry?: GainNode
  prismHarmonicGain?: GainNode
  // FS-Vibe (Vibrato/Tape Mod)
  vibeDelay?: DelayNode
  vibeLFO?: OscillatorNode
  vibeLFOGain?: GainNode
  vibeWet?: GainNode
  vibeDry?: GainNode
  // FS-Phase (Stereo Width / M-S)
  phaseMid?: GainNode
  phaseSide?: GainNode
  phaseWidthOut?: GainNode
  // FS-Oxide (Tape Emulation)
  oxideWS?: WaveShaperNode
  oxideLP?: BiquadFilterNode
  oxideHPF?: BiquadFilterNode
  oxideWet?: GainNode
  oxideDry?: GainNode
  // FS-Hades (Sub Enhancer)
  hadesLP?: BiquadFilterNode
  hadesWS?: WaveShaperNode
  hadesSubGain?: GainNode
  hadesDry?: GainNode
  // FS-Shield (Noise Gate)
  shieldComp?: DynamicsCompressorNode
  shieldMakeup?: GainNode
  // FS-Flux (Pitch Correct – simplified)
  fluxDelay?: DelayNode
  fluxDry?: GainNode
  fluxWet?: GainNode
  // FS-Forge (Parallel Comp)
  forgeComp?: DynamicsCompressorNode
  forgeMakeup?: GainNode
  forgeDry?: GainNode
  forgeWet?: GainNode
  // FS-Crystal (Granular Freeze)
  crystalReverb?: ConvolverNode
  crystalGain?: GainNode
  crystalDry?: GainNode
}

interface ScheduledSource {
  source: AudioBufferSourceNode
  clipId: string
}

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const masterAnalyserRef = useRef<AnalyserNode | null>(null)
  const masterLimiterRef = useRef<DynamicsCompressorNode | null>(null)
  const trackNodesRef = useRef<Map<string, TrackNodes>>(new Map())
  const scheduledSourcesRef = useRef<ScheduledSource[]>([])
  const metronomeIntervalRef = useRef<number | null>(null)
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map())
  // Cache for pitch-shifted buffers: key = `${clipId}:${semitones}`
  const pitchBufferCache = useRef<Map<string, AudioBuffer>>(new Map())

  // Recording state
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<BlobPart[]>([])
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  const getCtx = useCallback((): AudioContext => {
    // If context doesn't exist OR is closed, create a new one
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      if (ctxRef.current && ctxRef.current.state === 'closed') {
        console.warn('[getCtx] AudioContext was closed, creating new one')
      }
      
      ctxRef.current = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' })
      masterGainRef.current = ctxRef.current.createGain()
      masterGainRef.current.gain.value = 0.9
      masterAnalyserRef.current = ctxRef.current.createAnalyser()
      masterAnalyserRef.current.fftSize = 2048

      // Master limiter (brick wall at 0 dBFS)
      masterLimiterRef.current = ctxRef.current.createDynamicsCompressor()
      masterLimiterRef.current.threshold.value = -1
      masterLimiterRef.current.knee.value = 0
      masterLimiterRef.current.ratio.value = 20
      masterLimiterRef.current.attack.value = 0.001
      masterLimiterRef.current.release.value = 0.1

      masterGainRef.current.connect(masterLimiterRef.current)
      masterLimiterRef.current.connect(masterAnalyserRef.current)
      masterAnalyserRef.current.connect(ctxRef.current.destination)
      
      console.log('[getCtx] New AudioContext created, state:', ctxRef.current.state)
    }
    return ctxRef.current
  }, [])

  const getTrackNodes = useCallback((trackId: string, volume: number, pan: number): TrackNodes => {
    const existing = trackNodesRef.current.get(trackId)
    if (existing) {
      console.log('[getTrackNodes] Returning existing nodes for track:', trackId)
      return existing
    }
    console.log('[getTrackNodes] Creating NEW nodes for track:', trackId)

    const ctx = getCtx()
    const gain = ctx.createGain()
    gain.gain.value = volume

    const panner = ctx.createStereoPanner()
    panner.pan.value = pan

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -24
    compressor.knee.value = 30
    compressor.ratio.value = 4
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    const lowShelf = ctx.createBiquadFilter()
    lowShelf.type = 'lowshelf'
    lowShelf.frequency.value = 320
    lowShelf.gain.value = 0

    const midPeak = ctx.createBiquadFilter()
    midPeak.type = 'peaking'
    midPeak.frequency.value = 1000
    midPeak.Q.value = 0.5
    midPeak.gain.value = 0

    const highShelf = ctx.createBiquadFilter()
    highShelf.type = 'highshelf'
    highShelf.frequency.value = 3200
    highShelf.gain.value = 0

    // ── Reverb (convolver + impulse) ──────────────────────────────────────
    const reverb = ctx.createConvolver()
    const reverbGain = ctx.createGain()
    reverbGain.gain.value = 0 // dry by default
    // Generate a simple synthetic reverb impulse
    const irLength = ctx.sampleRate * 2.5
    const irBuffer = ctx.createBuffer(2, irLength, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = irBuffer.getChannelData(ch)
      for (let i = 0; i < irLength; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 2.5)
      }
    }
    reverb.buffer = irBuffer

    // ── Delay ────────────────────────────────────────────────────────────
    const delay = ctx.createDelay(5.0)
    delay.delayTime.value = 0.25
    const delayFeedback = ctx.createGain()
    delayFeedback.gain.value = 0.3
    const delayWet = ctx.createGain()
    delayWet.gain.value = 0 // dry by default

    // ── FS-Saturn: Multiband Saturation nodes ──────────────────────────────
    // Signal split: Low / Mid / High bands through individual waveshapers
    const satLowLP  = ctx.createBiquadFilter(); satLowLP.type  = 'lowpass';  satLowLP.frequency.value  = 250
    const satMidHP  = ctx.createBiquadFilter(); satMidHP.type  = 'highpass'; satMidHP.frequency.value  = 250
    const satMidLP  = ctx.createBiquadFilter(); satMidLP.type  = 'lowpass';  satMidLP.frequency.value  = 3000
    const satHighHP = ctx.createBiquadFilter(); satHighHP.type = 'highpass'; satHighHP.frequency.value = 3000
    const satLowWS  = ctx.createWaveShaper();   satLowWS.oversample  = '4x'
    const satMidWS  = ctx.createWaveShaper();   satMidWS.oversample  = '4x'
    const satHighWS = ctx.createWaveShaper();   satHighWS.oversample = '4x'
    // Init with bypass curves (no drive = linear)
    const bypassCurve = new Float32Array(new ArrayBuffer(256 * 4))
    for (let i = 0; i < 256; i++) bypassCurve[i] = (i * 2) / 256 - 1
    satLowWS.curve = new Float32Array(bypassCurve)
    satMidWS.curve = new Float32Array(bypassCurve)
    satHighWS.curve = new Float32Array(bypassCurve)
    const satMixer  = ctx.createGain(); satMixer.gain.value = 1
    const satMixDry = ctx.createGain(); satMixDry.gain.value = 1 // full dry by default (bypass)
    const satMixWet = ctx.createGain(); satMixWet.gain.value = 0 // wet = 0 until plugin active
    const satOutputGain = ctx.createGain(); satOutputGain.gain.value = 1

    // ── FS-Pressure: Bus Compressor nodes ────────────────────────────────────
    const pressureComp = ctx.createDynamicsCompressor()
    pressureComp.threshold.value = -12; pressureComp.ratio.value = 4
    pressureComp.attack.value = 0.001;  pressureComp.release.value = 0.1
    pressureComp.knee.value = 6
    const pressureMakeup = ctx.createGain(); pressureMakeup.gain.value = 1
    const pressureDry = ctx.createGain(); pressureDry.gain.value = 1
    const pressureWet = ctx.createGain(); pressureWet.gain.value = 0

    // ── FS-Spacetime: Shimmer Reverb + Ping-Pong Delay nodes ─────────────────
    const spaceReverb = ctx.createConvolver()
    const spaceIrLen  = ctx.sampleRate * 3.5
    const spaceIrBuf  = ctx.createBuffer(2, spaceIrLen, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = spaceIrBuf.getChannelData(ch)
      let lp = 0
      for (let i = 0; i < spaceIrLen; i++) {
        const env = Math.pow(1 - i / spaceIrLen, 2.5)
        lp = lp + ((Math.random() * 2 - 1) * env - lp) * 0.4
        d[i] = lp
      }
    }
    spaceReverb.buffer = spaceIrBuf
    const spaceReverbGain   = ctx.createGain(); spaceReverbGain.gain.value   = 0
    const spaceShimmerGain  = ctx.createGain(); spaceShimmerGain.gain.value  = 0
    const spacePingDelay    = ctx.createDelay(4); spacePingDelay.delayTime.value  = 0.375
    const spacePongDelay    = ctx.createDelay(4); spacePongDelay.delayTime.value  = 0.375
    const spacePingGain     = ctx.createGain(); spacePingGain.gain.value  = 0.4
    const spacePongGain     = ctx.createGain(); spacePongGain.gain.value  = 0.4
    const spaceDlyWet       = ctx.createGain(); spaceDlyWet.gain.value    = 0
    const spacePingPanner   = ctx.createStereoPanner(); spacePingPanner.pan.value  = -0.9
    const spacePongPanner   = ctx.createStereoPanner(); spacePongPanner.pan.value  =  0.9

    // ── FS-Transient: Transient Designer nodes ────────────────────────────────
    const transientComp   = ctx.createDynamicsCompressor()
    transientComp.threshold.value = -40; transientComp.ratio.value = 1.5
    transientComp.attack.value = 0.001;  transientComp.release.value = 0.1
    transientComp.knee.value = 30
    const transientMakeup = ctx.createGain(); transientMakeup.gain.value = 1

    // ── FS-Nova: Multiband Expander / Gate ────────────────────────────────────
    // Implemented as a downward expander using a compressor with ratio < 1 trick
    // (use ratio=20 as hard gate, threshold-based, then invert into parallel path)
    const novaGate    = ctx.createDynamicsCompressor()
    novaGate.threshold.value = -50; novaGate.ratio.value = 20
    novaGate.attack.value = 0.001;  novaGate.release.value = 0.05
    novaGate.knee.value = 3
    const novaMakeup  = ctx.createGain(); novaMakeup.gain.value = 1
    const novaDry     = ctx.createGain(); novaDry.gain.value = 1
    const novaWet     = ctx.createGain(); novaWet.gain.value = 0

    // ── FS-Prism: Harmonic Exciter ────────────────────────────────────────────
    // High-pass filtered signal → waveshaper (soft clip) → blend with dry
    const prismHP     = ctx.createBiquadFilter()
    prismHP.type      = 'highpass'; prismHP.frequency.value = 3000; prismHP.Q.value = 0.7
    const prismWS     = ctx.createWaveShaper(); prismWS.oversample = '4x'
    // Soft exciter curve — mild 2nd/3rd harmonic generation
    const prismCurve  = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1
      prismCurve[i] = Math.tanh(3 * x) * 0.5
    }
    prismWS.curve = prismCurve
    const prismHarmonicGain = ctx.createGain(); prismHarmonicGain.gain.value = 0.3
    const prismWet    = ctx.createGain(); prismWet.gain.value = 0
    const prismDry    = ctx.createGain(); prismDry.gain.value = 1

    // ── FS-Vibe: Tape Vibrato / Chorus Modulation ────────────────────────────
    const vibeDelay   = ctx.createDelay(0.05); vibeDelay.delayTime.value = 0.01
    // LFO oscillator → gain node → connects to vibeDelay.delayTime AudioParam
    const vibeLFO     = ctx.createOscillator()
    vibeLFO.type      = 'sine'
    vibeLFO.frequency.value = 5.0  // 5 Hz default vibrato
    const vibeLFOGain = ctx.createGain(); vibeLFOGain.gain.value = 0.003 // ±3ms depth
    vibeLFO.connect(vibeLFOGain)
    vibeLFOGain.connect(vibeDelay.delayTime)  // modulate delay time
    vibeLFO.start()
    const vibeWet     = ctx.createGain(); vibeWet.gain.value = 0
    const vibeDry     = ctx.createGain(); vibeDry.gain.value = 1

    // ── FS-Phase (Stereo Width / Mid-Side) ───────────────────────────────────
    // Simplified single-channel width using gain nodes (true MS needs 2-ch processing)
    // Starts at gain 0 — only activated when phase plugin is enabled
    const phaseMid    = ctx.createGain(); phaseMid.gain.value = 0
    const phaseSide   = ctx.createGain(); phaseSide.gain.value = 0
    const phaseWidthOut = ctx.createGain(); phaseWidthOut.gain.value = 0

    // ── FS-Oxide: Tape Emulation ──────────────────────────────────────────────
    const oxideWS     = ctx.createWaveShaper(); oxideWS.oversample = '2x'
    const oxideCurve  = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1
      // Tape: soft, asymmetric, slightly bandlimited saturation
      oxideCurve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * 2)) * 0.95
    }
    oxideWS.curve = oxideCurve
    const oxideLP     = ctx.createBiquadFilter()
    oxideLP.type      = 'lowpass'; oxideLP.frequency.value = 16000
    const oxideHPF    = ctx.createBiquadFilter()
    oxideHPF.type     = 'highpass'; oxideHPF.frequency.value = 30
    const oxideWet    = ctx.createGain(); oxideWet.gain.value = 0
    const oxideDry    = ctx.createGain(); oxideDry.gain.value = 1

    // ── FS-Hades: Sub Enhancer ────────────────────────────────────────────────
    // LP → waveshaper (freq doubler) → mix into output
    const hadesLP     = ctx.createBiquadFilter()
    hadesLP.type      = 'lowpass'; hadesLP.frequency.value = 120; hadesLP.Q.value = 0.5
    const hadesWS     = ctx.createWaveShaper(); hadesWS.oversample = '4x'
    const hadesCurve  = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1
      // Square-ish curve for harmonic generation (sub octave + 2nd harmonic)
      hadesCurve[i] = Math.sign(x) * Math.pow(Math.abs(x), 0.5)
    }
    hadesWS.curve = hadesCurve
    const hadesSubGain = ctx.createGain(); hadesSubGain.gain.value = 0
    const hadesDry    = ctx.createGain(); hadesDry.gain.value = 0  // inactive by default

    // ── FS-Shield: Noise Gate ─────────────────────────────────────────────────
    const shieldComp  = ctx.createDynamicsCompressor()
    shieldComp.threshold.value = -60; shieldComp.ratio.value = 20
    shieldComp.attack.value = 0.001;  shieldComp.release.value = 0.2
    shieldComp.knee.value = 0
    // Starts at 0 — only activated when shield plugin is enabled
    const shieldMakeup = ctx.createGain(); shieldMakeup.gain.value = 0

    // ── FS-Flux: Pitch Corrector (simplified) ─────────────────────────────────
    // True pitch correction requires DSP beyond Web Audio; we implement as
    // a subtle pitch-shifted blend (like a light correction / chorus-pitch effect)
    const fluxDelay   = ctx.createDelay(0.02); fluxDelay.delayTime.value = 0.005
    const fluxDry     = ctx.createGain(); fluxDry.gain.value = 1
    const fluxWet     = ctx.createGain(); fluxWet.gain.value = 0

    // ── FS-Forge: Parallel Mix Compressor ────────────────────────────────────
    const forgeComp   = ctx.createDynamicsCompressor()
    forgeComp.threshold.value = -20; forgeComp.ratio.value = 6
    forgeComp.attack.value = 0.005;  forgeComp.release.value = 0.2
    forgeComp.knee.value = 10
    const forgeMakeup = ctx.createGain(); forgeMakeup.gain.value = 1
    const forgeDry    = ctx.createGain(); forgeDry.gain.value = 1
    const forgeWet    = ctx.createGain(); forgeWet.gain.value = 0

    // ── FS-Crystal: Granular Freeze ───────────────────────────────────────────
    // Implemented as a long convolution reverb (dense, flat) with freeze emulation
    const crystalIrLen = ctx.sampleRate * 6
    const crystalIrBuf = ctx.createBuffer(2, crystalIrLen, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = crystalIrBuf.getChannelData(ch)
      // Flat dense noise = freeze-like spectral hold
      for (let i = 0; i < crystalIrLen; i++) {
        const env = Math.pow(1 - i / crystalIrLen, 0.5) // very slow decay
        d[i] = (Math.random() * 2 - 1) * env
      }
    }
    const crystalReverb = ctx.createConvolver()
    crystalReverb.buffer = crystalIrBuf
    const crystalGain = ctx.createGain(); crystalGain.gain.value = 0
    const crystalDry  = ctx.createGain(); crystalDry.gain.value = 1

    // ── Signal Chain ──────────────────────────────────────────────────────────
    // gain → EQ → compressor → [Saturn multiband sat] → [Pressure bus comp]
    //   → [Transient] → panner → [Spacetime reverb + delay] → analyser → master

    gain.connect(lowShelf)
    lowShelf.connect(midPeak)
    midPeak.connect(highShelf)
    highShelf.connect(compressor)

    // Saturn: split compressor output into 3 bands
    compressor.connect(satLowLP);   satLowLP.connect(satLowWS)
    compressor.connect(satMidHP);   satMidHP.connect(satMidLP);  satMidLP.connect(satMidWS)
    compressor.connect(satHighHP);  satHighHP.connect(satHighWS)
    // Saturn mix: dry from compressor, wet from 3-band sum
    compressor.connect(satMixDry)
    satLowWS.connect(satMixer);  satMidWS.connect(satMixer);  satHighWS.connect(satMixer)
    satMixer.connect(satMixWet)
    // Recombine → output gain
    satMixDry.connect(satOutputGain)
    satMixWet.connect(satOutputGain)

    // Pressure bus compressor: parallel
    satOutputGain.connect(pressureDry)
    satOutputGain.connect(pressureComp)
    pressureComp.connect(pressureMakeup)
    pressureMakeup.connect(pressureWet)

    // Transient (post pressure)
    pressureDry.connect(transientComp)
    pressureWet.connect(transientComp)
    transientComp.connect(transientMakeup)

    // Panner after transient
    transientMakeup.connect(panner)

    // Classic Reverb branch — post-panner so it benefits from the full chain
    panner.connect(reverb)
    reverb.connect(reverbGain)
    reverbGain.connect(analyser)

    // Classic Delay branch — post-panner
    panner.connect(delay)
    delay.connect(delayFeedback)
    delayFeedback.connect(delay)
    delay.connect(delayWet)
    delayWet.connect(analyser)

    // Spacetime Reverb branch
    panner.connect(spaceReverb)
    spaceReverb.connect(spaceReverbGain)
    spaceReverbGain.connect(analyser)
    // Shimmer: send reverb output back through pitch-up oscillator (approximate via another reverb tail)
    spaceReverb.connect(spaceShimmerGain)
    spaceShimmerGain.connect(analyser)

    // Spacetime Ping-Pong Delay
    panner.connect(spacePingDelay)
    spacePingDelay.connect(spacePingPanner)
    spacePingPanner.connect(spaceDlyWet)
    spaceDlyWet.connect(analyser)
    // Ping → Pong feedback loop
    spacePingDelay.connect(spacePingGain); spacePingGain.connect(spacePongDelay)
    spacePongDelay.connect(spacePongPanner); spacePongPanner.connect(spaceDlyWet)
    spacePongDelay.connect(spacePongGain); spacePongGain.connect(spacePingDelay)

    // FS-Nova gate: parallel pass on transient output (inactive by default)
    transientMakeup.connect(novaDry)
    transientMakeup.connect(novaGate)
    novaGate.connect(novaMakeup)
    novaMakeup.connect(novaWet)

    // FS-Prism exciter: HP → waveshaper → harmonic gain (inject into analyser)
    transientMakeup.connect(prismDry)
    transientMakeup.connect(prismHP)
    prismHP.connect(prismWS)
    prismWS.connect(prismHarmonicGain)
    prismHarmonicGain.connect(prismWet)

    // FS-Vibe: modulated delay on panner output
    panner.connect(vibeDry)
    panner.connect(vibeDelay)
    vibeDelay.connect(vibeWet)

    // FS-Phase (stereo width): parallel mid+side summed into phaseWidthOut
    // Both tap from panner independently; phaseWidthOut is the sum output
    panner.connect(phaseMid)
    panner.connect(phaseSide)
    phaseMid.connect(phaseWidthOut)
    phaseSide.connect(phaseWidthOut)

    // FS-Oxide tape: parallel on panner output
    panner.connect(oxideDry)
    panner.connect(oxideHPF)
    oxideHPF.connect(oxideWS)
    oxideWS.connect(oxideLP)
    oxideLP.connect(oxideWet)

    // FS-Hades sub enhancer: LP → waveshaper → sub gain
    panner.connect(hadesDry)
    panner.connect(hadesLP)
    hadesLP.connect(hadesWS)
    hadesWS.connect(hadesSubGain)

    // FS-Shield gate: parallel path — makeup connects to analyser only when active
    // panner→analyser direct path handles bypass (shieldMakeup starts at 0)
    panner.connect(shieldComp)
    shieldComp.connect(shieldMakeup)

    // FS-Flux: delay-based pitch shift blend
    panner.connect(fluxDry)
    panner.connect(fluxDelay)
    fluxDelay.connect(fluxWet)

    // FS-Forge: parallel compressor
    panner.connect(forgeDry)
    panner.connect(forgeComp)
    forgeComp.connect(forgeMakeup)
    forgeMakeup.connect(forgeWet)

    // FS-Crystal: granular freeze reverb
    panner.connect(crystalDry)
    panner.connect(crystalReverb)
    crystalReverb.connect(crystalGain)

    // ── New Elite plugin outputs → analyser ──────────────────────────────────
    // Each plugin has wet+dry path. When plugin is INACTIVE: wet=0, dry=0 (panner→analyser handles signal)
    // When plugin is ACTIVE: wet+dry both connect to analyser, panner still connects (bypass is via dry node)
    // Note: panner always connects so track signal always reaches analyser even with no elite plugins
    novaWet.connect(analyser)
    novaDry.connect(analyser)
    prismWet.connect(analyser)
    prismDry.connect(analyser)
    vibeWet.connect(analyser)
    vibeDry.connect(analyser)
    phaseWidthOut.connect(analyser)
    oxideWet.connect(analyser)
    oxideDry.connect(analyser)
    hadesSubGain.connect(analyser)
    hadesDry.connect(analyser)
    shieldMakeup.connect(analyser)
    fluxWet.connect(analyser)
    fluxDry.connect(analyser)
    forgeWet.connect(analyser)
    forgeDry.connect(analyser)
    crystalGain.connect(analyser)
    crystalDry.connect(analyser)

    // Set initial state: dry = 1 (bypass), wet = 0 (off)
    // When a plugin is activated via applyElitePlugins, dry/wet gains are set appropriately
    novaDry.gain.value = 1;    novaWet.gain.value = 0
    prismDry.gain.value = 1;   prismWet.gain.value = 0
    vibeDry.gain.value = 1;    vibeWet.gain.value = 0
    oxideDry.gain.value = 1;   oxideWet.gain.value = 0
    hadesDry.gain.value = 1;   hadesSubGain.gain.value = 0
    fluxDry.gain.value = 1;    fluxWet.gain.value = 0
    forgeDry.gain.value = 1;   forgeWet.gain.value = 0
    crystalDry.gain.value = 1; crystalGain.gain.value = 0

    panner.connect(analyser)
    analyser.connect(masterGainRef.current!)

    const nodes: TrackNodes = {
      gain, panner, analyser,
      eq: [lowShelf, midPeak, highShelf],
      lowShelf, midPeak, highShelf,
      compressor,
      reverb, reverbGain, delay, delayFeedback, delayWet,
      // Elite plugins
      satLowWS, satMidWS, satHighWS,
      satLowLP, satMidHP, satMidLP, satHighHP,
      satMixDry, satMixWet, satOutputGain,
      pressureComp, pressureMakeup, pressureDry, pressureWet,
      spaceReverb, spaceReverbGain, spaceShimmerGain,
      spacePingDelay, spacePongDelay, spacePingGain, spacePongGain, spaceDlyWet,
      transientComp, transientMakeup,
      // New 10 Elite plugins
      novaGate, novaMakeup, novaDry, novaWet,
      prismHP, prismWS, prismHarmonicGain, prismWet, prismDry,
      vibeDelay, vibeLFO, vibeLFOGain, vibeWet, vibeDry,
      phaseMid, phaseSide, phaseWidthOut,
      oxideWS, oxideLP, oxideHPF, oxideWet, oxideDry,
      hadesLP, hadesWS, hadesSubGain, hadesDry,
      shieldComp, shieldMakeup,
      fluxDelay, fluxDry, fluxWet,
      forgeComp, forgeMakeup, forgeDry, forgeWet,
      crystalReverb, crystalGain, crystalDry,
    }
    trackNodesRef.current.set(trackId, nodes)
    return nodes
  }, [getCtx])

  // Register a pre-decoded AudioBuffer under a synthetic key (e.g. blob: URL or recording id)
  const registerAudioBuffer = useCallback((key: string, buffer: AudioBuffer) => {
    console.log('registerAudioBuffer: Registering buffer', key, 'duration:', buffer.duration, 'channels:', buffer.numberOfChannels)
    audioBuffersRef.current.set(key, buffer)
    console.log('registerAudioBuffer: Total cached buffers:', audioBuffersRef.current.size)
  }, [])

  const loadAudioBuffer = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    const cached = audioBuffersRef.current.get(url)
    if (cached) return cached
    if (!url.startsWith('http')) {
      console.error('loadAudioBuffer: MISSING cached buffer for key:', url, 'Available keys:', Array.from(audioBuffersRef.current.keys()))
      return null
    }
    try {
      const ctx = getCtx()
      const res = await fetch(url)
      const arrayBuffer = await res.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arrayBuffer)
      audioBuffersRef.current.set(url, buffer)
      return buffer
    } catch (e) {
      console.warn('Failed to load audio buffer:', url, e)
      return null
    }
  }, [getCtx])

  // ── Apply fade ramps to a clip gain node ──────────────────────────────────
  const applyFadeRamps = useCallback((
    clipGain: GainNode,
    clip: Clip,
    bpm: number,
    clipOffsetSec: number,
    scheduledAtCtxTime: number,
    playDuration: number,
  ) => {
    const ctx = getCtx()
    const beatDur = 60 / bpm
    const fadeInSec = (clip.fadeIn ?? 0) * beatDur
    const fadeOutSec = (clip.fadeOut ?? 0) * beatDur
    const curve = clip.fadeInCurve ?? 'exp'

    const now = ctx.currentTime
    const startTime = scheduledAtCtxTime
    const endTime = startTime + playDuration

    // Initial gain = 0 if fade-in, else gain value
    if (fadeInSec > 0) {
      const fadeInStartSec = Math.max(0, fadeInSec - clipOffsetSec)
      clipGain.gain.setValueAtTime(0.0001, startTime)
      if (curve === 'linear') {
        clipGain.gain.linearRampToValueAtTime(clip.gain, startTime + fadeInStartSec)
      } else if (curve === 's-curve') {
        // S-curve: set halfway through at sqrt(gain)
        clipGain.gain.setValueAtTime(0.0001, startTime)
        clipGain.gain.linearRampToValueAtTime(clip.gain * 0.5, startTime + fadeInStartSec / 2)
        clipGain.gain.linearRampToValueAtTime(clip.gain, startTime + fadeInStartSec)
      } else {
        // Exponential (Logic Pro default)
        clipGain.gain.exponentialRampToValueAtTime(clip.gain, startTime + fadeInStartSec)
      }
    } else {
      clipGain.gain.setValueAtTime(clip.gain, startTime)
    }

    // Fade out
    if (fadeOutSec > 0) {
      const fadeOutStart = endTime - fadeOutSec
      if (fadeOutStart > startTime) {
        clipGain.gain.setValueAtTime(clip.gain, Math.max(now, fadeOutStart))
        if (curve === 'linear') {
          clipGain.gain.linearRampToValueAtTime(0.0001, endTime)
        } else {
          clipGain.gain.exponentialRampToValueAtTime(0.0001, endTime)
        }
      }
    }
  }, [getCtx])

  // ── Flex Pitch — time-preserving pitch shift via resample trick ──────────
  // Strategy: render the source at rate = 2^(semitones/12) into an OfflineAudioContext
  // whose sampleRate is shifted inversely, so the output has the same number of samples
  // as the original but at a different pitch. Result is cached per clip+semitones.
  const applyPitchShift = useCallback(async (
    buffer: AudioBuffer,
    cacheKey: string,
    semitones: number,
  ): Promise<AudioBuffer> => {
    const cached = pitchBufferCache.current.get(cacheKey)
    if (cached) return cached

    const rate = Math.pow(2, semitones / 12)
    const ctx = getCtx()
    // We need the output to have the same duration as input.
    // Trick: render at shifted rate into offline ctx with original sample count,
    // but set sampleRate = originalSR / rate so the pitch changes but not duration.
    // However OfflineAudioContext sampleRate must be 8000-96000.
    const shiftedSR = Math.min(96000, Math.max(8000, Math.round(buffer.sampleRate / rate)))
    const numFrames = Math.round(buffer.duration * shiftedSR)
    const offCtx = new OfflineAudioContext(buffer.numberOfChannels, numFrames, shiftedSR)

    const src = offCtx.createBufferSource()
    // Copy buffer into offline ctx
    const offBuf = offCtx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      offBuf.copyToChannel(buffer.getChannelData(ch), ch)
    }
    src.buffer = offBuf
    src.connect(offCtx.destination)
    src.start(0)

    const rendered = await offCtx.startRendering()

    // Now resample rendered back to original sampleRate using another offline ctx
    // so the AudioBufferSourceNode can play it at rate=1 with correct pitch & duration
    const finalFrames = Math.round(rendered.duration * ctx.sampleRate)
    const finalCtx = new OfflineAudioContext(rendered.numberOfChannels, finalFrames, ctx.sampleRate)
    const finalSrc = finalCtx.createBufferSource()
    finalSrc.buffer = rendered
    finalSrc.connect(finalCtx.destination)
    finalSrc.start(0)
    const finalBuf = await finalCtx.startRendering()

    pitchBufferCache.current.set(cacheKey, finalBuf)
    return finalBuf
  }, [getCtx])

  const playClip = useCallback(async (
    audioUrl: string,
    trackId: string,
    clip: Clip,
    bpm: number,
    playheadBeat: number,
    volume: number,
    pan: number,
    loopEndBeat: number = Infinity,
  ) => {
    const ctx = getCtx()
    const nodes = getTrackNodes(trackId, volume, pan)
    console.log('[playClip] Loading buffer for:', audioUrl)
    const buffer = await loadAudioBuffer(audioUrl)
    if (!buffer) {
      console.error('[playClip] Failed to load buffer for:', audioUrl)
      return null
    }
    console.log('[playClip] Buffer loaded, duration:', buffer.duration, 'channels:', buffer.numberOfChannels)

    const beatDuration = 60 / bpm
    const clipStartSec = clip.startBeat * beatDuration
    let clipDurBeats = clip.durationBeats
    // Clip duration to loop end if looping is active
    if (loopEndBeat < Infinity && clip.startBeat + clipDurBeats > loopEndBeat) {
      clipDurBeats = Math.max(0, loopEndBeat - clip.startBeat)
    }
    const clipDurSec = clipDurBeats * beatDuration
    const playheadSec = playheadBeat * beatDuration
    const clipOffset = Math.max(0, playheadSec - clipStartSec)
    if (clipOffset >= clipDurSec) return null

    // Flex Pitch — apply pitch shift before playback (cached)
    let playBuffer = buffer
    const semitones = clip.pitchShift ?? 0
    if (semitones !== 0) {
      const cacheKey = `${clip.id}:pitch:${semitones}`
      playBuffer = await applyPitchShift(buffer, cacheKey, semitones)
    }

    const source = ctx.createBufferSource()
    source.buffer = playBuffer
    // Flex Time — non-destructive time stretch via playbackRate
    const flexRate = clip.flexRate ?? 1
    source.playbackRate.value = flexRate
    if (clip.looped) source.loop = true

    const clipGain = ctx.createGain()
    clipGain.gain.value = clip.gain
    source.connect(clipGain)
    clipGain.connect(nodes.gain)

    const when = Math.max(0, clipStartSec - playheadSec)
    const scheduledAt = ctx.currentTime + when
    const playDuration = clipDurSec - clipOffset
    // For flexRate != 1, buffer offset is in buffer-time (scaled by flex rate)
    const bufferOffset = clipOffset * flexRate
    const bufferDuration = playDuration * flexRate

    source.start(scheduledAt, bufferOffset, clip.looped ? undefined : bufferDuration)

    // Apply fade ramps
    applyFadeRamps(clipGain, clip, bpm, clipOffset, scheduledAt, playDuration)

    scheduledSourcesRef.current.push({ source, clipId: clip.id })
    source.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter(s => s.source !== source)
    }
    return source
  }, [getCtx, getTrackNodes, loadAudioBuffer, applyFadeRamps])



  // ── MIDI Synth — schedule all notes in a MIDI clip ────────────────────────
  const scheduleMidiClip = useCallback((
    trackId: string,
    clip: import('../store/projectStore').Clip,
    bpm: number,
    fromBeat: number,
    volume: number,
    loopEndBeat: number = Infinity,
  ) => {
    const ctx = getCtx()
    const nodes = getTrackNodes(trackId, volume, 0)
    const secPerBeat = 60 / bpm
    const now = ctx.currentTime
    const clipStartSec = Math.max(0, (clip.startBeat - fromBeat) * secPerBeat)

    for (const note of (clip.midiNotes ?? [])) {
      const noteStartBeat = clip.startBeat + note.startBeat
      const noteEndBeat   = noteStartBeat + note.durationBeats

      // Skip notes entirely before playhead
      if (noteEndBeat * secPerBeat <= fromBeat * secPerBeat) continue
      
      // Skip notes that start at or after loop end
      if (loopEndBeat < Infinity && noteStartBeat >= loopEndBeat) continue

      // Compute absolute schedule times
      const absStartSec = (noteStartBeat - fromBeat) * secPerBeat
      const absDurSec   = note.durationBeats * secPerBeat
      const schedStart  = now + Math.max(0, absStartSec)
      const schedEnd    = now + Math.max(schedStart - now + 0.01, absStartSec + absDurSec)

      // Frequency from MIDI pitch (A4 = 440 Hz = pitch 69)
      const freq = 440 * Math.pow(2, (note.pitch - 69) / 12)
      const vel  = (note.velocity ?? 100) / 127

      // Build oscillator + envelope
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(nodes.gain)

      // Attack / sustain / release envelope
      gain.gain.setValueAtTime(0, schedStart)
      gain.gain.linearRampToValueAtTime(vel * 0.7, schedStart + 0.005)
      gain.gain.setValueAtTime(vel * 0.7, schedEnd - 0.02)
      gain.gain.linearRampToValueAtTime(0, schedEnd)

      osc.start(schedStart)
      osc.stop(schedEnd + 0.05)

      // Track for cleanup
      scheduledSourcesRef.current.push({ source: osc as unknown as AudioBufferSourceNode, clipId: clip.id })
    }
  }, [getCtx, getTrackNodes])

  const startPlayback = useCallback(async (fromBeat: number) => {
    const ctx = getCtx()
    console.log('[startPlayback] fromBeat:', fromBeat, 'ctx.state:', ctx.state)
    if (ctx.state === 'suspended') await ctx.resume()
    const { tracks, bpm, isLooping, loopStart, loopEnd } = useProjectStore.getState()
    const anySolo = tracks.some(t => t.solo && t.type !== 'master')
    console.log('[startPlayback] tracks:', tracks.length, 'bpm:', bpm, 'isLooping:', isLooping)

    for (const track of tracks) {
      if (track.type === 'master') continue
      const effectiveVol = track.muted ? 0 : (anySolo && !track.solo) ? 0 : track.volume
      const nodes = getTrackNodes(track.id, track.volume, track.pan)
      nodes.gain.gain.value = effectiveVol
      if (effectiveVol === 0) continue

      for (const clip of track.clips) {
        if (clip.muted) continue
        const clipEndBeat = clip.startBeat + clip.durationBeats
        if (clipEndBeat <= fromBeat) continue

        // When looping, skip clips that start after loop end
        if (isLooping && clip.startBeat >= loopEnd) continue

        console.log('[startPlayback] Scheduling clip:', clip.name, 'type:', clip.type, 'audioUrl:', clip.audioUrl, 'startBeat:', clip.startBeat)

        if (clip.type === 'midi' && clip.midiNotes?.length) {
          // MIDI clip — schedule notes through the Web Audio synth (respects loop)
          scheduleMidiClip(track.id, clip, bpm, fromBeat, effectiveVol, isLooping ? loopEnd : Infinity)
        } else if (clip.audioUrl) {
          // Audio clip (respects loop)
          await playClip(clip.audioUrl, track.id, clip, bpm, fromBeat, effectiveVol, track.pan, isLooping ? loopEnd : Infinity)
        }
      }
    }
  }, [getCtx, getTrackNodes, playClip, scheduleMidiClip])

  // ── Bus/Send routing — connect track analyser outputs to bus track gains ──
  const applySends = useCallback(() => {
    const { tracks } = useProjectStore.getState()
    const ctx = ctxRef.current
    if (!ctx) return

    for (const track of tracks) {
      if (!track.sends || track.sends.length === 0) continue
      const sourceNodes = trackNodesRef.current.get(track.id)
      if (!sourceNodes) continue

      for (const send of track.sends) {
        if (!send.busId) continue
        const busNodes = trackNodesRef.current.get(send.busId)
        if (!busNodes) continue

        // Create a send gain node keyed by trackId+busId
        const sendKey = `${track.id}:send:${send.busId}`
        let sendGain = (trackNodesRef.current as any).sendGains?.get(sendKey) as GainNode | undefined
        if (!sendGain) {
          sendGain = ctx.createGain()
          // Store send gains in a side map on trackNodesRef
          if (!(trackNodesRef.current as any).sendGains) {
            (trackNodesRef.current as any).sendGains = new Map()
          }
          ;(trackNodesRef.current as any).sendGains.set(sendKey, sendGain)
          // Connect: source analyser → sendGain → bus gain input
          try {
            sourceNodes.analyser.connect(sendGain)
            sendGain.connect(busNodes.gain)
          } catch { /* already connected */ }
        }
        // Update send level
        sendGain.gain.value = send.preFader ? send.level : send.level * track.volume
      }
    }
  }, [])

  // ── Apply solo/mute state live (called when user toggles solo/mute) ──────
  const applySoloMute = useCallback(() => {
    const { tracks } = useProjectStore.getState()
    const anySolo = tracks.some(t => t.solo && t.type !== 'master')
    for (const track of tracks) {
      const nodes = trackNodesRef.current.get(track.id)
      if (!nodes) continue
      const effectiveVol = track.muted ? 0 : (anySolo && !track.solo && track.type !== 'master') ? 0 : track.volume
      nodes.gain.gain.value = effectiveVol
    }
    // Re-apply sends after solo/mute change
    applySends()
  }, [applySends])

  // ── Elite Plugin DSP ────────────────────────────────────────────────────────
  // Generates a waveshaper curve for different saturation modes
  function makeSatCurve(drive: number, mode: number, samples = 256): Float32Array {
    const curve = new Float32Array(samples)
    const k = Math.max(0.001, drive * 20) // 0-10 drive → 0-200 curve factor
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1 // -1 to +1
      switch (Math.round(mode)) {
        case 0: // Tape — soft even-harmonic saturation (tanh)
          curve[i] = Math.tanh(k * x) / Math.tanh(k)
          break
        case 1: // Tube — asymmetric warmth, triode character
          // Positive half: standard tanh; negative half: softer knee → triode character
          curve[i] = x > 0
            ? Math.tanh(k * x) / Math.tanh(k)
            : (Math.tanh(k * x * 0.7) / Math.tanh(k)) * 1.05
          break
        case 2: // Clip — hard clipping with soft knee
          { const knee = 0.7 - drive * 0.04
            curve[i] = Math.abs(x) < knee ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh((Math.abs(x) - knee) / (1 - knee) * 3))
          }
          break
        case 3: // Fuzz — aggressive odd-harmonic + square tendency
          curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * (1 + k * 2)))
          break
        default:
          curve[i] = x
      }
    }
    return curve
  }

  const applyElitePlugins = useCallback(() => {
    const { tracks } = useProjectStore.getState()
    const ctx = getCtx()

    for (const track of tracks) {
      const nodes = trackNodesRef.current.get(track.id)
      if (!nodes) continue

      // ── FS-Saturn: Multiband Saturation ──────────────────────────────────
      const satPlugin = track.plugins.find(p => p.type === 'saturation' && p.enabled)
      if (satPlugin && nodes.satMixWet) {
        const sp = satPlugin.params
        // Update waveshaper curves
        if (nodes.satLowWS)  nodes.satLowWS.curve  = new Float32Array(makeSatCurve(sp.lowDrive ?? 0,  sp.lowMode ?? 0))
        if (nodes.satMidWS)  nodes.satMidWS.curve  = new Float32Array(makeSatCurve(sp.midDrive ?? 0,  sp.midMode ?? 1))
        if (nodes.satHighWS) nodes.satHighWS.curve = new Float32Array(makeSatCurve(sp.highDrive ?? 0, sp.highMode ?? 2))
        // Update crossover freqs
        if (nodes.satLowLP)  nodes.satLowLP.frequency.setTargetAtTime(sp.lowFreq ?? 250, ctx.currentTime, 0.01)
        if (nodes.satMidHP)  nodes.satMidHP.frequency.setTargetAtTime(sp.lowFreq ?? 250, ctx.currentTime, 0.01)
        if (nodes.satMidLP)  nodes.satMidLP.frequency.setTargetAtTime(sp.midFreq ?? 3000, ctx.currentTime, 0.01)
        if (nodes.satHighHP) nodes.satHighHP.frequency.setTargetAtTime(sp.midFreq ?? 3000, ctx.currentTime, 0.01)
        // Mix / output
        const mix = sp.mix ?? 0.5
        nodes.satMixDry!.gain.setTargetAtTime(1 - mix, ctx.currentTime, 0.01)
        nodes.satMixWet.gain.setTargetAtTime(mix, ctx.currentTime, 0.01)
        if (nodes.satOutputGain) {
          const outLin = Math.pow(10, (sp.output ?? 0) / 20)
          nodes.satOutputGain.gain.setTargetAtTime(outLin, ctx.currentTime, 0.01)
        }
      }

      // ── FS-Pressure: Bus Compressor ───────────────────────────────────────
      const pressPlugin = track.plugins.find(p => p.type === 'bus_compressor' && p.enabled)
      if (pressPlugin && nodes.pressureComp) {
        const pp = pressPlugin.params
        // ratio param is a direct value (1.5–20), not an index
        const ratio   = Math.max(1, Math.min(20, pp.ratio ?? 4))
        // attack param is a direct value in seconds (0.0001–0.03)
        const attack  = Math.max(0.0001, Math.min(0.3, pp.attack ?? 0.001))
        const release = pp.release === -1 ? 0.5 : Math.max(0.01, pp.release ?? 0.1) // auto = 500ms

        nodes.pressureComp.threshold.setTargetAtTime(pp.threshold ?? -12, ctx.currentTime, 0.01)
        nodes.pressureComp.ratio.setTargetAtTime(ratio, ctx.currentTime, 0.01)
        nodes.pressureComp.attack.setTargetAtTime(attack, ctx.currentTime, 0.01)
        nodes.pressureComp.release.setTargetAtTime(release, ctx.currentTime, 0.01)

        // Color: knee character — Clean(0) tight knee, SSL(1) medium, Neve(2) soft
        const color = Math.round(pp.color ?? 1)
        nodes.pressureComp.knee.setTargetAtTime(color === 0 ? 2 : color === 1 ? 6 : 10, ctx.currentTime, 0.01)

        // Auto-gain: compensate for GR using standard makeup formula
        let makeup = pp.makeup ?? 0
        if (pp.autoGain) {
          // GR at threshold: |thresh| * (1 - 1/ratio), makeup = GR * 0.45
          const thresh = pp.threshold ?? -12
          makeup = Math.max(0, Math.abs(thresh) * (1 - 1 / ratio) * 0.45)
        }
        const makeupLin = Math.pow(10, makeup / 20)
        nodes.pressureMakeup!.gain.setTargetAtTime(makeupLin, ctx.currentTime, 0.01)

        // Parallel mix: dry=1-mix (NY compression style)
        const mix = Math.max(0, Math.min(1, pp.mix ?? 1))
        nodes.pressureDry!.gain.setTargetAtTime(1 - mix, ctx.currentTime, 0.01)
        nodes.pressureWet!.gain.setTargetAtTime(mix, ctx.currentTime, 0.01)
      }

      // ── FS-Spacetime: Shimmer Reverb + Ping-Pong ──────────────────────────
      const spacePlugin = track.plugins.find(p => p.type === 'spacetime' && p.enabled)
      if (spacePlugin && nodes.spaceReverb) {
        const sp2 = spacePlugin.params
        // Rebuild reverb IR for new size
        const irLen = Math.round(ctx.sampleRate * (sp2.revSize ?? 3.5))
        const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate)
        const damp  = sp2.revDamping ?? 0.4
        for (let ch = 0; ch < 2; ch++) {
          const d = irBuf.getChannelData(ch)
          let lp = 0
          for (let i = 0; i < irLen; i++) {
            const env = Math.pow(1 - i / irLen, 1.5 + damp * 3)
            const noise = (Math.random() * 2 - 1) * env
            lp = lp + (noise - lp) * (1 - damp * 0.6) // simple 1-pole LP
            d[i] = lp
          }
        }
        nodes.spaceReverb.buffer = irBuf

        const revWet = sp2.revWet ?? 0.3
        nodes.spaceReverbGain!.gain.setTargetAtTime(revWet, ctx.currentTime, 0.01)
        nodes.spaceShimmerGain!.gain.setTargetAtTime(revWet * (sp2.shimmer ?? 0.3), ctx.currentTime, 0.01)

        // Ping-pong delay times
        const SYNC_MULT = [1, 0.5, 0.25, 1, 0.125] // free, 1/4, 1/8, 1/2, 1/16
        const bpm = useProjectStore.getState().bpm
        const syncMult = SYNC_MULT[Math.round(sp2.dlySync ?? 1)] ?? 0.5
        const dlyTime = sp2.dlySync === 0 ? (sp2.dlyTime ?? 0.375) : (60 / bpm) * syncMult

        nodes.spacePingDelay!.delayTime.setTargetAtTime(dlyTime, ctx.currentTime, 0.01)
        nodes.spacePongDelay!.delayTime.setTargetAtTime(dlyTime, ctx.currentTime, 0.01)
        nodes.spacePingGain!.gain.setTargetAtTime(sp2.dlyFeedback ?? 0.4, ctx.currentTime, 0.01)
        nodes.spacePongGain!.gain.setTargetAtTime(sp2.dlyFeedback ?? 0.4, ctx.currentTime, 0.01)
        nodes.spaceDlyWet!.gain.setTargetAtTime(sp2.dlyWet ?? 0.2, ctx.currentTime, 0.01)
      }

      // ── FS-Transient: Attack/Sustain Designer ─────────────────────────────
      const transPlugin = track.plugins.find(p => p.type === 'transient' && p.enabled)
      if (transPlugin && nodes.transientComp) {
        const tp = transPlugin.params
        const mode = Math.round(tp.mode ?? 1)
        // Map attack/sustain to compressor parameters
        // Attack boost → fast comp with high ratio that opens on transients
        // Sustain control → slow release shaping
        const attackBoost = tp.attack ?? 0   // -24 to +24
        const sustainVal  = tp.sustain ?? 0  // -24 to +24

        // Transient attack: fast comp to clamp or boost transients
        const compAttack  = mode === 0 ? 0.0001 : mode === 1 ? 0.001 : 0.003
        const compRelease = 0.05 + Math.max(0, sustainVal / 24) * 0.3

        nodes.transientComp.threshold.setTargetAtTime(-30 - (tp.sensitivity ?? 0.5) * 20, ctx.currentTime, 0.01)
        nodes.transientComp.ratio.setTargetAtTime(attackBoost < 0 ? 4 : 1.5, ctx.currentTime, 0.01)
        nodes.transientComp.attack.setTargetAtTime(compAttack, ctx.currentTime, 0.01)
        nodes.transientComp.release.setTargetAtTime(compRelease, ctx.currentTime, 0.01)

        // Output gain from transient designer
        const outputGain = Math.pow(10, (tp.gain ?? 0) / 20)
        const clipGain = tp.clipProtect ? Math.min(outputGain, 0.99) : outputGain
        nodes.transientMakeup!.gain.setTargetAtTime(clipGain, ctx.currentTime, 0.01)
      }

      // ── FS-Nova: Multiband Expander / Gate ──────────────────────────────────
      const novaPlugin = track.plugins.find(p => p.type === 'expander' && p.enabled)
      if (novaPlugin && nodes.novaGate) {
        const np = novaPlugin.params
        const thresh  = np.threshold ?? -50
        const ratio   = np.ratio ?? 10
        const attack  = np.attack ?? 0.001
        const release = np.release ?? 0.1
        nodes.novaGate.threshold.setTargetAtTime(thresh, ctx.currentTime, 0.01)
        nodes.novaGate.ratio.setTargetAtTime(ratio, ctx.currentTime, 0.01)
        nodes.novaGate.attack.setTargetAtTime(attack, ctx.currentTime, 0.01)
        nodes.novaGate.release.setTargetAtTime(release, ctx.currentTime, 0.01)
        const makeup = Math.pow(10, (np.makeup ?? 0) / 20)
        nodes.novaMakeup!.gain.setTargetAtTime(makeup, ctx.currentTime, 0.01)
        // Active: gate wet = gated signal, dry = 0 (gate replaces direct panner)
        nodes.novaWet!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
        nodes.novaDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      } else if (nodes.novaWet) {
        // Inactive: both = 0, panner→analyser provides the signal directly
        nodes.novaWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.novaDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // ── FS-Prism: Harmonic Exciter ────────────────────────────────────────
      const prismPlugin = track.plugins.find(p => p.type === 'exciter' && p.enabled)
      if (prismPlugin && nodes.prismHP) {
        const pp = prismPlugin.params
        nodes.prismHP.frequency.setTargetAtTime(pp.freq ?? 3000, ctx.currentTime, 0.01)
        nodes.prismHP.Q.setTargetAtTime(pp.q ?? 0.7, ctx.currentTime, 0.01)
        // Drive: scale harmonic waveshaper curve
        const harmonicAmt = Math.max(0, Math.min(1, pp.drive ?? 0.3))
        // prismHarmonicGain is fixed at 1 — the waveshaper curve already encodes the drive amount
        // Setting it to harmonicAmt would double-attenuate the wet signal
        nodes.prismHarmonicGain!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
        // Exciter curve — drive shapes 2nd+3rd harmonic generation; k=1 (no drive) → k=6 (full)
        const excCurve = new Float32Array(256)
        const k = 1 + harmonicAmt * 5
        for (let i = 0; i < 256; i++) {
          const x = (i * 2) / 256 - 1
          // tanh normalised so output stays within [-1,+1] regardless of k
          excCurve[i] = Math.tanh(k * x) / Math.tanh(k) * 0.6
        }
        if (nodes.prismWS) nodes.prismWS.curve = excCurve
        // mix param (0–1) is the wet blend level
        nodes.prismWet!.gain.setTargetAtTime(Math.max(0, Math.min(1, pp.mix ?? 0.4)), ctx.currentTime, 0.01)
        nodes.prismDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      } else if (nodes.prismWet) {
        nodes.prismWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.prismDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // ── FS-Vibe: Tape Vibrato ─────────────────────────────────────────────
      const vibePlugin = track.plugins.find(p => p.type === 'vibrato' && p.enabled)
      if (vibePlugin && nodes.vibeDelay) {
        const vp = vibePlugin.params
        const depth = Math.max(0.0001, Math.min(0.01, vp.depth ?? 0.003)) // ±0.1ms–±10ms
        const mix   = vp.mix ?? 0.5
        const rate  = Math.max(0.1, Math.min(20, vp.rate ?? 5))
        // LFO rate and depth
        if (nodes.vibeLFO) nodes.vibeLFO.frequency.setTargetAtTime(rate, ctx.currentTime, 0.01)
        if (nodes.vibeLFOGain) nodes.vibeLFOGain.gain.setTargetAtTime(depth, ctx.currentTime, 0.01)
        // Center delay must be >= depth so delayTime (center - LFO*depth) never goes negative
        // Using 2×depth as minimum center ensures headroom for modulation
        const centerDelay = Math.max(0.005, depth * 2)
        nodes.vibeDelay.delayTime.setTargetAtTime(centerDelay, ctx.currentTime, 0.02)
        nodes.vibeWet!.gain.setTargetAtTime(mix, ctx.currentTime, 0.01)
        nodes.vibeDry!.gain.setTargetAtTime(1 - mix, ctx.currentTime, 0.01)
      } else if (nodes.vibeWet) {
        nodes.vibeWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.vibeDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // ── FS-Phase: Stereo Width / M-S ──────────────────────────────────────
      const phasePlugin = track.plugins.find(p => p.type === 'stereo_width' && p.enabled)
      if (phasePlugin && nodes.phaseMid) {
        const php = phasePlugin.params
        const width    = php.width ?? 1.0     // 0 = mono, 1 = normal, 2 = wide
        const midGain  = 1.0
        const sideGain = Math.max(0, width)
        nodes.phaseMid.gain.setTargetAtTime(midGain, ctx.currentTime, 0.01)
        nodes.phaseSide!.gain.setTargetAtTime(sideGain, ctx.currentTime, 0.01)
        nodes.phaseWidthOut!.gain.setTargetAtTime(Math.pow(10, (php.output ?? 0) / 20), ctx.currentTime, 0.01)
      } else if (nodes.phaseMid) {
        // Inactive: zero out width output (panner→analyser handles signal directly)
        nodes.phaseMid.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.phaseSide!.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.phaseWidthOut!.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
      }

      // ── FS-Oxide: Tape Emulation ──────────────────────────────────────────
      const oxidePlugin = track.plugins.find(p => p.type === 'tape' && p.enabled)
      if (oxidePlugin && nodes.oxideWS) {
        const op = oxidePlugin.params
        const satAmt  = op.saturation ?? 0.3
        const lpFreq  = op.brightness ?? 16000
        const hpFreq  = op.bass ?? 30
        // Update tape saturation curve
        const tapeCurve = new Float32Array(256)
        const k = 1 + satAmt * 8
        for (let i = 0; i < 256; i++) {
          const x = (i * 2) / 256 - 1
          tapeCurve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * k)) * (1 / (1 - Math.exp(-k)))
        }
        nodes.oxideWS.curve = tapeCurve
        nodes.oxideLP!.frequency.setTargetAtTime(lpFreq, ctx.currentTime, 0.01)
        nodes.oxideHPF!.frequency.setTargetAtTime(hpFreq, ctx.currentTime, 0.01)
        const mix = op.mix ?? 0.5
        nodes.oxideWet!.gain.setTargetAtTime(mix, ctx.currentTime, 0.01)
        nodes.oxideDry!.gain.setTargetAtTime(1 - mix, ctx.currentTime, 0.01)
      } else if (nodes.oxideWet) {
        nodes.oxideWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.oxideDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // ── FS-Hades: Sub Enhancer ────────────────────────────────────────────
      const hadesPlugin = track.plugins.find(p => p.type === 'sub_enhancer' && p.enabled)
      if (hadesPlugin && nodes.hadesLP) {
        const hp = hadesPlugin.params
        const freq   = hp.freq ?? 120
        const amount = hp.amount ?? 0.4
        nodes.hadesLP.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01)
        // Sub curve — heavier drive for more harmonic content
        const subCurve = new Float32Array(256)
        const k = 1 + amount * 10
        for (let i = 0; i < 256; i++) {
          const x = (i * 2) / 256 - 1
          subCurve[i] = Math.sign(x) * Math.pow(Math.abs(x), 0.3 + (1 - amount) * 0.5)
        }
        if (nodes.hadesWS) nodes.hadesWS.curve = subCurve
        nodes.hadesSubGain!.gain.setTargetAtTime(amount * 0.5, ctx.currentTime, 0.01)
        nodes.hadesDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      } else if (nodes.hadesSubGain) {
        nodes.hadesSubGain.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.hadesDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // ── FS-Shield: Noise Gate ─────────────────────────────────────────────
      // Note: Web Audio DynamicsCompressor is a downward compressor, not a gate.
      // With ratio=20 and very low threshold it acts as a hard expander/limiter.
      // The gating effect is achieved by using it as a parallel path: when active,
      // the gated signal (shieldMakeup) is set to 0.5 so the direct panner path
      // and the gated path sum to the correct level without doubling.
      const shieldPlugin = track.plugins.find(p => p.type === 'noise_gate' && p.enabled)
      if (shieldPlugin && nodes.shieldComp) {
        const sp = shieldPlugin.params
        nodes.shieldComp.threshold.setTargetAtTime(sp.threshold ?? -60, ctx.currentTime, 0.01)
        nodes.shieldComp.ratio.setTargetAtTime(20, ctx.currentTime, 0.01) // hard limiting above threshold
        nodes.shieldComp.attack.setTargetAtTime(sp.attack ?? 0.001, ctx.currentTime, 0.01)
        nodes.shieldComp.release.setTargetAtTime(sp.release ?? 0.2, ctx.currentTime, 0.01)
        nodes.shieldComp.knee.setTargetAtTime(sp.hysteresis ?? 3, ctx.currentTime, 0.01)
        // Makeup at 0.5 compensates for the parallel doubling with panner→analyser direct path
        const makeupDb = sp.makeup ?? 0
        const makeup = Math.pow(10, makeupDb / 20) * 0.5
        nodes.shieldMakeup!.gain.setTargetAtTime(makeup, ctx.currentTime, 0.01)
      } else if (nodes.shieldMakeup) {
        // Inactive: zero out — panner→analyser handles signal directly
        nodes.shieldMakeup.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
      }

      // ── FS-Flux: Pitch Correct (simplified blend) ─────────────────────────
      const fluxPlugin = track.plugins.find(p => p.type === 'pitch_correct' && p.enabled)
      if (fluxPlugin && nodes.fluxDelay) {
        const fp = fluxPlugin.params
        // Speed = correction speed (0 = off, 1 = instant)
        const speed  = fp.speed ?? 0.5
        const amount = fp.amount ?? 0.5
        // Subtle pitch correction emulated as a very short detuned delay blend
        nodes.fluxDelay.delayTime.setTargetAtTime(0.001 + (1 - speed) * 0.01, ctx.currentTime, 0.02)
        nodes.fluxWet!.gain.setTargetAtTime(amount * 0.2, ctx.currentTime, 0.01) // subtle
        nodes.fluxDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      } else if (nodes.fluxWet) {
        // When disabled, bypass via dry path
        nodes.fluxWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.fluxDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // ── FS-Forge: Parallel Compressor ─────────────────────────────────────
      const forgePlugin = track.plugins.find(p => p.type === 'parallel_comp' && p.enabled)
      if (forgePlugin && nodes.forgeComp) {
        const fp = forgePlugin.params
        nodes.forgeComp.threshold.setTargetAtTime(fp.threshold ?? -20, ctx.currentTime, 0.01)
        nodes.forgeComp.ratio.setTargetAtTime(fp.ratio ?? 6, ctx.currentTime, 0.01)
        nodes.forgeComp.attack.setTargetAtTime(fp.attack ?? 0.005, ctx.currentTime, 0.01)
        nodes.forgeComp.release.setTargetAtTime(fp.release ?? 0.2, ctx.currentTime, 0.01)
        nodes.forgeComp.knee.setTargetAtTime(fp.knee ?? 10, ctx.currentTime, 0.01)
        const makeup = Math.pow(10, (fp.makeup ?? 0) / 20)
        nodes.forgeMakeup!.gain.setTargetAtTime(makeup, ctx.currentTime, 0.01)
        const blend = Math.max(0, Math.min(1, fp.blend ?? 0.5))  // 0 = dry only, 1 = full NY comp
        // NY (parallel) compression: dry is always at unity, wet is blended in additively
        // This preserves transient integrity while adding compressed sustain
        nodes.forgeDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
        nodes.forgeWet!.gain.setTargetAtTime(blend, ctx.currentTime, 0.01)
      } else if (nodes.forgeWet) {
        nodes.forgeWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.forgeDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // ── FS-Crystal: Granular Freeze ───────────────────────────────────────
      const crystalPlugin = track.plugins.find(p => p.type === 'granular' && p.enabled)
      if (crystalPlugin && nodes.crystalReverb) {
        const cp = crystalPlugin.params
        const size  = cp.size ?? 6          // IR length in seconds
        const decay = cp.decay ?? 0.5       // flatness (0 = fast decay, 1 = freeze)
        const mix   = cp.mix ?? 0.3
        // Rebuild crystal IR with new size and decay
        const irLen = Math.round(ctx.sampleRate * size)
        const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate)
        for (let ch = 0; ch < 2; ch++) {
          const d = irBuf.getChannelData(ch)
          for (let i = 0; i < irLen; i++) {
            const env = Math.pow(1 - i / irLen, Math.max(0.01, (1 - decay) * 2))
            d[i] = (Math.random() * 2 - 1) * env
          }
        }
        nodes.crystalReverb.buffer = irBuf
        nodes.crystalGain!.gain.setTargetAtTime(mix, ctx.currentTime, 0.01)
        nodes.crystalDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      } else if (nodes.crystalGain) {
        nodes.crystalGain.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.crystalDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // ── Flowstate Pro Suite DSP ────────────────────────────────────────────
      // All FS-Pro plugins use the main reverb/delay/compressor nodes with
      // param-mapped values. They operate as parameter-remap layers on top of
      // the existing Web Audio signal chain.

      // FS-ProQ: 8-band EQ → remap to 3-band EQ (lowShelf, midPeak, highShelf)
      // Params: b1f..b8f = freq, b2g..b8g = gain, b2q..b8q = Q, output
      const proqPlugin = track.plugins.find(p => p.type === 'fs_proq' && p.enabled)
      if (proqPlugin && nodes.lowShelf && nodes.midPeak && nodes.highShelf) {
        const pp = proqPlugin.params
        // Map bands 4,5,6 to low shelf, mid peak, high shelf
        if (nodes.lowShelf) {
          nodes.lowShelf.frequency.setTargetAtTime(pp.b4f ?? 320, ctx.currentTime, 0.01)
          nodes.lowShelf.gain.setTargetAtTime(pp.b4g ?? 0, ctx.currentTime, 0.01)
        }
        if (nodes.midPeak) {
          nodes.midPeak.frequency.setTargetAtTime(pp.b5f ?? 1000, ctx.currentTime, 0.01)
          nodes.midPeak.gain.setTargetAtTime(pp.b5g ?? 0, ctx.currentTime, 0.01)
          nodes.midPeak.Q.setTargetAtTime(pp.b5q ?? 1.0, ctx.currentTime, 0.01)
        }
        if (nodes.highShelf) {
          nodes.highShelf.frequency.setTargetAtTime(pp.b6f ?? 3200, ctx.currentTime, 0.01)
          nodes.highShelf.gain.setTargetAtTime(pp.b6g ?? 0, ctx.currentTime, 0.01)
        }
        // Output trim
        const outGain = track.volume * Math.pow(10, (pp.output ?? 0) / 20)
        nodes.gain.gain.setTargetAtTime(Math.max(0, outGain), ctx.currentTime, 0.01)
      }

      // FS-Cosmos: Algorithmic Reverb → maps to spaceReverb nodes
      const cosmosPlugin = track.plugins.find(p => p.type === 'fs_vintage_verb' && p.enabled)
      if (cosmosPlugin && nodes.spaceReverb && nodes.spaceReverbGain) {
        const cp = cosmosPlugin.params
        const wet  = cp.wet  ?? 0.3
        const size = cp.size ?? 1.5
        const damp = cp.damp ?? 0.5  // 'damp' not 'damping' per FLOWSTATE_PRO_DEFAULTS
        // Rebuild IR
        const irLen = Math.round(ctx.sampleRate * Math.max(0.1, size))
        const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate)
        for (let ch = 0; ch < 2; ch++) {
          const d = irBuf.getChannelData(ch)
          let lp = 0
          for (let i = 0; i < irLen; i++) {
            const env = Math.pow(1 - i / irLen, 1.5 + damp * 3)
            lp = lp + ((Math.random() * 2 - 1) * env - lp) * (1 - damp * 0.5)
            d[i] = lp
          }
        }
        nodes.spaceReverb.buffer = irBuf
        nodes.spaceReverbGain.gain.setTargetAtTime(wet, ctx.currentTime, 0.01)
        // fs_vintage_verb has no shimmer param; shimmer defaults to 0 to avoid extra wash
        nodes.spaceShimmerGain!.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
      } else if (cosmosPlugin === undefined && nodes.spaceReverbGain) {
        // Don't override if spacetime plugin is also present
        const hasSpacetime = track.plugins.find(p => p.type === 'spacetime' && p.enabled)
        if (!hasSpacetime) nodes.spaceReverbGain.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
      }

      // FS-Echo: Tape/BBD Delay → maps to spacePingDelay / delayWet nodes
      const echoPlugin = track.plugins.find(p => p.type === 'fs_echo' && p.enabled)
      if (echoPlugin && nodes.spacePingDelay && nodes.spaceDlyWet) {
        const ep = echoPlugin.params
        const bpm2  = useProjectStore.getState().bpm
        const sync  = ep.sync ?? 0
        const syncDivOptions = [0.5, 0.25, 0.125, 1]
        const time2 = sync > 0
          ? (60 / bpm2) * (syncDivOptions[Math.round(ep.syncDiv ?? 0)] ?? 0.25)
          : (ep.time ?? 0.375)
        nodes.spacePingDelay.delayTime.setTargetAtTime(Math.max(0.001, Math.min(3, time2)), ctx.currentTime, 0.01)
        nodes.spacePongDelay!.delayTime.setTargetAtTime(Math.max(0.001, Math.min(3, time2 * (1 + (ep.spread ?? 0) * 0.2))), ctx.currentTime, 0.01)
        nodes.spacePingGain!.gain.setTargetAtTime(Math.max(0, Math.min(0.98, ep.feedback ?? 0.4)), ctx.currentTime, 0.01)
        nodes.spacePongGain!.gain.setTargetAtTime(Math.max(0, Math.min(0.98, ep.feedback ?? 0.4)), ctx.currentTime, 0.01)
        nodes.spaceDlyWet.gain.setTargetAtTime(ep.wet ?? 0.3, ctx.currentTime, 0.01)
      } else if (echoPlugin === undefined && nodes.spaceDlyWet) {
        const hasSpacetime2 = track.plugins.find(p => p.type === 'spacetime' && p.enabled)
        if (!hasSpacetime2) nodes.spaceDlyWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
      }

      // FS-Master: Mastering Suite → remap to comp + EQ nodes
      const masterPlugin = track.plugins.find(p => p.type === 'fs_mastering' && p.enabled)
      if (masterPlugin && nodes.compressor) {
        const mp = masterPlugin.params
        // Tonal: EQ — params: low/lom/him/high match shelf/peak gains
        if (nodes.lowShelf) nodes.lowShelf.gain.setTargetAtTime(mp.low ?? 0, ctx.currentTime, 0.01)
        if (nodes.highShelf) nodes.highShelf.gain.setTargetAtTime(mp.high ?? 0, ctx.currentTime, 0.01)
        // Dynamics: comp — params: cThresh/cRatio/cAttack/cRelease
        nodes.compressor.threshold.setTargetAtTime(mp.cThresh ?? -18, ctx.currentTime, 0.01)
        nodes.compressor.ratio.setTargetAtTime(mp.cRatio ?? 2, ctx.currentTime, 0.01)
        nodes.compressor.attack.setTargetAtTime(mp.cAttack ?? 0.01, ctx.currentTime, 0.01)
        nodes.compressor.release.setTargetAtTime(mp.cRelease ?? 0.15, ctx.currentTime, 0.01)
        // Loudness: lufs param — rough gain targeting to hit the target LUFS level
        // If target is -14 LUFS and reference is -14, gain = 0 dB (no change)
        // If target is -10 LUFS (louder), gain = +4 dB; if -18 (quieter), gain = -4 dB
        const lufsTarget = mp.lufs ?? -14
        const lufsGain   = Math.pow(10, (lufsTarget - (-14)) / 20)
        nodes.gain.gain.setTargetAtTime(Math.max(0, track.volume * lufsGain), ctx.currentTime, 0.05)
      }

      // FS-Crush: Multiband Compressor → maps to pressureComp (only if FS-Pressure not also active)
      const crushPlugin = track.plugins.find(p => p.type === 'fs_multiband_comp' && p.enabled)
      if (crushPlugin && nodes.pressureComp && !pressPlugin) {
        const ccp = crushPlugin.params
        // Average the 4-band thresholds and ratios into a single wideband compressor setting
        const avgThresh = ((ccp.loThresh ?? -20) + (ccp.lmThresh ?? -20) + (ccp.hmThresh ?? -20) + (ccp.hiThresh ?? -20)) / 4
        const avgRatio  = Math.max(1, Math.min(20, ((ccp.loRatio ?? 4) + (ccp.lmRatio ?? 4) + (ccp.hmRatio ?? 4) + (ccp.hiRatio ?? 4)) / 4))
        nodes.pressureComp.threshold.setTargetAtTime(avgThresh, ctx.currentTime, 0.01)
        nodes.pressureComp.ratio.setTargetAtTime(avgRatio, ctx.currentTime, 0.01)
        nodes.pressureComp.attack.setTargetAtTime(Math.max(0.0001, ccp.loAtk ?? 0.01), ctx.currentTime, 0.01)
        nodes.pressureComp.release.setTargetAtTime(Math.max(0.01, ccp.loRel ?? 0.15), ctx.currentTime, 0.01)
        nodes.pressureComp.knee.setTargetAtTime(6, ctx.currentTime, 0.01)
        nodes.pressureMakeup!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
        // Full wet mode: only compressed signal passes to transient designer
        nodes.pressureDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
        nodes.pressureWet!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // FS-Apex: True-Peak Limiter → maps to track compressor as a per-track hard limiter
      // Only applied if FS-Master is not also active (they both use the compressor node)
      const apexPlugin = track.plugins.find(p => p.type === 'fs_peak_limiter' && p.enabled)
      if (apexPlugin && nodes.compressor && !masterPlugin) {
        const ap = apexPlugin.params
        nodes.compressor.threshold.setTargetAtTime(ap.threshold ?? -1, ctx.currentTime, 0.01)
        nodes.compressor.ratio.setTargetAtTime(20, ctx.currentTime, 0.01) // hard limit
        nodes.compressor.attack.setTargetAtTime(0.0001, ctx.currentTime, 0.01)
        nodes.compressor.release.setTargetAtTime(Math.max(0.001, ap.release ?? 0.05), ctx.currentTime, 0.01)
        nodes.compressor.knee.setTargetAtTime(0, ctx.currentTime, 0.01)
        const inputGain = Math.pow(10, (ap.input ?? 0) / 20)
        nodes.gain.gain.setTargetAtTime(Math.max(0, track.volume * inputGain), ctx.currentTime, 0.01)
      } else if (!apexPlugin && !masterPlugin && nodes.compressor) {
        // Reset compressor to default track settings when neither Apex nor Master is active
        nodes.compressor.threshold.setTargetAtTime(-24, ctx.currentTime, 0.05)
        nodes.compressor.ratio.setTargetAtTime(4, ctx.currentTime, 0.05)
        nodes.compressor.attack.setTargetAtTime(0.003, ctx.currentTime, 0.05)
        nodes.compressor.release.setTargetAtTime(0.25, ctx.currentTime, 0.05)
        nodes.compressor.knee.setTargetAtTime(30, ctx.currentTime, 0.05)
      }

      // FS-Spacer: Spectral Carver → uses hadesLP as a notch-approximation band-cut
      // The idea: LP-filter the signal at rangeHz, then blend dry with LP-filtered
      // giving a high-frequency reduction ("carving space" for other instruments)
      const spacerPlugin = track.plugins.find(p => p.type === 'fs_spacer' && p.enabled)
      if (spacerPlugin && nodes.hadesLP && !hadesPlugin) {
        const sp3 = spacerPlugin.params
        const rangeHz = Math.max(200, Math.min(18000, sp3.rangeHz ?? 3000))
        const depth   = Math.max(0, Math.min(1, sp3.depth ?? 0.5))
        // Use hadesLP as the band-cut filter: LP below rangeHz = preserve lows, cut highs
        nodes.hadesLP.frequency.setTargetAtTime(rangeHz, ctx.currentTime, 0.01)
        nodes.hadesLP.Q.setTargetAtTime(0.5, ctx.currentTime, 0.01)
        // hadesSubGain = wet (LP-filtered = the "carved" signal, replacing highs)
        // hadesDry = original; blend: depth controls how much to cut highs
        nodes.hadesSubGain!.gain.setTargetAtTime(depth, ctx.currentTime, 0.01)
        nodes.hadesDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // FS-Reel: Analog Tape Delay → tape saturation via oxideWS + spacePingDelay for delay
      const reelPlugin = track.plugins.find(p => p.type === 'fs_tape_delay' && p.enabled)
      if (reelPlugin && nodes.oxideWS && nodes.spacePingDelay) {
        const rp = reelPlugin.params
        const satAmt = Math.max(0, Math.min(1, rp.saturation ?? 0.3))
        const wetAmt = Math.max(0, Math.min(1, rp.wet ?? 0.35))
        // Tape saturation curve: tanh normalised, k=1..7 based on saturation amount
        const tapeCurve2 = new Float32Array(256)
        const k2 = 1 + satAmt * 6
        for (let i = 0; i < 256; i++) {
          const x = (i * 2) / 256 - 1
          tapeCurve2[i] = Math.tanh(k2 * x) / Math.tanh(k2)
        }
        nodes.oxideWS.curve = tapeCurve2
        nodes.oxideWet!.gain.setTargetAtTime(wetAmt, ctx.currentTime, 0.01)
        nodes.oxideDry!.gain.setTargetAtTime(1 - wetAmt, ctx.currentTime, 0.01)
        // Tape delay time (sync uses 1/2 note = 0.5 beat multiplier)
        const bpm3 = useProjectStore.getState().bpm
        const dlyT = rp.sync ? Math.max(0.001, Math.min(3, (60 / bpm3) * 0.5)) : Math.max(0.001, Math.min(3, rp.time ?? 0.5))
        nodes.spacePingDelay.delayTime.setTargetAtTime(dlyT, ctx.currentTime, 0.01)
        nodes.spaceDlyWet!.gain.setTargetAtTime(wetAmt, ctx.currentTime, 0.01)
        nodes.spacePingGain!.gain.setTargetAtTime(Math.max(0, Math.min(0.98, rp.feedback ?? 0.4)), ctx.currentTime, 0.01)
      }

      // FS-Aura: Vocal Enhancer → maps to prismHP exciter (air/presence boost)
      // air/presence params are in dB (-12..+12); normalize to 0..1 for frequency/amount mapping
      const auraPlugin = track.plugins.find(p => p.type === 'fs_vocal_enhance' && p.enabled)
      if (auraPlugin && nodes.prismHP && !spacerPlugin && !reelPlugin) {
        const auP = auraPlugin.params
        // air param: -12..+12 dB → normalize to 0..1 for frequency scaling
        const airNorm     = ((auP.air ?? 0) + 12) / 24        // 0..1
        const presNorm    = ((auP.presence ?? 0) + 12) / 24   // 0..1
        const airFreq     = 8000 + airNorm * 8000              // 8kHz–16kHz
        nodes.prismHP.frequency.setTargetAtTime(airFreq, ctx.currentTime, 0.01)
        nodes.prismHP.Q.setTargetAtTime(0.7, ctx.currentTime, 0.01)
        // Harmonic content amount: air and presence normalized to 0..1
        const harmAmt = airNorm * 0.3 + presNorm * 0.2
        nodes.prismHarmonicGain!.gain.setTargetAtTime(1, ctx.currentTime, 0.01) // curve handles drive
        // Rebuild exciter curve based on air/presence amount
        const excCurve2 = new Float32Array(256)
        const k2 = 1 + harmAmt * 5
        for (let i = 0; i < 256; i++) {
          const x = (i * 2) / 256 - 1
          excCurve2[i] = Math.tanh(k2 * x) / Math.tanh(k2) * 0.6
        }
        if (nodes.prismWS) nodes.prismWS.curve = excCurve2
        nodes.prismWet!.gain.setTargetAtTime(Math.max(0, Math.min(1, auP.mix ?? 0.5)), ctx.currentTime, 0.01)
        nodes.prismDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // FS-Voice: Pitch Corrector → maps to fluxDelay nodes
      const voicePlugin = track.plugins.find(p => p.type === 'fs_tuner' && p.enabled)
      if (voicePlugin && nodes.fluxDelay) {
        const vp2 = voicePlugin.params
        // speed/amount are 0-100 in FS-Voice defaults
        const speed2  = (vp2.speed ?? 25) / 100   // normalize 0-100 → 0-1
        const amount2 = (vp2.amount ?? 100) / 100 // normalize 0-100 → 0-1
        nodes.fluxDelay.delayTime.setTargetAtTime(0.001 + (1 - speed2) * 0.008, ctx.currentTime, 0.02)
        nodes.fluxWet!.gain.setTargetAtTime(amount2 * 0.12, ctx.currentTime, 0.01)
        nodes.fluxDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      } else if (voicePlugin === undefined && nodes.fluxWet) {
        const hasFlux2 = track.plugins.find(p => p.type === 'pitch_correct' && p.enabled)
        if (!hasFlux2) {
          nodes.fluxWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
          nodes.fluxDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
        }
      }

      // FS-Dimension: Stereo Chorus → maps to vibeDelay (modulated delay chorus)
      const dimPlugin = track.plugins.find(p => p.type === 'fs_dimension' && p.enabled)
      if (dimPlugin && nodes.vibeDelay && !vibePlugin) {
        const dp    = dimPlugin.params
        const depth2 = (dp.depth ?? 0.3) * 0.008 // 0-8ms chorus depth
        const rate2  = dp.rate ?? 0.5             // chorus rate Hz
        const mix2   = dp.mix ?? 0.5
        if (nodes.vibeLFO)     nodes.vibeLFO.frequency.setTargetAtTime(rate2, ctx.currentTime, 0.01)
        if (nodes.vibeLFOGain) nodes.vibeLFOGain.gain.setTargetAtTime(depth2, ctx.currentTime, 0.01)
        nodes.vibeDelay.delayTime.setTargetAtTime(0.015, ctx.currentTime, 0.01) // 15ms chorus center
        nodes.vibeWet!.gain.setTargetAtTime(mix2, ctx.currentTime, 0.01)
        nodes.vibeDry!.gain.setTargetAtTime(1 - mix2, ctx.currentTime, 0.01)
      } else if (dimPlugin === undefined && !vibePlugin && nodes.vibeWet) {
        nodes.vibeWet.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        nodes.vibeDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
      }

      // FS-Mutate: Vocal Transformer → maps to forgeComp (parallel harmonic path)
      // Uses moderate parallel compression to thicken vocals/add character
      const mutatePlugin = track.plugins.find(p => p.type === 'fs_alter' && p.enabled)
      if (mutatePlugin && nodes.forgeComp && !forgePlugin) {
        const muP = mutatePlugin.params
        // Params: mode/pitch/formant/mix/detune/output/algo/voice
        // Moderate settings: -20dB threshold, ratio 4 — parallel adds presence without distorting
        nodes.forgeComp.threshold.setTargetAtTime(-20, ctx.currentTime, 0.01)
        nodes.forgeComp.ratio.setTargetAtTime(4, ctx.currentTime, 0.01)
        nodes.forgeComp.attack.setTargetAtTime(0.003, ctx.currentTime, 0.01)
        nodes.forgeComp.release.setTargetAtTime(0.1, ctx.currentTime, 0.01)
        nodes.forgeComp.knee.setTargetAtTime(6, ctx.currentTime, 0.01)
        const formAmt = Math.abs(muP.formant ?? 0) // 0..1 range
        const mixAmt  = Math.max(0, Math.min(1, muP.mix ?? 1))
        // Output gain: formant shifts color (subtle +/- 0 to +30% gain)
        const outGainLin = Math.pow(10, (muP.output ?? 0) / 20)
        nodes.forgeMakeup!.gain.setTargetAtTime(outGainLin * (1 + formAmt * 0.2), ctx.currentTime, 0.01)
        // Dry always 1 (preserve original), wet adds the parallel-processed signal
        nodes.forgeDry!.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
        nodes.forgeWet!.gain.setTargetAtTime(mixAmt * 0.5, ctx.currentTime, 0.01)
      }

      // FS-Resonate: Resonance Suppressor → maps to shield (gate/compress resonances)
      const resonPlugin = track.plugins.find(p => p.type === 'fs_resonance' && p.enabled)
      if (resonPlugin && nodes.shieldComp && !shieldPlugin) {
        const rp2 = resonPlugin.params
        // Params: depth(dB)/sharpness/speed/sensitivity/mix/focus/delta/mode
        const resSens  = rp2.sensitivity ?? 0.5   // 0..1 — renamed to avoid shadowing
        const resDepth = rp2.depth ?? 5            // dB of suppression (0..24)
        const resSpeed = Math.max(0.1, rp2.speed ?? 5)  // Hz — response speed
        // Map sensitivity to threshold: higher sensitivity = lower threshold (catch more)
        nodes.shieldComp.threshold.setTargetAtTime(-60 + resSens * 30, ctx.currentTime, 0.01)
        // Ratio: depth controls how hard the resonance is clamped (2=gentle, up to 20=gate)
        nodes.shieldComp.ratio.setTargetAtTime(Math.min(20, 2 + resDepth), ctx.currentTime, 0.01)
        // Attack: 1/speed * 50ms gives fast response at high speed, slow at low speed
        nodes.shieldComp.attack.setTargetAtTime(0.05 / resSpeed, ctx.currentTime, 0.01)
        nodes.shieldComp.release.setTargetAtTime(0.1, ctx.currentTime, 0.01)
        nodes.shieldComp.knee.setTargetAtTime(3, ctx.currentTime, 0.01)
        const resMix = Math.max(0, Math.min(1, rp2.mix ?? 1))
        nodes.shieldMakeup!.gain.setTargetAtTime(resMix, ctx.currentTime, 0.01)
      }

      // FS-Glitch / FS-Spectrum / FS-Wavetable: stepseq/synth plugins
      // These are UI-only plugins (no real DSP via Web Audio for glitch/synth)
      // Their audio content comes from MIDI notes routed through the MIDI engine
      // We just ensure they don't interfere with the signal chain
    }
  }, [getCtx])

  const stopAll = useCallback(() => {
    for (const { source } of scheduledSourcesRef.current) {
      try { source.stop() } catch {}
    }
    scheduledSourcesRef.current = []
  }, [])

  // ── Metronome ────────────────────────────────────────────────────────────
  const startMetronome = useCallback((bpm: number, volume: number) => {
    if (metronomeIntervalRef.current !== null) {
      clearInterval(metronomeIntervalRef.current)
      metronomeIntervalRef.current = null
    }
    const ctx = getCtx()
    const beatMs = (60 / bpm) * 1000
    let beat = 0

    const tick = () => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.connect(g)
      g.connect(ctx.destination)
      osc.frequency.value = beat % 4 === 0 ? 1200 : 800
      g.gain.setValueAtTime(volume, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.06)
      beat++
    }

    tick()
    metronomeIntervalRef.current = window.setInterval(tick, beatMs)
  }, [getCtx])

  const stopMetronome = useCallback(() => {
    if (metronomeIntervalRef.current !== null) {
      clearInterval(metronomeIntervalRef.current)
      metronomeIntervalRef.current = null
    }
  }, [])

  // ── Microphone Recording ─────────────────────────────────────────────────
  const startRecording = useCallback(async (): Promise<void> => {
    try {
      // Professional audio constraints to eliminate noise and humming
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Professional quality settings
          sampleRate: 48000,          // Studio-quality sample rate
          sampleSize: 24,             // 24-bit depth for pro audio
          channelCount: 1,            // Mono for vocals (change to 2 for stereo)
          
          // Noise reduction and processing
          echoCancellation: true,     // Remove echo/feedback
          noiseSuppression: true,     // Remove background noise (AC hum, fan noise, etc.)
          autoGainControl: true,      // Automatic level control
          
          // Latency optimization
          latency: 0.01,              // 10ms latency for monitoring
          
          // Advanced constraints (if supported)
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,   // Critical: removes low-frequency hum (60Hz/50Hz)
          googTypingNoiseDetection: true,
        } as any,
        video: false
      })
      
      mediaStreamRef.current = stream
      recordedChunksRef.current = []

      const ctx = getCtx()
      if (ctx.state === 'suspended') await ctx.resume()

      // Create audio processing chain for additional noise reduction
      const micSource = ctx.createMediaStreamSource(stream)
      
      // Add high-pass filter to remove sub-bass rumble and AC hum
      const highpassFilter = ctx.createBiquadFilter()
      highpassFilter.type = 'highpass'
      highpassFilter.frequency.value = 80  // Remove everything below 80Hz (removes hum)
      highpassFilter.Q.value = 0.7
      
      // Add analyser for metering
      const micAnalyser = ctx.createAnalyser()
      micAnalyser.fftSize = 2048
      micAnalyser.smoothingTimeConstant = 0.8
      
      // Connect chain: source -> highpass -> analyser
      micSource.connect(highpassFilter)
      highpassFilter.connect(micAnalyser)
      
      micSourceRef.current = micSource
      micAnalyserRef.current = micAnalyser

      // Use highest quality codec available
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg'

      // Use maximum bitrate for lossless-quality recording
      const recorder = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 320000 // 320 kbps - maximum quality
      })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data)
        }
      }

      recorder.start(100) // Smaller chunks (100ms) for lower latency
      
      console.log('[Audio Engine] Professional recording started:', {
        sampleRate: stream.getAudioTracks()[0].getSettings().sampleRate,
        channelCount: stream.getAudioTracks()[0].getSettings().channelCount,
        echoCancellation: stream.getAudioTracks()[0].getSettings().echoCancellation,
        noiseSuppression: stream.getAudioTracks()[0].getSettings().noiseSuppression,
        autoGainControl: stream.getAudioTracks()[0].getSettings().autoGainControl,
        bitrate: 320000,
        codec: mimeType
      })
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone access denied. Please allow microphone access in your browser settings.'
        : `Could not access microphone: ${err?.message ?? err}`
      throw new Error(msg)
    }
  }, [getCtx])

  const stopRecording = useCallback(async (): Promise<AudioBuffer | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        resolve(null)
        return
      }

      recorder.onstop = async () => {
        try { micSourceRef.current?.disconnect() } catch {}
        try { micAnalyserRef.current?.disconnect() } catch {}
        micSourceRef.current = null
        micAnalyserRef.current = null

        mediaStreamRef.current?.getTracks().forEach(t => t.stop())
        mediaStreamRef.current = null

        if (!recordedChunksRef.current.length) {
          resolve(null)
          return
        }

        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType })
        try {
          const arrayBuffer = await blob.arrayBuffer()
          const ctx = getCtx()
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
          resolve(audioBuffer)
        } catch (e) {
          console.error('Failed to decode recorded audio:', e)
          resolve(null)
        }
        recordedChunksRef.current = []
        mediaRecorderRef.current = null
      }

      recorder.stop()
    })
  }, [getCtx])

  const isRecordingActive = useCallback((): boolean => {
    return mediaRecorderRef.current?.state === 'recording'
  }, [])

  // ── Mic level meter ──────────────────────────────────────────────────────
  const getMicLevel = useCallback((): number => {
    const analyser = micAnalyserRef.current
    if (!analyser) return 0
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    let max = 0
    for (const v of data) if (Math.abs(v) > max) max = Math.abs(v)
    return Math.min(1, max)
  }, [])

  // ── Level meters ─────────────────────────────────────────────────────────
  const getTrackLevel = useCallback((trackId: string): number => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes) return 0
    const data = new Float32Array(nodes.analyser.fftSize)
    nodes.analyser.getFloatTimeDomainData(data)
    let max = 0
    for (const v of data) if (Math.abs(v) > max) max = Math.abs(v)
    return Math.min(1, max)
  }, [])

  const getMasterLevel = useCallback((): [number, number] => {
    if (!masterAnalyserRef.current) return [0, 0]
    const data = new Float32Array(masterAnalyserRef.current.fftSize)
    masterAnalyserRef.current.getFloatTimeDomainData(data)
    const half = data.length / 2
    let lMax = 0, rMax = 0
    for (let i = 0; i < half; i++) { const v = Math.abs(data[i]); if (v > lMax) lMax = v }
    for (let i = half; i < data.length; i++) { const v = Math.abs(data[i]); if (v > rMax) rMax = v }
    return [Math.min(1, lMax), Math.min(1, rMax)]
  }, [])

  // ── Track parameter control ───────────────────────────────────────────────
  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (nodes) nodes.gain.gain.value = Math.max(0, volume)
  }, [])

  const setTrackPan = useCallback((trackId: string, pan: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (nodes) nodes.panner.pan.value = Math.max(-1, Math.min(1, pan))
  }, [])

  const setMasterVolume = useCallback((volume: number) => {
    if (masterGainRef.current) masterGainRef.current.gain.value = Math.max(0, volume)
  }, [])

  const setTrackEQ = useCallback((trackId: string, low: number, mid: number, high: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes || nodes.eq.length < 3) return
    nodes.eq[0].gain.value = low
    nodes.eq[1].gain.value = mid
    nodes.eq[2].gain.value = high
  }, [])

  const setTrackCompressor = useCallback((trackId: string, threshold: number, ratio: number, attack: number, release: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes) return
    nodes.compressor.threshold.value = threshold
    nodes.compressor.ratio.value = ratio
    nodes.compressor.attack.value = attack
    nodes.compressor.release.value = release
  }, [])

  // ── Reverb / Delay control ────────────────────────────────────────────────
  const setTrackReverb = useCallback((trackId: string, wet: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes?.reverbGain) return
    nodes.reverbGain.gain.value = Math.max(0, Math.min(1, wet))
  }, [])

  const setTrackDelay = useCallback((trackId: string, wet: number, time: number, feedback: number) => {
    const nodes = trackNodesRef.current.get(trackId)
    if (!nodes?.delayWet || !nodes.delay || !nodes.delayFeedback) return
    nodes.delayWet.gain.value = Math.max(0, Math.min(1, wet))
    nodes.delay.delayTime.value = Math.max(0, Math.min(4, time))
    nodes.delayFeedback.gain.value = Math.max(0, Math.min(0.98, feedback))
  }, [])

  const generateWaveformPeaks = useCallback((buffer: AudioBuffer, numPeaks = 200): number[] => {
    const channel = buffer.getChannelData(0)
    const blockSize = Math.floor(channel.length / numPeaks)
    const peaks: number[] = []
    for (let i = 0; i < numPeaks; i++) {
      let max = 0
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(channel[i * blockSize + j] ?? 0)
        if (v > max) max = v
      }
      peaks.push(max)
    }
    return peaks
  }, [])

  // Normalize a clip's gain based on peak amplitude
  const normalizeClipGain = useCallback((audioUrl: string): number => {
    const buffer = audioBuffersRef.current.get(audioUrl)
    if (!buffer) return 1
    const channel = buffer.getChannelData(0)
    let peak = 0
    for (const v of channel) if (Math.abs(v) > peak) peak = Math.abs(v)
    return peak > 0 ? Math.min(2, 0.9 / peak) : 1
  }, [])

  // ── Instrument Synth Instances (per track) ────────────────────────────────
  const instrumentSynthsRef = useRef<Map<string, DX7Synth>>(new Map())

  // ── Play a preview note (piano roll key click) ────────────────────────────
  const heldNotesRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode }>>(new Map())

  const noteOn = useCallback((pitch: number, velocity = 100) => {
    if (heldNotesRef.current.has(pitch)) return
    const ctx = getCtx()
    console.log('[noteOn] pitch:', pitch, 'ctx.state:', ctx.state, 'masterGain:', masterGainRef.current?.gain.value)
    if (ctx.state === 'suspended') {
      console.log('[noteOn] Resuming suspended audio context')
      ctx.resume()
    }
    
    // Check for selected track with instrument plugins
    const { selectedTrackId, tracks } = useProjectStore.getState()
    const selectedTrack = selectedTrackId ? tracks.find(t => t.id === selectedTrackId) : null
    
    if (selectedTrack) {
      // Check for FS-DX7 instrument
      const dx7Plugin = selectedTrack.plugins.find(p => p.type === 'fs_dx7' && p.enabled)
      if (dx7Plugin) {
        console.log('[noteOn] ✅ Using FS-DX7 synth for track:', selectedTrack.name)
        
        // Ensure trackNodes exist (force create if needed)
        let trackNodes = trackNodesRef.current.get(selectedTrack.id)
        if (!trackNodes) {
          console.log('[noteOn] ⚠️ trackNodes missing, creating now...')
          trackNodes = getTrackNodes(selectedTrack.id, selectedTrack.volume, selectedTrack.pan)
          console.log('[noteOn] trackNodes created:', !!trackNodes)
        }
        
        // Get or create DX7 synth instance for this track
        let synth = instrumentSynthsRef.current.get(selectedTrack.id)
        if (!synth) {
          if (trackNodes) {
            synth = new DX7Synth(ctx, trackNodes.gain, dx7Plugin.params)
            instrumentSynthsRef.current.set(selectedTrack.id, synth)
            console.log('[noteOn] ✅ Created DX7 synth, algorithm:', dx7Plugin.params.algorithm)
          } else {
            console.error('[noteOn] ❌ FAILED: trackNodes is null!')
            return // Don't fall through to oscillator
          }
        } else {
          // Update params if they changed
          synth.updateParams(dx7Plugin.params)
        }
        
        if (synth) {
          synth.noteOn(pitch, velocity)
          console.log('[noteOn] ✅ DX7 note triggered:', pitch)
          // Store a reference for noteOff
          heldNotesRef.current.set(pitch, { osc: null as any, gain: null as any }) // Just mark as held
          return // IMPORTANT: Don't fall through to oscillator!
        } else {
          console.error('[noteOn] ❌ CRITICAL: synth is null after creation!')
        }
      }
      
      // TODO: Add support for fs_analog, fs_sampler, etc.
    }
    
    // Fallback to simple oscillator (for testing or tracks without instruments)
    const freq = 440 * Math.pow(2, (pitch - 69) / 12)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc.connect(gain)
    const destination = masterGainRef.current ?? ctx.destination
    console.log('[noteOn] Connecting to:', masterGainRef.current ? 'masterGain' : 'ctx.destination')
    gain.connect(destination)
    const vol = (velocity / 127) * 0.4
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.005)
    osc.start(ctx.currentTime)
    console.log('[noteOn] Oscillator started at freq:', freq, 'vol:', vol)
    heldNotesRef.current.set(pitch, { osc, gain })
  }, [getCtx])

  const noteOff = useCallback((pitch: number) => {
    const held = heldNotesRef.current.get(pitch)
    if (!held) return
    
    // Check for instrument synths
    const { selectedTrackId, tracks } = useProjectStore.getState()
    const selectedTrack = selectedTrackId ? tracks.find(t => t.id === selectedTrackId) : null
    
    if (selectedTrack) {
      const dx7Plugin = selectedTrack.plugins.find(p => p.type === 'fs_dx7' && p.enabled)
      if (dx7Plugin) {
        const synth = instrumentSynthsRef.current.get(selectedTrack.id)
        if (synth) {
          synth.noteOff(pitch)
          console.log('[noteOff] Released DX7 note:', pitch)
          heldNotesRef.current.delete(pitch)
          return
        }
      }
    }
    
    // Fallback to simple oscillator
    const ctx = getCtx()
    const { osc, gain } = held
    if (osc && gain) {
      gain.gain.cancelScheduledValues(ctx.currentTime)
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
      try { osc.stop(ctx.currentTime + 0.09) } catch {}
    }
    heldNotesRef.current.delete(pitch)
  }, [getCtx])

  const allNotesOff = useCallback(() => {
    for (const pitch of heldNotesRef.current.keys()) noteOff(pitch)
  }, [noteOff])

  const playPreviewNote = useCallback((pitch: number, durationSec = 0.4) => {
    noteOn(pitch, 100)
    setTimeout(() => noteOff(pitch), durationSec * 1000)
  }, [noteOn, noteOff])

  // ── Audio context restart (for AudioPreferences) ─────────────────────────
  const restartAudioContext = useCallback(async (opts: {
    sampleRate: number
    latencyHint: 'interactive' | 'balanced' | 'playback'
    outputDeviceId?: string
  }) => {
    // 1. Stop everything
    stopAll()
    stopMetronome()

    // 2. Close old context
    if (ctxRef.current) {
      try { await ctxRef.current.close() } catch {}
      ctxRef.current = null
    }
    masterGainRef.current = null
    masterAnalyserRef.current = null
    masterLimiterRef.current = null
    trackNodesRef.current.clear()

    // 3. Create new context with requested settings
    const newCtx = new AudioContext({
      sampleRate: opts.sampleRate,
      latencyHint: opts.latencyHint,
    })
    ctxRef.current = newCtx

    // 4. Rebuild master chain
    const masterGain = newCtx.createGain()
    masterGain.gain.value = 0.9
    masterGainRef.current = masterGain

    const masterAnalyser = newCtx.createAnalyser()
    masterAnalyser.fftSize = 2048
    masterAnalyserRef.current = masterAnalyser

    const masterLimiter = newCtx.createDynamicsCompressor()
    masterLimiter.threshold.value = -1
    masterLimiter.knee.value = 0
    masterLimiter.ratio.value = 20
    masterLimiter.attack.value = 0.001
    masterLimiter.release.value = 0.1
    masterLimiterRef.current = masterLimiter

    masterGain.connect(masterLimiter)
    masterLimiter.connect(masterAnalyser)
    masterAnalyser.connect(newCtx.destination)

    // 5. Try to route output to specific device (Chrome only)
    if (opts.outputDeviceId && opts.outputDeviceId !== '') {
      try {
        // @ts-ignore — setSinkId is experimental, not in TS types yet
        if (typeof newCtx.setSinkId === 'function') {
          await (newCtx as any).setSinkId(opts.outputDeviceId)
        }
      } catch (e) {
        console.warn('[AudioEngine] setSinkId failed (may not be supported):', e)
      }
    }

    // Resume (browsers sometimes start suspended)
    if (newCtx.state === 'suspended') await newCtx.resume()
    console.log('[AudioEngine] AudioContext restarted:', newCtx.sampleRate, 'Hz, latency:', opts.latencyHint)
  }, [stopAll, stopMetronome])

  // ── Track Freeze — offline render a track to a single audio buffer ────────
  const freezeTrack = useCallback(async (
    trackId: string,
    onProgress?: (p: number) => void,
  ): Promise<string | null> => {
    const { tracks, bpm } = useProjectStore.getState()
    const track = tracks.find(t => t.id === trackId)
    if (!track || track.type === 'master') return null

    // Find render range
    let maxBeat = 0
    for (const c of track.clips) { const e = c.startBeat + c.durationBeats; if (e > maxBeat) maxBeat = e }
    if (maxBeat <= 0) return null

    const sr = getCtx().sampleRate
    const durationSec = maxBeat * (60 / bpm)
    const numSamples = Math.ceil(durationSec * sr)

    onProgress?.(0.05)

    const offCtx = new OfflineAudioContext(2, numSamples, sr)
    const offMaster = offCtx.createGain()
    offMaster.gain.value = 1
    offMaster.connect(offCtx.destination)

    const trackGain = offCtx.createGain()
    trackGain.gain.value = track.volume
    const panner = offCtx.createStereoPanner()
    panner.pan.value = track.pan

    // 3-band EQ
    const eqPlugin = track.plugins.find(p => p.type === 'eq' && p.enabled)
    const lowShelf = offCtx.createBiquadFilter()
    lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 320
    lowShelf.gain.value = eqPlugin?.params.low ?? 0
    const midPeak = offCtx.createBiquadFilter()
    midPeak.type = 'peaking'; midPeak.frequency.value = 1000; midPeak.Q.value = 0.5
    midPeak.gain.value = eqPlugin?.params.mid ?? 0
    const highShelf = offCtx.createBiquadFilter()
    highShelf.type = 'highshelf'; highShelf.frequency.value = 3200
    highShelf.gain.value = eqPlugin?.params.high ?? 0

    trackGain.connect(lowShelf)
    lowShelf.connect(midPeak)
    midPeak.connect(highShelf)
    highShelf.connect(panner)
    panner.connect(offMaster)

    for (const clip of track.clips) {
      if (!clip.audioUrl || clip.muted) continue
      const buf = audioBuffersRef.current.get(clip.audioUrl)
      if (!buf) continue

      const beatDur = 60 / bpm
      const flexRate = clip.flexRate ?? 1
      const clipStartS = clip.startBeat * beatDur
      const clipDurS = clip.durationBeats * beatDur

      const source = offCtx.createBufferSource()
      source.buffer = buf
      source.playbackRate.value = flexRate
      if (clip.looped) source.loop = true

      const clipGain = offCtx.createGain()
      clipGain.gain.value = clip.gain
      source.connect(clipGain)
      clipGain.connect(trackGain)

      const fadeInSec  = (clip.fadeIn  ?? 0) * beatDur
      const fadeOutSec = (clip.fadeOut ?? 0) * beatDur
      if (fadeInSec > 0) {
        clipGain.gain.setValueAtTime(0.0001, clipStartS)
        clipGain.gain.exponentialRampToValueAtTime(clip.gain, clipStartS + fadeInSec)
      }
      if (fadeOutSec > 0) {
        const fs = clipStartS + clipDurS - fadeOutSec
        if (fs > clipStartS) {
          clipGain.gain.setValueAtTime(clip.gain, fs)
          clipGain.gain.exponentialRampToValueAtTime(0.0001, clipStartS + clipDurS)
        }
      }

      source.start(clipStartS, 0, clip.looped ? undefined : clipDurS / flexRate)
    }

    onProgress?.(0.2)
    const rendered = await offCtx.startRendering()
    onProgress?.(0.9)

    // Encode to WAV blob and create object URL
    const left = rendered.getChannelData(0)
    const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left
    const numCh = 2, bps = 3, blockAlign = numCh * bps
    const dataSize = rendered.length * numCh * bps
    const arrayBuffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(arrayBuffer)
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
    ws(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE')
    ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
    view.setUint16(22, 2, true); view.setUint32(24, sr, true)
    view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true)
    view.setUint16(34, 24, true); ws(36, 'data'); view.setUint32(40, dataSize, true)
    let off = 44
    for (let i = 0; i < rendered.length; i++) {
      for (const s of [left[i], right[i]]) {
        const v = Math.max(-1, Math.min(1, s))
        const val = v < 0 ? (v * 0x800000) | 0 : (v * 0x7fffff) | 0
        view.setUint8(off++, val & 0xff)
        view.setUint8(off++, (val >> 8) & 0xff)
        view.setUint8(off++, (val >> 16) & 0xff)
      }
    }

    const frozenBlob = new Blob([arrayBuffer], { type: 'audio/wav' })
    const frozenUrl = URL.createObjectURL(frozenBlob)
    // Register in cache so playback can use it
    const frozenBuf = await getCtx().decodeAudioData(await frozenBlob.arrayBuffer())
    audioBuffersRef.current.set(frozenUrl, frozenBuf)
    onProgress?.(1)
    return frozenUrl
  }, [getCtx, audioBuffersRef])

  // ── Automation playback (called per RAF frame during playback) ─────────────
  const applyAutomation = useCallback((currentBeat: number) => {
    const { automationLanes, tracks } = useProjectStore.getState()
    if (!automationLanes.length) return

    for (const lane of automationLanes) {
      if (!lane.visible || lane.points.length === 0) continue
      const nodes = trackNodesRef.current.get(lane.trackId)
      if (!nodes) continue

      // Interpolate value
      const pts = lane.points
      let value = lane.defaultValue
      if (pts.length === 1) {
        value = pts[0].value
      } else if (currentBeat <= pts[0].beat) {
        value = pts[0].value
      } else if (currentBeat >= pts[pts.length - 1].beat) {
        value = pts[pts.length - 1].value
      } else {
        let lo = 0
        for (let i = 0; i < pts.length - 1; i++) {
          if (pts[i].beat <= currentBeat && currentBeat <= pts[i + 1].beat) { lo = i; break }
        }
        const a = pts[lo], b = pts[lo + 1]
        const t = (currentBeat - a.beat) / (b.beat - a.beat)
        if (lane.curve === 'step') value = a.value
        else if (lane.curve === 'smooth') value = a.value + (b.value - a.value) * t * t * (3 - 2 * t)
        else value = a.value + (b.value - a.value) * t
      }

      // Apply to appropriate node
      switch (lane.param) {
        case 'volume': {
          const track = tracks.find(t => t.id === lane.trackId)
          if (track && !track.muted) nodes.gain.gain.setTargetAtTime(value, ctxRef.current!.currentTime, 0.02)
          break
        }
        case 'pan':
          nodes.panner.pan.setTargetAtTime(value, ctxRef.current!.currentTime, 0.02)
          break
        case 'eq-low':
          nodes.lowShelf?.gain.setTargetAtTime(value, ctxRef.current!.currentTime, 0.02)
          break
        case 'eq-mid':
          nodes.midPeak?.gain.setTargetAtTime(value, ctxRef.current!.currentTime, 0.02)
          break
        case 'eq-high':
          nodes.highShelf?.gain.setTargetAtTime(value, ctxRef.current!.currentTime, 0.02)
          break
        case 'reverb':
          nodes.reverbGain?.gain.setTargetAtTime(value, ctxRef.current!.currentTime, 0.02)
          break
        case 'delay':
          nodes.delayWet?.gain.setTargetAtTime(value, ctxRef.current!.currentTime, 0.02)
          break
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      stopAll()
      stopMetronome()
      mediaRecorderRef.current?.stop()
      mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      ctxRef.current?.close()
    }
  }, [stopAll, stopMetronome])

  return {
    getCtx,
    startPlayback,
    stopAll,
    playClip,
    scheduleMidiClip,
    applySoloMute,
    applyAutomation,
    startMetronome,
    stopMetronome,
    startRecording,
    stopRecording,
    isRecordingActive,
    getMicLevel,
    getTrackLevel,
    getMasterLevel,
    setTrackEQ,
    setTrackCompressor,
    setTrackReverb,
    setTrackDelay,
    setTrackVolume,
    setTrackPan,
    setMasterVolume,
    loadAudioBuffer,
    registerAudioBuffer,
    generateWaveformPeaks,
    normalizeClipGain,
    applyFadeRamps,
    noteOn,
    noteOff,
    allNotesOff,
    playPreviewNote,
    audioBuffersRef,
    restartAudioContext,
    freezeTrack,
    applyElitePlugins,
    clearPitchCache: (clipId: string) => {
      for (const key of [...pitchBufferCache.current.keys()]) {
        if (key.startsWith(`${clipId}:pitch:`)) pitchBufferCache.current.delete(key)
      }
    },
  }
}
