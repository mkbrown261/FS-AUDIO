import React, { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { getEssentiaAnalyzer, AnalysisResult } from '../audio/analysis/EssentiaAnalyzer'

export const AudioAnalysisPanel: React.FC = () => {
  const { tracks, selectedTrackId, clips } = useProjectStore()
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const selectedTrack = tracks.find(t => t.id === selectedTrackId)
  const trackClips = selectedTrack ? clips.filter(c => c.trackId === selectedTrack.id && c.type === 'audio') : []
  
  const analyzeClip = async (clipId: string) => {
    const clip = clips.find(c => c.id === clipId)
    if (!clip || !clip.audioBuffer) {
      setError('No audio buffer available for this clip')
      return
    }
    
    setAnalyzing(true)
    setError(null)
    
    try {
      const analyzer = getEssentiaAnalyzer()
      const analysisResult = await analyzer.analyzeAudio(clip.audioBuffer)
      setResult(analysisResult)
      
      console.log('[Audio Analysis] Complete:', analysisResult)
    } catch (err: any) {
      console.error('[Audio Analysis] Failed:', err)
      setError(err.message || 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }
  
  const quickBPMDetect = async () => {
    if (trackClips.length === 0) {
      setError('No audio clips on selected track')
      return
    }
    
    const clip = trackClips[0]
    if (!clip.audioBuffer) {
      setError('No audio buffer available')
      return
    }
    
    setAnalyzing(true)
    setError(null)
    
    try {
      const analyzer = getEssentiaAnalyzer()
      const bpmResult = await analyzer.detectBPM(clip.audioBuffer)
      
      // Update project BPM if confidence is high
      if (bpmResult.confidence > 0.7) {
        useProjectStore.getState().setBpm(bpmResult.bpm)
        alert(`BPM detected: ${bpmResult.bpm} (confidence: ${Math.round(bpmResult.confidence * 100)}%)`)
      } else {
        alert(`BPM detected: ${bpmResult.bpm} (low confidence: ${Math.round(bpmResult.confidence * 100)}%)`)
      }
    } catch (err: any) {
      setError(err.message || 'BPM detection failed')
    } finally {
      setAnalyzing(false)
    }
  }
  
  return (
    <div style={{
      padding: '16px',
      background: 'rgba(30, 30, 40, 0.95)',
      borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.1)',
      maxWidth: '600px'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#06b6d4', marginBottom: '4px' }}>
          🔬 Audio Analysis (Essentia.js)
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          Professional audio analysis powered by Spotify/MTG
        </div>
      </div>
      
      {/* Quick Actions */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button
          onClick={quickBPMDetect}
          disabled={analyzing || trackClips.length === 0}
          style={{
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            cursor: analyzing ? 'not-allowed' : 'pointer',
            opacity: analyzing || trackClips.length === 0 ? 0.5 : 1,
            transition: 'all 0.2s'
          }}
        >
          {analyzing ? '⏳ Analyzing...' : '🎵 Detect BPM'}
        </button>
      </div>
      
      {/* Clip List */}
      {selectedTrack && trackClips.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', marginBottom: '8px' }}>
            Audio Clips on {selectedTrack.name}:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {trackClips.map(clip => (
              <div
                key={clip.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>
                    {clip.name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>
                    {clip.audioBuffer ? `${Math.round(clip.audioBuffer.duration)}s • ${clip.audioBuffer.sampleRate / 1000}kHz` : 'No buffer'}
                  </div>
                </div>
                <button
                  onClick={() => analyzeClip(clip.id)}
                  disabled={analyzing || !clip.audioBuffer}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(6, 182, 212, 0.2)',
                    border: '1px solid #06b6d4',
                    borderRadius: '6px',
                    color: '#06b6d4',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: analyzing || !clip.audioBuffer ? 'not-allowed' : 'pointer',
                    opacity: analyzing || !clip.audioBuffer ? 0.5 : 1
                  }}
                >
                  Analyze
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Error Display */}
      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '6px',
          color: '#ef4444',
          fontSize: '12px',
          marginBottom: '16px'
        }}>
          ⚠️ {error}
        </div>
      )}
      
      {/* Results Display */}
      {result && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.05)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', marginBottom: '12px' }}>
            ✓ Analysis Complete
          </div>
          
          {/* Tempo/Rhythm */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>
              Tempo & Rhythm
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>BPM</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{result.bpm}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Confidence</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>{Math.round(result.confidence * 100)}%</div>
              </div>
            </div>
          </div>
          
          {/* Key/Scale */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>
              Key & Scale
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Key</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#a855f7' }}>{result.key}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Scale</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#a855f7', textTransform: 'capitalize' }}>{result.scale}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Confidence</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#a855f7' }}>{Math.round(result.keyConfidence * 100)}%</div>
              </div>
            </div>
          </div>
          
          {/* Loudness */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>
              Loudness
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>LUFS</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#06b6d4' }}>{result.loudness}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Dynamic Range</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#06b6d4' }}>{result.dynamicRange} dB</div>
              </div>
            </div>
          </div>
          
          {/* Spectral */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>
              Spectral Analysis
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Brightness</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>{result.brightness}</div>
              </div>
              <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Centroid</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>{result.spectralCentroid} Hz</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {!selectedTrack && (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '13px'
        }}>
          Select a track with audio clips to analyze
        </div>
      )}
    </div>
  )
}
