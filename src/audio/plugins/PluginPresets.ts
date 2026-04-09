/**
 * FS-AUDIO Plugin Presets
 * Factory presets for all Phase 2 professional plugins
 */

export interface PluginPreset {
  name: string
  description: string
  params: Record<string, number | string>
}

export const VOCAL_TUNER_PRESETS: Record<string, PluginPreset> = {
  natural: {
    name: 'Natural Correction',
    description: 'Subtle pitch correction for natural vocals',
    params: {
      scale: 'chromatic',
      key: 'C',
      retuneSpeed: 80,
      formantPreserve: 1,
      mix: 60,
      cents: 0,
    },
  },
  
  autotune: {
    name: 'T-Pain Effect',
    description: 'Hard auto-tune effect',
    params: {
      scale: 'major',
      key: 'C',
      retuneSpeed: 0,
      formantPreserve: 0,
      mix: 100,
      cents: 0,
    },
  },
  
  smooth: {
    name: 'Smooth Vocals',
    description: 'Gentle pitch smoothing',
    params: {
      scale: 'major',
      key: 'C',
      retuneSpeed: 65,
      formantPreserve: 1,
      mix: 50,
      cents: 0,
    },
  },
  
  robot: {
    name: 'Robot Voice',
    description: 'Robotic hard tuning',
    params: {
      scale: 'chromatic',
      key: 'C',
      retuneSpeed: 0,
      formantPreserve: 0,
      mix: 100,
      cents: 0,
    },
  },
  
  minor_sad: {
    name: 'Minor Key Sad',
    description: 'Melancholic minor key correction',
    params: {
      scale: 'minor',
      key: 'Am',
      retuneSpeed: 40,
      formantPreserve: 1,
      mix: 70,
      cents: 0,
    },
  },
}

export const PARAMETRIC_EQ_PRESETS: Record<string, PluginPreset> = {
  vocal_presence: {
    name: 'Vocal Presence',
    description: 'Enhances vocal clarity and presence',
    params: {
      band0_gain: -2,    // 30Hz - reduce rumble
      band1_gain: -1,    // 100Hz
      band2_gain: 0,     // 250Hz
      band3_gain: 1,     // 750Hz - warmth
      band4_gain: 3,     // 2kHz - presence
      band5_gain: 2,     // 5kHz - air
      band6_gain: 1,     // 10kHz
      band7_gain: -1,    // 16kHz - reduce harshness
    },
  },
  
  bass_boost: {
    name: 'Bass Boost',
    description: 'Enhanced low-end punch',
    params: {
      band0_gain: 6,     // 30Hz - sub bass
      band1_gain: 4,     // 100Hz - bass
      band2_gain: 2,     // 250Hz
      band3_gain: 0,     // 750Hz
      band4_gain: -1,    // 2kHz
      band5_gain: 0,     // 5kHz
      band6_gain: 1,     // 10kHz - air
      band7_gain: 0,     // 16kHz
    },
  },
  
  telephone: {
    name: 'Telephone',
    description: 'Lo-fi telephone effect',
    params: {
      band0_gain: -18,   // 30Hz - remove lows
      band1_gain: -12,   // 100Hz
      band2_gain: 0,     // 250Hz
      band3_gain: 4,     // 750Hz - mid boost
      band4_gain: 6,     // 2kHz
      band5_gain: 0,     // 5kHz
      band6_gain: -12,   // 10kHz - remove highs
      band7_gain: -18,   // 16kHz
    },
  },
  
  air_enhancer: {
    name: 'Air & Clarity',
    description: 'Bright, airy mix enhancement',
    params: {
      band0_gain: 0,
      band1_gain: 0,
      band2_gain: 0,
      band3_gain: 0,
      band4_gain: 1,
      band5_gain: 3,     // 5kHz - presence
      band6_gain: 4,     // 10kHz - air
      band7_gain: 3,     // 16kHz - sparkle
    },
  },
  
  radio_ready: {
    name: 'Radio Ready',
    description: 'Commercial radio mastering curve',
    params: {
      band0_gain: -1,    // clean sub
      band1_gain: 1,     // bass punch
      band2_gain: 0,
      band3_gain: 2,     // mid warmth
      band4_gain: 3,     // vocal presence
      band5_gain: 2,     // brightness
      band6_gain: 1,     // air
      band7_gain: -2,    // tame harshness
    },
  },
}

export const MULTIBAND_COMP_PRESETS: Record<string, PluginPreset> = {
  master_glue: {
    name: 'Master Glue',
    description: 'Gentle mastering compression',
    params: {
      lowCrossover: 150,
      highCrossover: 5000,
      lowThreshold: -18,
      lowRatio: 2,
      lowAttack: 10,
      lowRelease: 300,
      lowMakeup: 2,
      midThreshold: -16,
      midRatio: 3,
      midAttack: 5,
      midRelease: 200,
      midMakeup: 2,
      highThreshold: -14,
      highRatio: 2,
      highAttack: 1,
      highRelease: 150,
      highMakeup: 1,
      mix: 100,
    },
  },
  
  bass_tightener: {
    name: 'Bass Tightener',
    description: 'Controls low-end punch',
    params: {
      lowCrossover: 200,
      highCrossover: 4000,
      lowThreshold: -20,
      lowRatio: 6,
      lowAttack: 5,
      lowRelease: 150,
      lowMakeup: 4,
      midThreshold: -24,
      midRatio: 3,
      midAttack: 8,
      midRelease: 250,
      midMakeup: 2,
      highThreshold: -30,
      highRatio: 2,
      highAttack: 3,
      highRelease: 200,
      highMakeup: 0,
      mix: 100,
    },
  },
  
  vocal_control: {
    name: 'Vocal Control',
    description: 'Even vocal dynamics across frequencies',
    params: {
      lowCrossover: 250,
      highCrossover: 3000,
      lowThreshold: -30,
      lowRatio: 2,
      lowAttack: 10,
      lowRelease: 300,
      lowMakeup: 0,
      midThreshold: -18,
      midRatio: 5,
      midAttack: 3,
      midRelease: 150,
      midMakeup: 4,
      highThreshold: -20,
      highRatio: 4,
      highAttack: 1,
      highRelease: 100,
      highMakeup: 2,
      mix: 100,
    },
  },
  
  aggressive: {
    name: 'Aggressive Punch',
    description: 'Heavy multiband compression',
    params: {
      lowCrossover: 180,
      highCrossover: 4500,
      lowThreshold: -16,
      lowRatio: 8,
      lowAttack: 3,
      lowRelease: 120,
      lowMakeup: 6,
      midThreshold: -14,
      midRatio: 10,
      midAttack: 2,
      midRelease: 100,
      midMakeup: 6,
      highThreshold: -12,
      highRatio: 6,
      highAttack: 1,
      highRelease: 80,
      highMakeup: 4,
      mix: 100,
    },
  },
}

export const DEESSER_PRESETS: Record<string, PluginPreset> = {
  gentle: {
    name: 'Gentle De-Ess',
    description: 'Subtle sibilance reduction',
    params: {
      frequency: 6500,
      threshold: -20,
      ratio: 3,
      range: 6,
      listen: 0,
    },
  },
  
  medium: {
    name: 'Medium De-Ess',
    description: 'Standard sibilance control',
    params: {
      frequency: 7000,
      threshold: -24,
      ratio: 6,
      range: 10,
      listen: 0,
    },
  },
  
  aggressive: {
    name: 'Aggressive De-Ess',
    description: 'Heavy sibilance reduction',
    params: {
      frequency: 7500,
      threshold: -30,
      ratio: 10,
      range: 15,
      listen: 0,
    },
  },
  
  female_vocal: {
    name: 'Female Vocal',
    description: 'Optimized for female voices',
    params: {
      frequency: 8000,
      threshold: -22,
      ratio: 5,
      range: 8,
      listen: 0,
    },
  },
  
  male_vocal: {
    name: 'Male Vocal',
    description: 'Optimized for male voices',
    params: {
      frequency: 6000,
      threshold: -26,
      ratio: 4,
      range: 7,
      listen: 0,
    },
  },
  
  broadcast: {
    name: 'Broadcast De-Ess',
    description: 'Radio/podcast sibilance control',
    params: {
      frequency: 7200,
      threshold: -28,
      ratio: 8,
      range: 12,
      listen: 0,
    },
  },
}

// Export all presets
export const PLUGIN_PRESETS = {
  vocal_tuner: VOCAL_TUNER_PRESETS,
  parametric_eq8: PARAMETRIC_EQ_PRESETS,
  multiband_comp: MULTIBAND_COMP_PRESETS,
  deesser: DEESSER_PRESETS,
}
