/**
 * MP3 encoder using lamejs (loaded as a global script in index.html via /lame.all.js).
 * No `require` — accesses the global `lamejs` object that lame.all.js injects.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// lame.all.js sets `window.lamejs` — pick it up as a typed global
declare const lamejs: {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array
    flush(): Int8Array
  }
}

export interface Mp3EncodeOptions {
  bitRate?: 128 | 192 | 256 | 320
  sampleRate?: number
}

/**
 * Encode an AudioBuffer to MP3 Blob.
 * Returns a Blob with type 'audio/mpeg'.
 */
export function encodeAudioBufferToMp3(
  audioBuffer: AudioBuffer,
  opts: Mp3EncodeOptions = {},
): Blob {
  const { bitRate = 192, sampleRate = audioBuffer.sampleRate } = opts

  if (typeof lamejs === 'undefined' || !lamejs.Mp3Encoder) {
    throw new Error('lamejs not loaded — make sure /lame.all.js is included in index.html')
  }

  const numChannels = Math.min(audioBuffer.numberOfChannels, 2)
  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitRate)

  const blockSize = 1152 // standard MP3 frame size
  const chunks: ArrayBuffer[] = []

  const leftF32  = audioBuffer.getChannelData(0)
  const rightF32 = numChannels > 1 ? audioBuffer.getChannelData(1) : leftF32

  function f32ToI16(f32: Float32Array, out: Int16Array, len: number) {
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]))
      out[i] = s < 0 ? s * 32768 : s * 32767
    }
  }

  const leftI16  = new Int16Array(blockSize)
  const rightI16 = new Int16Array(blockSize)

  for (let i = 0; i < audioBuffer.length; i += blockSize) {
    const len = Math.min(blockSize, audioBuffer.length - i)
    f32ToI16(leftF32.subarray(i, i + len),  leftI16,  len)
    f32ToI16(rightF32.subarray(i, i + len), rightI16, len)

    const mp3buf = numChannels === 2
      ? encoder.encodeBuffer(leftI16.subarray(0, len), rightI16.subarray(0, len))
      : encoder.encodeBuffer(leftI16.subarray(0, len))

    if (mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf).buffer)
  }

  const flushBuf = encoder.flush()
  if (flushBuf.length > 0) chunks.push(new Uint8Array(flushBuf).buffer)

  return new Blob(chunks, { type: 'audio/mpeg' })
}
