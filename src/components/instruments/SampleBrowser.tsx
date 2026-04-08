import React, { useState, useRef } from 'react'

interface Sample {
  name: string
  url: string
  size?: number
  duration?: number
}

interface SampleBrowserProps {
  onSelectSample: (url: string, name: string) => void
  onClose: () => void
}

export const SampleBrowser: React.FC<SampleBrowserProps> = ({ onSelectSample, onClose }) => {
  const [samples, setSamples] = useState<Sample[]>([])
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return
    
    const newSamples: Sample[] = []
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      // Check if it's an audio file
      if (file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file)
        newSamples.push({
          name: file.name,
          url,
          size: file.size
        })
      }
    }
    
    setSamples(prev => [...prev, ...newSamples])
  }
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }
  
  const handlePreview = (sample: Sample) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    
    if (selectedSample?.url === sample.url && isPlaying) {
      // Stop if already playing this sample
      setIsPlaying(false)
      return
    }
    
    const audio = new Audio(sample.url)
    audioRef.current = audio
    
    audio.addEventListener('ended', () => {
      setIsPlaying(false)
    })
    
    audio.play()
    setSelectedSample(sample)
    setIsPlaying(true)
  }
  
  const handleSelect = (sample: Sample) => {
    onSelectSample(sample.url, sample.name)
    
    // Stop preview
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }
  
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        width: '90%',
        maxWidth: '700px',
        maxHeight: '80vh',
        background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#06b6d4', marginBottom: '4px' }}>
              📂 Sample Browser
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Drag & drop audio files or click browse
            </div>
          </div>
          
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.transform = 'scale(1.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            ✕
          </button>
        </div>
        
        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            margin: '20px',
            padding: '40px 20px',
            border: isDragging 
              ? '2px dashed #06b6d4' 
              : '2px dashed rgba(255,255,255,0.2)',
            borderRadius: '12px',
            background: isDragging 
              ? 'rgba(6, 182, 212, 0.1)' 
              : 'rgba(255,255,255,0.02)',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>
            {isDragging ? '⬇️' : '📁'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
            {isDragging ? 'Drop files here' : 'Drag & drop audio files'}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            or click to browse • WAV, MP3, OGG, FLAC supported
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleFileSelect(e.target.files)}
          />
        </div>
        
        {/* Sample List */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '0 20px 20px'
        }}>
          {samples.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#6b7280',
              fontSize: '14px'
            }}>
              No samples loaded yet. Add some audio files to get started!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {samples.map((sample, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: selectedSample?.url === sample.url 
                      ? 'rgba(6, 182, 212, 0.2)' 
                      : 'rgba(255,255,255,0.05)',
                    border: selectedSample?.url === sample.url
                      ? '1px solid #06b6d4'
                      : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => setSelectedSample(sample)}
                  onMouseEnter={e => {
                    if (selectedSample?.url !== sample.url) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedSample?.url !== sample.url) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }
                  }}
                >
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20
                  }}>
                    🎵
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#fff',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {sample.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      {formatFileSize(sample.size)}
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePreview(sample)
                    }}
                    style={{
                      padding: '6px 12px',
                      background: isPlaying && selectedSample?.url === sample.url
                        ? 'rgba(239, 68, 68, 0.2)'
                        : 'rgba(6, 182, 212, 0.2)',
                      border: isPlaying && selectedSample?.url === sample.url
                        ? '1px solid #ef4444'
                        : '1px solid #06b6d4',
                      borderRadius: '6px',
                      color: isPlaying && selectedSample?.url === sample.url ? '#ef4444' : '#06b6d4',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isPlaying && selectedSample?.url === sample.url ? '⏸ STOP' : '▶ PREVIEW'}
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelect(sample)
                    }}
                    style={{
                      padding: '6px 12px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    ✓ USE
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
