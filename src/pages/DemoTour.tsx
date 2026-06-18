import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { 
  Sparkles, CheckCircle, ShieldCheck, Landmark, 
  HelpCircle, Terminal, RefreshCw, Cpu, Server, 
  Database, Play, Pause, ChevronRight, RotateCcw, Info 
} from 'lucide-react';
import { api } from '../services/api';

interface ReplayEvent {
  time: string;
  action: string;
  status: string;
  details: string;
  logs: string[];
}

export default function DemoTour() {
  const { activeSubscriptionId } = useAppStore();
  const [selectedDemoResource, setSelectedDemoResource] = useState<'VM' | 'Storage' | 'AppService'>('VM');
  const [provisionStage, setProvisionStage] = useState(0);
  const [provisioning, setProvisioning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);

  // Playback Control States for Replay Center
  const [activeReplay, setActiveReplay] = useState<number | null>(null);
  const [replayStage, setReplayStage] = useState(0);
  const [replayState, setReplayState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const replayIntervalRef = useRef<any>(null);

  const demoResources = {
    VM: {
      name: 'Virtual Machine (D2s v5)',
      daily: 60,
      monthly: 1800,
      yearly: 21600,
      recommendation: 'Use Azure Reserved Instances to save up to 42% on VM cost.',
      annualProjected: 21600,
      azureRate: '₹2.50 / hour base rate'
    },
    Storage: {
      name: 'Storage Account (LRS GPv2)',
      daily: 4,
      monthly: 120,
      yearly: 1440,
      recommendation: 'Configure Lifecycle Management to automatically archive cool access files.',
      annualProjected: 1440,
      azureRate: '₹1.20 / GB storage capacity'
    },
    AppService: {
      name: 'App Service (B1 Basic)',
      daily: 21.6,
      monthly: 650,
      yearly: 7800,
      recommendation: 'Enable auto-scaling rules based on CPU metrics to optimize off-peak usage.',
      annualProjected: 7800,
      azureRate: '₹0.90 / compute hour'
    }
  };

  const replayData: ReplayEvent[] = [
    {
      time: '14:32:01',
      action: 'Create Resource Group (rg-core-prod)',
      status: 'Succeeded',
      details: 'Azure Resource Manager created resource group successfully in eastus.',
      logs: [
        'Initiating ARM request...',
        'Resolving subscription credentials...',
        'Submitting resource group parameter schema...',
        'Azure ARM response: 201 Created',
        'Resource group provisioned successfully.'
      ]
    },
    {
      time: '14:35:12',
      action: 'Create Storage Account (stprodcore01)',
      status: 'Succeeded',
      details: 'Standard storage account provisioned with LRS configuration.',
      logs: [
        'Validating request naming rules...',
        'Azure Auth token obtained.',
        'Submitting storage ARM template...',
        'Storage provisioning status: Active',
        'Storage endpoint resolved: https://stprodcore01.blob.core.windows.net/'
      ]
    },
    {
      time: '14:37:45',
      action: 'Deploy Virtual Machine (vm-web-prod)',
      status: 'Succeeded',
      details: 'Ubuntu Server VM deployed with managed premium OS disk.',
      logs: [
        'Resolving virtual network dependencies...',
        'Provisioning NIC: vm-web-prod-nic...',
        'Provisioning Public IP: vm-web-prod-ip...',
        'Attaching Premium OS Disk (30GB)...',
        'Starting VM instance deployment...',
        'VM Status: Running. IP: 52.175.40.12'
      ]
    }
  ];

  // Provisioning Simulation loop
  useEffect(() => {
    let elapsedTimer: any = null;
    if (provisioning) {
      elapsedTimer = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);

      const stages = [
        { msg: 'Validating ARM schema template...', delay: 800 },
        { msg: 'Acquiring Entra ID Authorization Token...', delay: 1800 },
        { msg: 'Submitting deployment request to Azure Resource Manager...', delay: 3000 },
        { msg: 'ARM Provisioning: Creating Resource Group...', delay: 4200 },
        { msg: 'ARM Provisioning: Creating VNet & Subnet scope...', delay: 5400 },
        { msg: 'ARM Provisioning: Resolving Public IP and NIC...', delay: 6800 },
        { msg: 'ARM Provisioning: Mounting premium Managed Disk...', delay: 8200 },
        { msg: 'Booting VM Instance and establishing secure connection...', delay: 9600 },
        { msg: 'Provisioning completed successfully.', delay: 10800 }
      ];

      stages.forEach((s, idx) => {
        setTimeout(() => {
          if (provisioning) {
            setProvisionStage(idx + 1);
            setLogs(prev => [...prev, s.msg]);
          }
        }, s.delay);
      });

      setTimeout(() => {
        setProvisioning(false);
        if (elapsedTimer) clearInterval(elapsedTimer);
      }, 11200);
    } else {
      if (elapsedTimer) clearInterval(elapsedTimer);
    }
    return () => {
      if (elapsedTimer) clearInterval(elapsedTimer);
    };
  }, [provisioning]);

  const startProvisionSim = () => {
    setLogs(['[SYSTEM] Starting simulated deployment...', 'Initializing workflow...']);
    setProvisionStage(0);
    setElapsed(0);
    setProvisioning(true);
  };

  // Replay Center Controls
  useEffect(() => {
    if (replayState === 'playing' && activeReplay !== null) {
      const event = replayData[activeReplay];
      replayIntervalRef.current = setInterval(() => {
        setReplayStage(prev => {
          if (prev >= event.logs.length) {
            clearInterval(replayIntervalRef.current);
            setReplayState('idle');
            return prev;
          }
          return prev + 1;
        });
      }, 1200);
    } else {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    }
    return () => {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, [replayState, activeReplay]);

  const handleReplayClick = (idx: number) => {
    setActiveReplay(idx);
    setReplayStage(1);
    setReplayState('playing');
  };

  const handlePlayPause = () => {
    if (replayState === 'playing') {
      setReplayState('paused');
    } else if (replayState === 'paused' || replayState === 'idle') {
      setReplayState('playing');
    }
  };

  const handleStepForward = () => {
    if (activeReplay === null) return;
    const event = replayData[activeReplay];
    setReplayStage(prev => Math.min(event.logs.length, prev + 1));
  };

  const handleResetReplay = () => {
    setReplayStage(0);
    setReplayState('idle');
    setActiveReplay(null);
  };

  const selectedCost = demoResources[selectedDemoResource];

  return (
    <div style={{ paddingBottom: 20, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>
      <header className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 22, fontWeight: 700 }}>
          <Sparkles size={22} color="var(--azure-600)" />
          Recruiter Demonstration Center
        </h1>
        <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
          Interactive playground to simulate deployment pipelines, compute cloud pricing models, and control audit trails.
        </p>
      </header>

      <div className="grid-2" style={{ gap: 20 }}>
        {/* Left: Provisioning playground */}
        <div className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
            <h2 className="card-title" style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Cpu size={16} color="var(--azure-600)" />
              Simulated Provisioning Playground
            </h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              {(['VM', 'Storage', 'AppService'] as const).map(res => (
                <button
                  key={res}
                  onClick={() => !provisioning && setSelectedDemoResource(res)}
                  className={`btn ${selectedDemoResource === res ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: 12 }}
                  disabled={provisioning}
                >
                  {res === 'VM' ? 'Virtual Machine' : res === 'Storage' ? 'Storage Account' : 'App Service'}
                </button>
              ))}
            </div>

            {/* Cost Preview & Upgraded Calculator */}
            <div style={{
              background: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-default)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12, color: 'var(--azure-600)', marginBottom: 10 }}>
                <Info size={14} />
                <span>Estimated Azure Pricing & Cost Projections</span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center', marginBottom: 12 }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', fontWeight: 600 }}>DAILY</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>₹{selectedCost.daily}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', fontWeight: 600 }}>MONTHLY</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: '#107C10' }}>₹{selectedCost.monthly}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', fontWeight: 600 }}>YEARLY</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: '#0078D4' }}>₹{selectedCost.yearly}</div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                <div style={{ marginBottom: 4 }}><strong>Base Rate:</strong> {selectedCost.azureRate}</div>
                <div style={{ marginBottom: 4 }}><strong>Projected Annual:</strong> <span style={{ color: '#0078D4', fontWeight: 700 }}>₹{selectedCost.annualProjected}</span></div>
                <div><strong>Savings Tip:</strong> <span style={{ color: '#107C10', fontWeight: 600 }}>{selectedCost.recommendation}</span></div>
              </div>
            </div>

            <button
              onClick={startProvisionSim}
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 20 }}
              disabled={provisioning}
            >
              <Play size={14} />
              <span>{provisioning ? `Provisioning... (${elapsed}s)` : `Simulate Creating ${selectedCost.name}`}</span>
            </button>

            {/* Step-by-Step Provisioning Visualizer */}
            {provisioning && (
              <div style={{
                background: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase' }}>PROVISIONING WORKFLOW VIEW</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
                  {[
                    { label: '1. User', stage: 1 },
                    { label: '2. Portal', stage: 2 },
                    { label: '3. ARM API', stage: 3 },
                    { label: '4. Res Group', stage: 4 },
                    { label: '5. VNet', stage: 5 },
                    { label: '6. Pub IP', stage: 6 },
                    { label: '7. Disk', stage: 7 },
                    { label: '8. VM', stage: 8 }
                  ].map(s => {
                    const isActive = provisionStage >= s.stage;
                    return (
                      <div key={s.label} style={{
                        textAlign: 'center',
                        padding: '8px 4px',
                        background: isActive ? '#107C1015' : 'var(--bg-surface)',
                        border: `1px solid ${isActive ? '#107C1088' : 'var(--border-subtle)'}`,
                        borderRadius: 8,
                        transition: 'all 0.3s ease'
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: isActive ? '#107C10' : 'var(--text-tertiary)' }}>{s.label}</div>
                        <div style={{ fontSize: 9, marginTop: 4, fontWeight: 600, color: isActive ? '#107C10' : 'var(--text-tertiary)' }}>
                          {isActive ? '✓ Done' : '⏳ Wait'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Live Terminal Output */}
            {(provisioning || logs.length > 2) && (
              <div style={{
                background: '#090d16',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                padding: '12px 14px',
                fontFamily: 'Consolas, monospace',
                fontSize: 11,
                color: '#34d399',
                maxHeight: 150,
                overflowY: 'auto'
              }}>
                <div style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Terminal size={12} />
                  <span>Interactive Live Provisioning Output logs</span>
                </div>
                {logs.map((log, index) => (
                  <div key={index} style={{ margin: '4px 0' }}>
                    &gt; {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Audit Replay Center */}
        <div className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
            <h2 className="card-title" style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Landmark size={16} color="var(--azure-600)" />
              Enterprise Audit Replay Center
            </h2>
          </div>
          <div className="card-body">
            <p className="card-subtitle mb-4" style={{ color: 'var(--text-secondary)' }}>Click any historical timeline action below to trigger a live demonstration replay of the logs and verification steps.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {replayData.map((e, idx) => (
                <div 
                  key={idx}
                  onClick={() => replayState === 'idle' && handleReplayClick(idx)}
                  className={`card p-3 ${activeReplay === idx ? 'border-azure' : ''}`}
                  style={{
                    background: activeReplay === idx ? '#0078D410' : 'var(--bg-surface-secondary)',
                    border: `1px solid ${activeReplay === idx ? 'var(--azure-600)' : 'var(--border-subtle)'}`,
                    cursor: replayState !== 'idle' && activeReplay !== idx ? 'not-allowed' : 'pointer',
                    borderRadius: 12
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{e.action}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{e.time}</span>
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4, margin: 0 }}>{e.details}</p>
                </div>
              ))}
            </div>

            {/* Replay Display & Playback Controls */}
            {activeReplay !== null && (
              <div style={{
                background: '#090d16',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '12px 14px',
                fontFamily: 'Consolas, monospace',
                fontSize: 11,
                color: '#60a5fa'
              }}>
                <div style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Terminal size={12} />
                    <span>Replaying logs: {replayData[activeReplay].action.split(' ')[0]}</span>
                  </span>
                  
                  {/* Playback Controls Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button 
                      onClick={handlePlayPause} 
                      style={{ color: '#ffffff', display: 'flex', padding: 2 }} 
                      title={replayState === 'playing' ? 'Pause' : 'Play'}
                    >
                      {replayState === 'playing' ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    <button 
                      onClick={handleStepForward} 
                      style={{ color: '#ffffff', display: 'flex', padding: 2 }} 
                      title="Step Forward"
                      disabled={replayState === 'playing'}
                    >
                      <ChevronRight size={12} />
                    </button>
                    <button 
                      onClick={handleResetReplay} 
                      style={{ color: '#ffffff', display: 'flex', padding: 2 }} 
                      title="Reset"
                    >
                      <RotateCcw size={12} />
                    </button>
                  </div>
                </div>
                {replayData[activeReplay].logs.slice(0, replayStage).map((log, index) => (
                  <div key={index} style={{ margin: '4px 0', color: index === replayStage - 1 ? '#60a5fa' : '#475569' }}>
                    &gt; {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
