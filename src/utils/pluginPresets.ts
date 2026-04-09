/**
 * Global Plugin Preset Manager
 * Saves and loads plugin chains across all projects
 */

export interface PluginPreset {
  id: string
  name: string
  plugins: any[] // Plugin configuration array
  createdAt: number
  category?: string // e.g., 'vocal', 'drums', 'bass', 'master'
}

const PRESET_STORAGE_KEY = 'fs-audio-plugin-presets'

export class PluginPresetManager {
  static getAll(): PluginPreset[] {
    try {
      const stored = localStorage.getItem(PRESET_STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (e) {
      console.error('[PluginPresets] Failed to load presets:', e)
      return []
    }
  }

  static save(name: string, plugins: any[], category?: string): PluginPreset {
    const preset: PluginPreset = {
      id: `preset-${Date.now()}`,
      name,
      plugins: JSON.parse(JSON.stringify(plugins)), // Deep clone
      createdAt: Date.now(),
      category
    }

    const presets = this.getAll()
    presets.push(preset)
    
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
      console.log('[PluginPresets] Saved preset:', name)
      return preset
    } catch (e) {
      console.error('[PluginPresets] Failed to save preset:', e)
      throw new Error('Failed to save preset. Storage might be full.')
    }
  }

  static delete(presetId: string): void {
    const presets = this.getAll().filter(p => p.id !== presetId)
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
    console.log('[PluginPresets] Deleted preset:', presetId)
  }

  static update(presetId: string, updates: Partial<PluginPreset>): void {
    const presets = this.getAll().map(p => 
      p.id === presetId ? { ...p, ...updates } : p
    )
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
    console.log('[PluginPresets] Updated preset:', presetId)
  }

  static getByCategory(category: string): PluginPreset[] {
    return this.getAll().filter(p => p.category === category)
  }

  static export(presetId: string): string {
    const preset = this.getAll().find(p => p.id === presetId)
    if (!preset) throw new Error('Preset not found')
    return JSON.stringify(preset, null, 2)
  }

  static import(jsonString: string): PluginPreset {
    try {
      const preset = JSON.parse(jsonString) as PluginPreset
      // Generate new ID to avoid conflicts
      preset.id = `preset-${Date.now()}`
      preset.createdAt = Date.now()
      
      const presets = this.getAll()
      presets.push(preset)
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets))
      
      console.log('[PluginPresets] Imported preset:', preset.name)
      return preset
    } catch (e) {
      console.error('[PluginPresets] Failed to import preset:', e)
      throw new Error('Invalid preset file')
    }
  }

  static clear(): void {
    localStorage.removeItem(PRESET_STORAGE_KEY)
    console.log('[PluginPresets] Cleared all presets')
  }
}
