import React, { useRef, useEffect, useState } from 'react'
import Meyda from 'meyda'

interface SpectrumAnalyzerProps {
  audioContext: AudioContext
  sourceNode?: AudioNode
  width?: number
  height?: number
  fftSize?: number
  smoothing?: number
  minDecibels?: number
  maxDecibels?: number
  showPeakHold?: boolean
  colorScheme?: 'default' | 'warm' | 'cool' | 'purple'
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  audioContext,
  sourceNode,
  width = 400,
  height = 200,
  fftSize = 2048,
  smoothing = 0.8,
  minDecibels = -90,
  maxDecibels = -10,
  showPeakHold = true,
  colorScheme = 'purple'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const meydaAnalyzerRef = useRef<any>(null)
  const peakHoldRef = useRef<number[]>([])
  const peakDecayRef = useRef<number[]>([])
  
  // Color schemes
  const colors = {
    default: { primary: '#06b6d4', secondary: '#0ea5e9', gradient: ['#06b6d4', '#3b82f6'] },
    warm: { primary: '#f59e0b', secondary: '#ef4444', gradient: ['#f59e0b', '#ef4444'] },
    cool: { primary: '#10b981', secondary: '#06b6d4', gradient: ['#10b981', '#06b6d4'] },
    purple: { primary: '#a855f7', secondary: '#ec4899', gradient: ['#a855f7', '#ec4899'] }
  }
  
  const color = colors[colorScheme]
  
  useEffect(() => {
    if (!audioContext || !sourceNode || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Initialize Meyda
    try {
      meydaAnalyzerRef.current = Meyda.createMeydaAnalyzer({
        audioContext,
        source: sourceNode,
        bufferSize: fftSize,
        featureExtractors: ['amplitudeSpectrum'],
        callback: (features: any) => {
          if (features.amplitudeSpectrum) {
            drawSpectrum(ctx, features.amplitudeSpectrum)
          }
        }
      })
      
      meydaAnalyzerRef.current.start()
      
      console.log('[Spectrum Analyzer] Started with Meyda')
    } catch (error) {
      console.error('[Spectrum Analyzer] Meyda initialization failed:', error)
    }
    
    return () => {
      if (meydaAnalyzerRef.current) {
        meydaAnalyzerRef.current.stop()
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [audioContext, sourceNode, fftSize])
  
  const drawSpectrum = (ctx: CanvasRenderingContext2D, spectrum: Float32Array) => {
    const canvas = ctx.canvas
    const width = canvas.width
    const height = canvas.height
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, height)
    
    // Draw grid
    drawGrid(ctx, width, height)
    
    // Calculate bar width
    const numBars = Math.min(64, spectrum.length / 2) // Use first half of spectrum
    const barWidth = width / numBars
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, color.gradient[0])
    gradient.addColorStop(1, color.gradient[1])
    
    // Draw bars
    for (let i = 0; i < numBars; i++) {
      // Average bins for smoother display
      const binStart = Math.floor((i / numBars) * spectrum.length / 2)
      const binEnd = Math.floor(((i + 1) / numBars) * spectrum.length / 2)
      let sum = 0
      for (let j = binStart; j < binEnd; j++) {
        sum += spectrum[j]
      }
      const average = sum / (binEnd - binStart)
      
      // Convert to dB
      const db = 20 * Math.log10(average + 0.0001)
      
      // Normalize to 0-1
      const normalized = (db - minDecibels) / (maxDecibels - minDecibels)
      const barHeight = Math.max(0, Math.min(1, normalized)) * height
      
      // Peak hold
      if (showPeakHold) {
        if (!peakHoldRef.current[i] || barHeight > peakHoldRef.current[i]) {
          peakHoldRef.current[i] = barHeight
          peakDecayRef.current[i] = 0
        } else {
          peakDecayRef.current[i] = (peakDecayRef.current[i] || 0) + 1
          if (peakDecayRef.current[i] > 5) {
            peakHoldRef.current[i] -= 2
          }
        }
      }
      
      const x = i * barWidth
      const y = height - barHeight
      
      // Draw bar
      ctx.fillStyle = gradient
      ctx.fillRect(x, y, barWidth - 1, barHeight)
      
      // Draw peak hold
      if (showPeakHold && peakHoldRef.current[i]) {
        const peakY = height - peakHoldRef.current[i]
        ctx.fillStyle = color.secondary
        ctx.fillRect(x, peakY, barWidth - 1, 2)
      }
    }
    
    // Draw frequency labels
    drawFrequencyLabels(ctx, width, height)
  }
  
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    
    // Horizontal lines (dB)
    const dbSteps = [-60, -40, -20, 0]
    dbSteps.forEach(db => {
      const normalized = (db - minDecibels) / (maxDecibels - minDecibels)
      const y = height - (normalized * height)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
      
      // Label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.font = '10px monospace'
      ctx.fillText(`${db}dB`, 5, y - 2)
    })
    
    // Vertical lines (frequency)
    const freqSteps = [100, 500, 1000, 5000, 10000]
    const nyquist = audioContext.sampleRate / 2
    freqSteps.forEach(freq => {
      if (freq < nyquist) {
        const normalized = Math.log10(freq / 20) / Math.log10(nyquist / 20)
        const x = normalized * width
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
    })
  }
  
  const drawFrequencyLabels = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    
    const labels = [
      { freq: 100, label: '100' },
      { freq: 1000, label: '1k' },
      { freq: 10000, label: '10k' }
    ]
    
    const nyquist = audioContext.sampleRate / 2
    labels.forEach(({ freq, label }) => {
      if (freq < nyquist) {
        const normalized = Math.log10(freq / 20) / Math.log10(nyquist / 20)
        const x = normalized * width
        ctx.fillText(label, x, height - 5)
      }
    })
  }
  
  return (
    <div style={{ 
      display: 'inline-block',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px',
      overflow: 'hidden',
      background: '#0a0a0f'
    }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      />
    </div>
  )
}
