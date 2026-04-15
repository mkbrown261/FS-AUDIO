import React from 'react'
import { useProjectStore, Plugin, Track } from '../store/projectStore'
import { FloatingPluginWindow } from './FloatingPluginWindow'
import { PluginUIRenderer } from './PluginUIRenderer'

// Color map matching BuiltInPlugins typeColors
const PLUGIN_COLORS: Record<string, string> = {
  eq: '#06b6d4', compressor: '#10b981', limiter: '#ef4444',
  reverb: '#a855f7', delay: '#3b82f6', chorus: '#ec4899', distortion: '#f59e0b',
  saturation: '#f97316', bus_compressor: '#22d3ee', spacetime: '#c084fc', transient: '#4ade80',
  expander: '#84cc16', exciter: '#f0abfc', vibrato: '#fb923c', stereo_width: '#38bdf8',
  tape: '#d97706', sub_enhancer: '#7c3aed', noise_gate: '#14b8a6', pitch_correct: '#e879f9',
  parallel_comp: '#facc15', granular: '#818cf8', vocal_tuner: '#8b5cf6',
  parametric_eq8: '#a855f7', multiband_comp: '#fb923c', deesser: '#06b6d4',
  arpeggiator: '#a78bfa', note_repeat: '#c084fc', chord_memorizer: '#818cf8',
  fs_oracle: '#d946ef', fs_clone: '#06b6d4', fs_architect: '#22c55e',
  fs_phantom: '#8b5cf6', fs_nerve: '#f59e0b', fs_bpmfinder: '#f97316',
  fs_ghost: '#a855f7', fs_prophet: '#f59e0b', fs_void: '#6366f1', fs_alchemy: '#d97706',
  fs_proq: '#a855f7', fs_resonance: '#10b981', fs_vintage_verb: '#818cf8',
  fs_echo: '#f59e0b', fs_tuner: '#e879f9', fs_mastering: '#facc15',
  fs_spacer: '#38bdf8', fs_peak_limiter: '#ef4444', fs_alter: '#22d3ee',
  fs_glitch: '#f97316', fs_fm: '#f59e0b', fs_wavetable: '#3b82f6',
  fs_granular: '#10b981', fs_multiband_comp: '#fb923c',
  fs_tape_delay: '#f59e0b', fs_vocal_enhance: '#c084fc', fs_dimension: '#22d3ee',
}

/**
 * PluginWindowManager - Renders all open plugin windows
 */
export function PluginWindowManager() {
  const { tracks, openPluginWindows, closePluginWindow, updatePlugin } = useProjectStore()

  // Find all plugins that have open windows
  const openPlugins: Array<{ plugin: Plugin; trackId: string; trackName: string; trackColor: string }> = []
  
  openPluginWindows.forEach(pluginId => {
    for (const track of tracks) {
      const plugin = track.plugins.find(p => p.id === pluginId)
      if (plugin) {
        openPlugins.push({
          plugin,
          trackId: track.id,
          trackName: track.name,
          trackColor: track.color,
        })
        break
      }
    }
  })

  return (
    <>
      {openPlugins.map(({ plugin, trackId, trackName, trackColor }, index) => {
        const pluginColor = PLUGIN_COLORS[plugin.type] ?? trackColor ?? '#a855f7'
        return (
          <FloatingPluginWindow
            key={plugin.id}
            title={`${trackName} — ${plugin.name}`}
            onClose={() => closePluginWindow(plugin.id)}
            initialX={Math.min(120 + index * 24, window.innerWidth - 580)}
            initialY={Math.min(80 + index * 24, window.innerHeight - 520)}
            width={560}
            height={480}
            pluginColor={pluginColor}
          >
            <PluginUIRenderer
              plugin={plugin}
              trackId={trackId}
              onUpdateParams={(params) => updatePlugin(trackId, plugin.id, params)}
            />
          </FloatingPluginWindow>
        )
      })}
    </>
  )
}
