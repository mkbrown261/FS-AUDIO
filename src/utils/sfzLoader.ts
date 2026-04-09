// SFZ File Loader Utility
// Handles loading SFZ files and their associated samples

/**
 * Load an SFZ file from user's file system
 * Returns the SFZ content and base path
 */
export async function loadSFZFile(): Promise<{ content: string; path: string; name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.sfz'
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      
      try {
        const content = await file.text()
        const path = file.name
        const name = file.name.replace('.sfz', '')
        
        resolve({ content, path, name })
      } catch (error) {
        console.error('[SFZ Loader] Failed to read file:', error)
        resolve(null)
      }
    }
    
    input.click()
  })
}

/**
 * Load sample files for an SFZ instrument
 * Allows user to select a folder containing samples
 */
export async function loadSFZSamples(): Promise<Map<string, ArrayBuffer>> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.wav,.WAV,.flac,.FLAC,.ogg,.OGG,.mp3,.MP3'
    input.multiple = true
    // @ts-ignore - webkitdirectory for folder selection
    input.webkitdirectory = true
    
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files || files.length === 0) {
        resolve(new Map())
        return
      }
      
      const samples = new Map<string, ArrayBuffer>()
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // Only load audio files
        if (!file.name.match(/\.(wav|flac|ogg|mp3)$/i)) continue
        
        try {
          const buffer = await file.arrayBuffer()
          // Store with just the filename (not full path)
          const filename = file.name
          samples.set(filename, buffer)
          console.log(`[SFZ Loader] Loaded sample: ${filename}`)
        } catch (error) {
          console.error(`[SFZ Loader] Failed to load ${file.name}:`, error)
        }
      }
      
      console.log(`[SFZ Loader] Loaded ${samples.size} samples total`)
      resolve(samples)
    }
    
    input.click()
  })
}

/**
 * Parse SFZ content to extract referenced sample filenames
 */
export function extractSamplePaths(sfzContent: string): string[] {
  const samplePaths: string[] = []
  const lines = sfzContent.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    // Look for sample= opcode
    const match = trimmed.match(/sample=(.+?)(\s|$)/)
    if (match) {
      let samplePath = match[1].trim()
      // Remove quotes if present
      samplePath = samplePath.replace(/^["']|["']$/g, '')
      // Get just the filename (strip directory)
      const filename = samplePath.split(/[/\\]/).pop() || samplePath
      samplePaths.push(filename)
    }
  }
  
  return [...new Set(samplePaths)] // Remove duplicates
}
