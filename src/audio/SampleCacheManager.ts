/**
 * SampleCacheManager
 *
 * Handles downloading and caching audio samples for SFZ instruments.
 *
 * In Electron:
 *   - Delegates to main process via IPC (electronAPI)
 *   - Samples saved to userData/sample-cache/<instrumentId>/
 *   - Downloads happen once; served from disk forever after (offline)
 *
 * In browser/dev (no electronAPI):
 *   - Falls back to direct fetch() from the provided baseUrl
 *
 * IMPORTANT: filenames passed here are the FULL relative path as written in
 * the SFZ file (e.g. "samples/ep-c4.wav" or "G#0_1_1.wav").
 * The decoded buffer is stored under BOTH the full relative path AND the
 * bare filename so any lookup variant succeeds.
 */

export interface DownloadProgress {
  instrumentId: string
  filename: string
  pct: number
  received: number
  total: number
  done: boolean
  error?: string
}

export type ProgressCallback = (p: DownloadProgress) => void

declare global {
  interface Window {
    electronAPI?: {
      sampleCheckCache: (id: string, filenames: string[]) => Promise<Record<string, string | null>>
      sampleReadCached:  (id: string, filename: string)   => Promise<Uint8Array | null>
      sampleDownload:    (id: string, filename: string, url: string) => Promise<{ ok: boolean; cached: boolean; path: string }>
      sampleCacheDir:    (id: string) => Promise<string>
      onSampleProgress:  (cb: (p: DownloadProgress) => void) => () => void
      [key: string]: any
    }
  }
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.sampleDownload

export class SampleCacheManager {
  private instrumentId: string
  private baseUrl: string
  private onProgress?: ProgressCallback
  private unsubProgress?: () => void

  // Keyed by BOTH bare filename AND full relative path
  private decodedCache = new Map<string, AudioBuffer>()

  constructor(instrumentId: string, baseUrl: string, onProgress?: ProgressCallback) {
    this.instrumentId = instrumentId
    this.baseUrl      = baseUrl
    this.onProgress   = onProgress

    if (isElectron && onProgress) {
      this.unsubProgress = window.electronAPI!.onSampleProgress((p) => {
        if (p.instrumentId === instrumentId) onProgress(p)
      })
    }
  }

  destroy() {
    this.unsubProgress?.()
  }

  /**
   * Get a decoded AudioBuffer for a sample reference.
   * @param sampleRef - exactly as written in the SFZ (e.g. "samples/ep-c4.wav")
   */
  async getSample(ctx: AudioContext, sampleRef: string): Promise<AudioBuffer | null> {
    const bareFilename = sampleRef.split('/').pop() ?? sampleRef

    // Check in-memory cache under either key
    if (this.decodedCache.has(sampleRef))    return this.decodedCache.get(sampleRef)!
    if (this.decodedCache.has(bareFilename)) return this.decodedCache.get(bareFilename)!

    try {
      let arrayBuffer: ArrayBuffer

      if (isElectron) {
        arrayBuffer = await this.getViaElectron(sampleRef, bareFilename)
      } else {
        arrayBuffer = await this.getViaFetch(sampleRef)
      }

      const decoded = await ctx.decodeAudioData(arrayBuffer)

      // Store under both keys so any lookup hits
      this.decodedCache.set(sampleRef, decoded)
      this.decodedCache.set(bareFilename, decoded)

      return decoded
    } catch (err) {
      console.error(`[SampleCache] Failed to load "${sampleRef}":`, err)
      return null
    }
  }

  /**
   * Preload all samples in the list concurrently.
   */
  async preloadSamples(ctx: AudioContext, sampleRefs: string[], concurrency = 4): Promise<void> {
    const needed = sampleRefs.filter(r => {
      const bare = r.split('/').pop() ?? r
      return !this.decodedCache.has(r) && !this.decodedCache.has(bare)
    })
    if (needed.length === 0) return

    console.log(`[SampleCache] Preloading ${needed.length} samples for "${this.instrumentId}"`)

    for (let i = 0; i < needed.length; i += concurrency) {
      await Promise.all(needed.slice(i, i + concurrency).map(r => this.getSample(ctx, r)))
    }

    console.log(`[SampleCache] ✅ Done — ${this.decodedCache.size} buffers in memory`)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async getViaElectron(sampleRef: string, bareFilename: string): Promise<ArrayBuffer> {
    const api = window.electronAPI!
    // URL is baseUrl + full relative path (preserves subdirectory like "samples/")
    const url = `${this.baseUrl}/${sampleRef}`

    const result = await api.sampleDownload(this.instrumentId, bareFilename, url)
    if (!result?.ok) throw new Error(`Download failed for ${sampleRef}`)

    if (result.cached) {
      this.onProgress?.({ instrumentId: this.instrumentId, filename: bareFilename, pct: 100, received: 0, total: 0, done: true })
    }

    const uint8 = await api.sampleReadCached(this.instrumentId, bareFilename)
    if (!uint8) throw new Error(`Failed to read cached file: ${bareFilename}`)

    const ab = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength)
    return ab as ArrayBuffer
  }

  private async getViaFetch(sampleRef: string): Promise<ArrayBuffer> {
    // Build URL: baseUrl + "/" + sampleRef  (e.g. /sfz-instruments/samples/ep-c4.wav)
    const url = `${this.baseUrl}/${sampleRef}`
    console.log(`[SampleCache] fetch → ${url}`)
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`)
    return resp.arrayBuffer()
  }
}
