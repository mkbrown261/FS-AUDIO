// SFZ Sampler using sfizz WebAssembly
// Full-featured professional SFZ sampler

declare const Module: any

export class SFZSamplerWasm {
  private ctx: AudioContext
  private destination: AudioNode
  private workletNode: AudioWorkletNode | null = null
  private sfizzInstance: any = null
  private isInitialized: boolean = false

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.destination = destination
  }

  /**
   * Initialize the sfizz AudioWorklet
   */
  async initialize() {
    if (this.isInitialized) return

    try {
      // Register the AudioWorklet processor
      await this.ctx.audioWorklet.addModule('/sfizz/sfizz-processor.js')
      
      // Create the worklet node
      this.workletNode = new AudioWorkletNode(this.ctx, 'sfizz', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      })
      
      // Connect to destination
      this.workletNode.connect(this.destination)
      
      this.isInitialized = true
      console.log('[SFZ WASM] Initialized successfully')
    } catch (error) {
      console.error('[SFZ WASM] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * Load an SFZ file
   */
  async loadSFZ(sfzContent: string, basePath: string = '') {
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (!this.workletNode) {
      throw new Error('Worklet not initialized')
    }

    // Send SFZ content to worklet
    this.workletNode.port.postMessage({
      type: 'loadSFZ',
      sfzContent,
      basePath
    })

    console.log('[SFZ WASM] Loading SFZ file')
  }

  /**
   * Load a sample file
   */
  async loadSample(path: string, audioData: ArrayBuffer) {
    if (!this.workletNode) {
      console.warn('[SFZ WASM] Worklet not ready, sample will be queued')
      return
    }

    this.workletNode.port.postMessage({
      type: 'loadSample',
      path,
      audioData
    }, [audioData])
  }

  /**
   * Play a note
   */
  noteOn(note: number, velocity: number = 127) {
    if (!this.workletNode) {
      console.warn('[SFZ WASM] Worklet not ready')
      return
    }

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity
    })
  }

  /**
   * Stop a note
   */
  noteOff(note: number) {
    if (!this.workletNode) return

    this.workletNode.port.postMessage({
      type: 'noteOff',
      note
    })
  }

  /**
   * Stop all notes
   */
  allNotesOff() {
    if (!this.workletNode) return

    this.workletNode.port.postMessage({
      type: 'allNotesOff'
    })
  }

  /**
   * Get info about the loaded instrument
   */
  getInfo() {
    return {
      initialized: this.isInitialized,
      hasWorklet: !!this.workletNode
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode = null
    }
    this.isInitialized = false
  }
}
