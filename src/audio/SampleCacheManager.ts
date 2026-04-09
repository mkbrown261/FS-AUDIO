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
 * In browser (dev/web):
 *   - Falls back to direct fetch() from the provided baseUrl
 */

export interface DownloadProgress {
  instrumentId: string
  filename: string
  pct: number          // 0-100
  received: number     // bytes received
  total: number        // bytes total (0 if unknown)
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
  private baseUrl: string          // GitHub raw URL prefix for samples
  private onProgress?: ProgressCallback
  private unsubProgress?: () => void

  // In-memory decoded buffer cache (so we don't re-decode every noteOn)
  private decodedCache = new Map<string, AudioBuffer>()

  constructor(instrumentId: string, baseUrl: string, onProgress?: ProgressCallback) {
    this.instrumentId = instrumentId
    this.baseUrl      = baseUrl
    this.onProgress   = onProgress

    // Wire up Electron progress events
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
   * Fetch and decode a sample, using local disk cache when in Electron.
   * Returns null if the sample cannot be loaded.
   */
  async getSample(ctx: AudioContext, filename: string): Promise<AudioBuffer | null> {
    // Already decoded in memory
    if (this.decodedCache.has(filename)) return this.decodedCache.get(filename)!

    try {
      let arrayBuffer: ArrayBuffer

      if (isElectron) {
        arrayBuffer = await this.getViaElectron(filename)
      } else {
        arrayBuffer = await this.getViaFetch(filename)
      }

      const decoded = await ctx.decodeAudioData(arrayBuffer)
      this.decodedCache.set(filename, decoded)
      return decoded
    } catch (err) {
      console.error(`[SampleCache] Failed to load "${filename}":`, err)
      this.onProgress?.({
        instrumentId: this.instrumentId,
        filename,
        pct: 0,
        received: 0,
        total: 0,
        done: true,
        error: String(err),
      })
      return null
    }
  }

  /**
   * Pre-download a list of samples in parallel (up to concurrency limit).
   * Call this when an instrument is selected, before notes are played.
   */
  async preloadSamples(ctx: AudioContext, filenames: string[], concurrency = 4): Promise<void> {
    // Skip already decoded
    const needed = filenames.filter(f => !this.decodedCache.has(f))
    if (needed.length === 0) return

    console.log(`[SampleCache] Preloading ${needed.length} samples for "${this.instrumentId}"`)

    // Download in chunks to avoid flooding the network
    for (let i = 0; i < needed.length; i += concurrency) {
      const batch = needed.slice(i, i + concurrency)
      await Promise.all(batch.map(f => this.getSample(ctx, f)))
    }

    console.log(`[SampleCache] ✅ Preload complete for "${this.instrumentId}"`)
  }

  /** Check how many of these filenames are already cached on disk */
  async getCachedStatus(filenames: string[]): Promise<Record<string, boolean>> {
    if (!isElectron) {
      // In browser mode we can't know without fetching
      return Object.fromEntries(filenames.map(f => [f, false]))
    }
    const result = await window.electronAPI!.sampleCheckCache(this.instrumentId, filenames)
    return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v !== null]))
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async getViaElectron(filename: string): Promise<ArrayBuffer> {
    const api = window.electronAPI!
    const url = `${this.baseUrl}/${filename}`

    // Trigger download (IPC handler caches to disk automatically)
    const result = await api.sampleDownload(this.instrumentId, filename, url)
    if (!result?.ok) throw new Error(`Download failed for ${filename}`)

    // Report 100% if we didn't get streaming progress (was cached)
    if (result.cached) {
      this.onProgress?.({ instrumentId: this.instrumentId, filename, pct: 100, received: 0, total: 0, done: true })
    }

    // Read the cached file back
    const uint8 = await api.sampleReadCached(this.instrumentId, filename)
    if (!uint8) throw new Error(`Failed to read cached file: ${filename}`)

    // uint8.buffer may be SharedArrayBuffer; slice() gives us a plain ArrayBuffer
    const ab = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength)
    return ab as ArrayBuffer
  }

  private async getViaFetch(filename: string): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/${filename}`
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`)
    return resp.arrayBuffer()
  }
}
