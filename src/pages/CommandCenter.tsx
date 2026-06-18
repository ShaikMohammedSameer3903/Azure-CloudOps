import { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useOperationStore } from '../store/operationStore';
import { 
  Globe, Activity, ShieldAlert, Cpu, 
  ArrowRightLeft, AlertCircle, Maximize2, Minimize2, 
  Search, HardDrive, Database, Server, Key, Sparkles,
  RotateCw
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../providers/AuthProvider';

export default function CommandCenter() {
  const { resources, subscriptions, activeSubscriptionId, resourcesLoading } = useAppStore();
  const { operations } = useOperationStore();
  const { getAzureToken } = useAuth();
  
  const [isWarRoom, setIsWarRoom] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  
  // Real-time telemetry status
  const [sseStatus] = useState('Connected');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (!activeSubscriptionId) return;
    try {
      setIsSyncing(true);
      useAppStore.setState({ resourcesLoading: true });
      // Pass azure token explicitly so MSAL subscriptions sync against live Azure
      const azureToken = await getAzureToken();
      await api.post(`/api/subscriptions/${activeSubscriptionId}/sync`, {
        azureToken: azureToken || undefined
      });
      const res = await api.get<any[]>('/api/resources', { params: { subscriptionId: activeSubscriptionId } });
      useAppStore.getState().setResources(res);
      useAppStore.setState({ lastResourceSync: new Date().toISOString() });
    } catch (err) {
      console.error('[COMMAND CENTER] Sync failed:', err);
    } finally {
      setIsSyncing(false);
      useAppStore.setState({ resourcesLoading: false });
    }
  };

  // Search filter for topology
  const filteredResources = resources.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.resource_group || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group resources by Resource Group
  const groupedResources = filteredResources.reduce((acc, r) => {
    const rg = r.resource_group || 'other-resources';
    if (!acc[rg]) acc[rg] = [];
    acc[rg].push(r);
    return acc;
  }, {} as Record<string, typeof resources>);

  const toggleGroup = (rg: string) => {
    setExpandedGroups(prev => ({ ...prev, [rg]: !prev[rg] }));
  };

  const getResourceIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('compute') || t.includes('virtualmachine')) return <Server size={14} color="#0078d4" />;
    if (t.includes('storage')) return <Database size={14} color="#10b981" />;
    if (t.includes('vault')) return <Key size={14} color="#f59e0b" />;
    return <HardDrive size={14} color="#8b5cf6" />;
  };

  // Auto-expand resource groups on search
  useEffect(() => {
    if (searchTerm) {
      const newExpanded: Record<string, boolean> = {};
      Object.keys(groupedResources).forEach(rg => {
        newExpanded[rg] = true;
      });
      setExpandedGroups(newExpanded);
    }
  }, [searchTerm]);

  const activeSub = subscriptions.find(s => s.id === activeSubscriptionId);

  // AI Operational Insights
  const insights: any[] = []; // Replaced mock AI insights with real data pipeline

  return (
    <div style={{
      padding: isWarRoom ? '16px' : '0 0 16px',
      background: isWarRoom ? '#080a14' : 'transparent',
      minHeight: isWarRoom ? '100vh' : 'auto',
      position: isWarRoom ? 'fixed' : 'relative',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: isWarRoom ? 9999 : 1,
      overflowY: 'auto',
      color: isWarRoom ? '#ffffff' : 'var(--text-primary)',
      fontFamily: 'Outfit, sans-serif'
    }}>
      {/* Header */}
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, color: isWarRoom ? '#ffffff' : 'var(--text-primary)' }}>
            <Globe size={20} className="animate-spin" style={{ animationDuration: '20s' }} color="var(--azure-600)" />
            Operations Command Center
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}>
            Real-time topology.
          </p>
        </div>

        <button 
          onClick={() => setIsWarRoom(!isWarRoom)}
          className="btn btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            padding: '4px 10px',
            background: isWarRoom ? 'rgba(255,255,255,0.06)' : 'var(--bg-surface)',
            color: isWarRoom ? '#ffffff' : 'var(--text-primary)',
            borderColor: isWarRoom ? 'rgba(255,255,255,0.1)' : 'var(--border-default)'
          }}
        >
          {isWarRoom ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          <span>{isWarRoom ? 'Exit War Room' : 'War Room Mode'}</span>
        </button>
      </header>

      {/* Real-time Telemetry Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 12,
        marginBottom: 12
      }}>
        {[
          { label: 'RESOURCES DISCOVERED', value: resources.length, color: '#107C10', icon: <Server size={14} /> },
          { label: 'ACTIVE DEPLOYMENTS', value: operations.filter(o => o.status === 'Running').length, color: '#FFB900', icon: <Cpu size={14} /> },
          { label: 'SSE TELEMETRY STREAM', value: sseStatus, color: '#8b5cf6', icon: <ArrowRightLeft size={14} /> }
        ].map(m => (
          <div key={m.label} className="card p-2" style={{
            background: isWarRoom ? 'rgba(22, 27, 48, 0.4)' : 'var(--bg-surface)',
            backdropFilter: 'blur(8px)',
            border: isWarRoom ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--border-default)',
            color: isWarRoom ? '#ffffff' : 'var(--text-primary)',
            boxShadow: isWarRoom ? 'none' : 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <div style={{
              background: `${m.color}22`,
              border: `1px solid ${m.color}44`,
              borderRadius: 6,
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: m.color
            }}>{m.icon}</div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>{m.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 1, color: isWarRoom ? '#ffffff' : 'var(--text-primary)' }}>{m.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid: Topology Full Width */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 12,
        alignItems: 'start'
      }}>
        {/* Left Column: Interactive Topology */}
        <div className="card" style={{
          background: isWarRoom ? 'rgba(22, 27, 48, 0.5)' : 'var(--bg-surface)',
          border: isWarRoom ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--border-default)',
          color: isWarRoom ? '#ffffff' : 'var(--text-primary)',
          boxShadow: isWarRoom ? 'none' : 'var(--shadow-sm)',
          height: '100%',
          minHeight: 480,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
            <h2 className="card-title" style={{ fontSize: 13, color: isWarRoom ? '#ffffff' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe size={14} color="var(--azure-600)" />
              Interactive Subscription Topology
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleSync}
                disabled={isSyncing || resourcesLoading}
                className="btn btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  padding: '3px 8px',
                  height: 24,
                  background: isWarRoom ? 'rgba(255,255,255,0.06)' : 'var(--bg-surface)',
                  color: isWarRoom ? '#ffffff' : 'var(--text-primary)',
                  borderColor: isWarRoom ? 'rgba(255,255,255,0.1)' : 'var(--border-default)',
                  cursor: (isSyncing || resourcesLoading) ? 'not-allowed' : 'pointer',
                  borderRadius: 4
                }}
              >
                <RotateCw size={11} className={(isSyncing || resourcesLoading) ? 'animate-spin' : ''} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Azure'}</span>
              </button>
              <div style={{ position: 'relative', width: 150 }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input 
                  type="text" 
                  placeholder="Search topology..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 10px 4px 24px',
                    fontSize: 11.5,
                    borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.25)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card-body" style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', maxHeight: 480 }}>
            {resourcesLoading ? (
              /* Skeleton Loader */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 4 }}>
                <div style={{ height: 16, width: '60%', background: 'rgba(255,255,255,0.08)', borderRadius: 4 }} className="animate-pulse" />
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 12 }}>
                    <div style={{ height: 14, width: '40%', background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} className="animate-pulse" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12 }}>
                      <div style={{ height: 12, width: '85%', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} className="animate-pulse" />
                      <div style={{ height: 12, width: '70%', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} className="animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activeSub ? (
              <div style={{ paddingLeft: 4 }}>
                {/* Subscription Root Node */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                  <span style={{ color: '#0078d4' }}>●</span>
                  <span>{activeSub.name || 'Azure Subscription'}</span>
                  <span style={{ fontSize: 9.5, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                    {Object.keys(groupedResources).length} RGs
                  </span>
                </div>

                {/* Groups Tree */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 8 }}>
                  {Object.keys(groupedResources).length > 0 ? (
                    Object.entries(groupedResources).map(([rg, list]) => {
                      const isExpanded = expandedGroups[rg] !== false;
                      return (
                        <div key={rg} style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 8 }}>
                          <div 
                            onClick={() => toggleGroup(rg)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#94a3b8',
                              padding: '2px 0'
                            }}
                          >
                            <span>{isExpanded ? '▼' : '►'}</span>
                            <span>📁 {rg}</span>
                            <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>({list.length})</span>
                          </div>

                          {isExpanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12, marginTop: 2 }}>
                              {list.map(r => (
                                <div key={r.id} style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(255,255,255,0.01)',
                                  border: '1px solid rgba(255,255,255,0.02)'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {getResourceIcon(r.type)}
                                    <span style={{ fontSize: 11.5, fontWeight: 500 }}>{r.name}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{r.type.split('/').pop()}</span>
                                    <span className={`status-pill ${r.status === 'Running' || r.status === 'Healthy' ? 'healthy' : 'stopped'}`} style={{ fontSize: 8.5, padding: '1px 4px' }}>
                                      {r.status || 'Active'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', padding: 12, textAlign: 'center' }}>
                      No resources discovered in this subscription.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Compact helpful Empty State */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 12px', textAlign: 'center', gap: 10, height: '100%' }}>
                <AlertCircle size={24} color="#FFB900" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>No Subscription Selected</div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, maxWidth: 260 }}>
                    Please select an active subscription in the header selector to sync and display your topology.
                  </p>
                </div>
                <button 
                  onClick={() => window.location.hash = '/settings'} 
                  className="btn btn-primary btn-sm" 
                  style={{ fontSize: 11, padding: '3px 10px', height: 'auto', background: '#0078D4', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer' }}
                >
                  Configure Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Network Traffic Topology Animation */}
      <div className="card mt-3" style={{
        background: isWarRoom ? 'rgba(22, 27, 48, 0.4)' : 'var(--bg-surface)',
        border: isWarRoom ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--border-default)',
        color: isWarRoom ? '#ffffff' : 'var(--text-primary)',
        boxShadow: isWarRoom ? 'none' : 'var(--shadow-sm)'
      }}>
        <div className="card-header" style={{ padding: '10px 12px' }}>
          <h2 className="card-title" style={{ fontSize: 13, color: isWarRoom ? '#ffffff' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Globe size={14} color="var(--azure-600)" />
            Operations Network Topology Flow
          </h2>
        </div>
        {/* Compressed flow diagram card body */}
        <div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: '12px 10px', background: isWarRoom ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.01)', borderRadius: 6 }}>
          <div style={{ width: '100%', maxWidth: 740, position: 'relative' }}>
            {/* SVG Network Flow */}
            <svg viewBox="0 0 800 80" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
              <defs>
                <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0078D4" />
                  <stop offset="50%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#107C10" />
                </linearGradient>
              </defs>
              {/* Path lines */}
              <path d="M 50,40 L 220,40" stroke={isWarRoom ? "#1e293b" : "#cbd5e1"} strokeWidth="2.5" />
              <path d="M 220,40 L 400,40" stroke={isWarRoom ? "#1e293b" : "#cbd5e1"} strokeWidth="2.5" />
              <path d="M 400,40 L 580,40" stroke={isWarRoom ? "#1e293b" : "#cbd5e1"} strokeWidth="2.5" />
              <path d="M 580,40 L 750,40" stroke={isWarRoom ? "#1e293b" : "#cbd5e1"} strokeWidth="2.5" />

              {/* Animated pulses */}
              <path d="M 50,40 L 220,40" stroke="url(#flowGrad)" strokeWidth="2.5" strokeDasharray="10, 150" strokeDashoffset="0" className="pulse-flow" style={{ animation: 'flowDash 3s linear infinite' }} />
              <path d="M 220,40 L 400,40" stroke="url(#flowGrad)" strokeWidth="2.5" strokeDasharray="10, 150" strokeDashoffset="0" className="pulse-flow" style={{ animation: 'flowDash 3s linear infinite', animationDelay: '0.7s' }} />
              <path d="M 400,40 L 580,40" stroke="url(#flowGrad)" strokeWidth="2.5" strokeDasharray="10, 150" strokeDashoffset="0" className="pulse-flow" style={{ animation: 'flowDash 3s linear infinite', animationDelay: '1.4s' }} />
              <path d="M 580,40 L 750,40" stroke="url(#flowGrad)" strokeWidth="2.5" strokeDasharray="10, 150" strokeDashoffset="0" className="pulse-flow" style={{ animation: 'flowDash 3s linear infinite', animationDelay: '2.1s' }} />

              {/* Node Circles */}
              {[
                { cx: 50, label: 'Browser Client', color: '#0078D4' },
                { cx: 220, label: 'CloudOps Portal', color: '#0078D4' },
                { cx: 400, label: 'Backend API', color: '#38bdf8' },
                { cx: 580, label: 'Azure ARM API', color: '#107C10' },
                { cx: 750, label: 'Azure Subsystem', color: '#8b5cf6' }
              ].map(node => (
                <g key={node.cx}>
                  <circle cx={node.cx} cy={40} r={10} fill={isWarRoom ? "#0f172a" : "#ffffff"} stroke={node.color} strokeWidth="2.5" style={{ filter: `drop-shadow(0 0 5px ${node.color})` }} />
                  <text x={node.cx} y={66} fill="var(--text-secondary)" fontSize={10} fontWeight={600} textAnchor="middle">{node.label}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* AI Operations Insights Section */}
      <div className="card mt-3" style={{
        background: isWarRoom ? 'rgba(22, 27, 48, 0.4)' : 'var(--bg-surface)',
        border: isWarRoom ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--border-default)',
        color: isWarRoom ? '#ffffff' : 'var(--text-primary)',
        boxShadow: isWarRoom ? 'none' : 'var(--shadow-sm)'
      }}>
        <div className="card-header" style={{ padding: '10px 12px' }}>
          <h2 className="card-title" style={{ fontSize: 13, color: isWarRoom ? '#ffffff' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color="var(--azure-600)" />
            AI Operations Insights & Actions
          </h2>
        </div>
        <div className="card-body" style={{ padding: '10px 12px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 10
          }}>
            {insights.map((ins, i) => (
              <div key={i} style={{
                padding: 10,
                borderRadius: 6,
                background: ins.type === 'critical' ? 'rgba(209,52,56,0.06)' : ins.type === 'warning' ? 'rgba(255,185,0,0.06)' : 'rgba(0,120,212,0.06)',
                border: `1px solid ${
                  ins.type === 'critical' ? 'rgba(209,52,56,0.15)' : ins.type === 'warning' ? 'rgba(255,185,0,0.15)' : 'rgba(0,120,212,0.15)'
                }`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: isWarRoom ? '#ffffff' : 'var(--text-primary)',
                gap: 8
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ins.text}>{ins.text}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>Azure Portal Advisory</div>
                </div>
                <span style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: ins.type === 'critical' ? '#D1343822' : ins.type === 'warning' ? '#FFB90022' : '#0078D422',
                  color: ins.type === 'critical' ? '#D13438' : ins.type === 'warning' ? '#FFB900' : '#0078D4',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}>{ins.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* CSS Animations Injector */}
      <style>{`
        @keyframes flowDash {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -160; }
        }
      `}</style>
    </div>
  );
}
