import React from 'react'
import { useProjectStore, Plugin, Track } from '../store/projectStore'
import { FloatingPluginWindow } from './FloatingPluginWindow'
import { PluginUIRenderer } from './PluginUIRenderer'

/**
 * PluginWindowManager - Renders all open plugin windows
 */
export function PluginWindowManager() {
  const { tracks, openPluginWindows, closePluginWindow, updatePlugin } = useProjectStore()

  // Find all plugins that have open windows
  const openPlugins: Array<{ plugin: Plugin; trackId: string; trackName: string }> = []
  
  openPluginWindows.forEach(pluginId => {
    for (const track of tracks) {
      const plugin = track.plugins.find(p => p.id === pluginId)
      if (plugin) {
        openPlugins.push({
          plugin,
          trackId: track.id,
          trackName: track.name,
        })
        break
      }
    }
  })

  return (
    <>
      {openPlugins.map(({ plugin, trackId, trackName }, index) => (
        <FloatingPluginWindow
          key={plugin.id}
          title={`${trackName} — ${plugin.name}`}
          onClose={() => closePluginWindow(plugin.id)}
          initialX={100 + index * 30}
          initialY={100 + index * 30}
          width={500}
          height={600}
        >
          <PluginUIRenderer
            plugin={plugin}
            trackId={trackId}
            onUpdateParams={(params) => updatePlugin(trackId, plugin.id, params)}
          />
        </FloatingPluginWindow>
      ))}
    </>
  )
}
