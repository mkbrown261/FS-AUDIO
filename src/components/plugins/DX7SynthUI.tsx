/**
 * FS-DX7 Synthesizer UI Component
 * 
 * Professional interface for 6-operator FM synthesis
 * Features:
 * - Algorithm selector with visual routing
 * - 6 operator panels with ADSR controls
 * - Global LFO and effects
 * - Preset management
 * 
 * @license GPL-3.0
 */

import React, { useState } from 'react';
import { DX7_ALGORITHMS } from '../../audio/synths/DX7Synth';

interface DX7SynthUIProps {
  params: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

// Knob component for DX7-style controls
const DX7Knob: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}> = ({ label, value, min, max, step = 0.01, onChange, unit = '' }) => {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: 50,
          height: 50,
          appearance: 'none',
          background: `conic-gradient(#00d4ff ${percentage}%, #1a1a2e ${percentage}%)`,
          borderRadius: '50%',
          cursor: 'pointer',
        }}
      />
      <span style={{ fontSize: 8, color: '#aaa', textAlign: 'center' }}>{label}</span>
      <span style={{ fontSize: 9, color: '#0ff', fontVariantNumeric: 'tabular-nums' }}>
        {value.toFixed(step >= 1 ? 0 : 2)}{unit}
      </span>
    </div>
  );
};

// Operator panel component
const OperatorPanel: React.FC<{
  opNum: number;
  params: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
  isCarrier: boolean;
}> = ({ opNum, params, onParamChange, isCarrier }) => {
  const prefix = `op${opNum}_`;
  
  const ratio = params[`${prefix}ratio`] || 1.0;
  const level = params[`${prefix}level`] || 50;
  const attack = params[`${prefix}attack`] || 0.01;
  const decay = params[`${prefix}decay`] || 0.3;
  const sustain = params[`${prefix}sustain`] || 0.7;
  const release = params[`${prefix}release`] || 0.5;
  
  return (
    <div style={{
      background: isCarrier ? 'rgba(0, 212, 255, 0.05)' : 'rgba(255, 100, 100, 0.05)',
      border: `1px solid ${isCarrier ? '#00d4ff' : '#ff6464'}`,
      borderRadius: 6,
      padding: 8,
      minWidth: 280,
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 6,
      }}>
        <span style={{ 
          fontSize: 11, 
          fontWeight: 600,
          color: isCarrier ? '#00d4ff' : '#ff6464',
        }}>
          OP {opNum} {isCarrier ? '●' : '▸'}
        </span>
        <span style={{ fontSize: 9, color: '#666' }}>
          {isCarrier ? 'Carrier' : 'Modulator'}
        </span>
      </div>
      
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <DX7Knob
          label="Ratio"
          value={ratio}
          min={0.5}
          max={31}
          step={0.25}
          onChange={v => onParamChange(`${prefix}ratio`, v)}
        />
        <DX7Knob
          label="Level"
          value={level}
          min={0}
          max={99}
          step={1}
          onChange={v => onParamChange(`${prefix}level`, v)}
        />
        <DX7Knob
          label="Attack"
          value={attack}
          min={0.001}
          max={2}
          step={0.001}
          onChange={v => onParamChange(`${prefix}attack`, v)}
          unit="s"
        />
        <DX7Knob
          label="Decay"
          value={decay}
          min={0.001}
          max={2}
          step={0.001}
          onChange={v => onParamChange(`${prefix}decay`, v)}
          unit="s"
        />
        <DX7Knob
          label="Sustain"
          value={sustain}
          min={0}
          max={1}
          step={0.01}
          onChange={v => onParamChange(`${prefix}sustain`, v)}
        />
        <DX7Knob
          label="Release"
          value={release}
          min={0.001}
          max={5}
          step={0.001}
          onChange={v => onParamChange(`${prefix}release`, v)}
          unit="s"
        />
      </div>
    </div>
  );
};

export function DX7SynthUI({ params, onParamChange }: DX7SynthUIProps) {
  const [activeTab, setActiveTab] = useState<'operators' | 'global'>('operators');
  
  const algorithm = params.algorithm || 0;
  const currentAlg = DX7_ALGORITHMS[algorithm];
  
  // Determine which operators are carriers vs modulators
  const carriers = new Set(currentAlg.carriers);
  
  return (
    <div style={{
      background: '#0f0f1a',
      borderRadius: 8,
      padding: 12,
      color: '#fff',
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: '1px solid #333',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, color: '#00d4ff' }}>
            FS-DX7 <span style={{ fontSize: 10, color: '#666' }}>FM Synthesizer</span>
          </h3>
          <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
            6-Operator Frequency Modulation
          </div>
        </div>
        
        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setActiveTab('operators')}
            style={{
              background: activeTab === 'operators' ? '#00d4ff' : '#1a1a2e',
              color: activeTab === 'operators' ? '#000' : '#aaa',
              border: 'none',
              borderRadius: 4,
              padding: '4px 12px',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            OPERATORS
          </button>
          <button
            onClick={() => setActiveTab('global')}
            style={{
              background: activeTab === 'global' ? '#00d4ff' : '#1a1a2e',
              color: activeTab === 'global' ? '#000' : '#aaa',
              border: 'none',
              borderRadius: 4,
              padding: '4px 12px',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            GLOBAL
          </button>
        </div>
      </div>
      
      {/* Algorithm Selector */}
      <div style={{
        background: '#1a1a2e',
        borderRadius: 6,
        padding: 10,
        marginBottom: 12,
      }}>
        <label style={{ fontSize: 10, color: '#aaa', display: 'block', marginBottom: 6 }}>
          ALGORITHM
        </label>
        <select
          value={algorithm}
          onChange={e => onParamChange('algorithm', parseInt(e.target.value))}
          style={{
            width: '100%',
            background: '#0f0f1a',
            color: '#00d4ff',
            border: '1px solid #333',
            borderRadius: 4,
            padding: 8,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {DX7_ALGORITHMS.map((alg, idx) => (
            <option key={idx} value={idx}>
              {idx + 1}. {alg.name} ({alg.carriers.length} Carriers)
            </option>
          ))}
        </select>
        
        <div style={{ 
          marginTop: 8, 
          fontSize: 9, 
          color: '#666',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>
            Carriers: {currentAlg.carriers.map(c => `OP${c+1}`).join(', ')}
          </span>
          <span>
            Connections: {currentAlg.connections.length}
          </span>
        </div>
      </div>
      
      {/* Operators Tab */}
      {activeTab === 'operators' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 10,
          maxHeight: 500,
          overflowY: 'auto',
        }}>
          {[1, 2, 3, 4, 5, 6].map(opNum => (
            <OperatorPanel
              key={opNum}
              opNum={opNum}
              params={params}
              onParamChange={onParamChange}
              isCarrier={carriers.has(opNum - 1)}
            />
          ))}
        </div>
      )}
      
      {/* Global Tab */}
      {activeTab === 'global' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Feedback */}
          <div style={{
            background: '#1a1a2e',
            borderRadius: 6,
            padding: 10,
          }}>
            <label style={{ fontSize: 10, color: '#aaa', display: 'block', marginBottom: 6 }}>
              FEEDBACK (Operator 1 Self-Modulation)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range"
                min={0}
                max={7}
                step={1}
                value={params.feedback || 0}
                onChange={e => onParamChange('feedback', parseInt(e.target.value))}
                style={{ flex: 1, accentColor: '#00d4ff' }}
              />
              <span style={{ fontSize: 12, color: '#00d4ff', minWidth: 30, textAlign: 'right' }}>
                {params.feedback || 0}
              </span>
            </div>
          </div>
          
          {/* LFO Section */}
          <div style={{
            background: '#1a1a2e',
            borderRadius: 6,
            padding: 10,
          }}>
            <label style={{ fontSize: 10, color: '#aaa', display: 'block', marginBottom: 8 }}>
              LFO (Low Frequency Oscillator)
            </label>
            
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <DX7Knob
                label="Rate"
                value={params.lfo_rate || 5}
                min={0.1}
                max={20}
                step={0.1}
                onChange={v => onParamChange('lfo_rate', v)}
                unit="Hz"
              />
              <DX7Knob
                label="Depth"
                value={params.lfo_depth || 0}
                min={0}
                max={1}
                step={0.01}
                onChange={v => onParamChange('lfo_depth', v)}
              />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 8, color: '#aaa' }}>Waveform</label>
                <select
                  value={params.lfo_wave || 0}
                  onChange={e => onParamChange('lfo_wave', parseInt(e.target.value))}
                  style={{
                    background: '#0f0f1a',
                    color: '#00d4ff',
                    border: '1px solid #333',
                    borderRadius: 4,
                    padding: 6,
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  <option value={0}>Sine</option>
                  <option value={1}>Square</option>
                  <option value={2}>Sawtooth</option>
                  <option value={3}>Triangle</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Master Controls */}
          <div style={{
            background: '#1a1a2e',
            borderRadius: 6,
            padding: 10,
          }}>
            <label style={{ fontSize: 10, color: '#aaa', display: 'block', marginBottom: 8 }}>
              MASTER
            </label>
            
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <DX7Knob
                label="Transpose"
                value={params.transpose || 0}
                min={-24}
                max={24}
                step={1}
                onChange={v => onParamChange('transpose', v)}
                unit=" st"
              />
              <DX7Knob
                label="Volume"
                value={params.master_volume || 0.7}
                min={0}
                max={1}
                step={0.01}
                onChange={v => onParamChange('master_volume', v)}
              />
            </div>
          </div>
          
          {/* Info Panel */}
          <div style={{
            background: 'rgba(0, 212, 255, 0.05)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            borderRadius: 6,
            padding: 10,
            fontSize: 9,
            color: '#888',
            lineHeight: 1.6,
          }}>
            <div style={{ color: '#00d4ff', fontWeight: 600, marginBottom: 4 }}>💡 FM Synthesis Tips</div>
            <div>• <strong>Carriers</strong> produce sound you hear</div>
            <div>• <strong>Modulators</strong> shape the carriers' harmonics</div>
            <div>• Higher <strong>ratio</strong> = higher harmonic content</div>
            <div>• <strong>Feedback</strong> adds richness and grit</div>
            <div>• Try different <strong>algorithms</strong> for varied timbres</div>
          </div>
        </div>
      )}
    </div>
  );
}
