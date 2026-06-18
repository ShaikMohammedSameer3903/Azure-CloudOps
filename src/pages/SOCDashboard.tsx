// ============================================================
// SOC Dashboard — Security Operations Center
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Siren, Shield, AlertTriangle, Eye, Activity,
  RefreshCw, CheckCircle, XCircle, Clock, Globe,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { useAppStore, TENANT_CONFIGS } from '../store/appStore';
import { api } from '../services/api';

const SEVERITY_COLORS: Record<string, string> = { Critical: '#D13438', High: '#c05500', Medium: '#FFB900', Low: '#0078d4', Informational: '#64748b' };



export default function SOCDashboard() {
  const { activeSubscriptionId, activeEnvironment, defenderStatus, setDefenderStatus, incidents } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'timeline' | 'mitre' | 'incidents'>('timeline');

  const tenantConfig = activeEnvironment !== 'All' ? TENANT_CONFIGS[activeEnvironment] : null;

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeSubscriptionId) {
        const data = await api.get<any>('/api/monitoring/defender', { params: { subscriptionId: activeSubscriptionId } });
        setDefenderStatus(data);
      }
    } catch {
      setDefenderStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeSubscriptionId]);

  const alerts = defenderStatus?.alerts || [];
  const recommendations = defenderStatus?.recommendations || [];
  const securityIncidents = incidents.filter(i => i.tags?.includes('Security') || i.title?.toLowerCase().includes('security') || i.description?.toLowerCase().includes('security'));

  // Generate threat timeline data dynamically from real alerts/incidents
  const timelineData = useMemo(() => {
    const hours: Record<string, { threats: number; blocked: number; investigated: number }> = {};
    const now = new Date();
    
    // Initialize last 24 hours with 0
    for (let i = 0; i < 24; i++) {
      const h = new Date(now);
      h.setHours(h.getHours() - (23 - i));
      const label = `${h.getHours().toString().padStart(2, '0')}:00`;
      hours[label] = { threats: 0, investigated: 0, blocked: 0 };
    }

    alerts.forEach(a => {
      const date = new Date(a.detectedAt || new Date());
      const label = `${date.getHours().toString().padStart(2, '0')}:00`;
      if (hours[label]) {
        hours[label].threats++;
      }
    });

    securityIncidents.forEach(inc => {
      const date = new Date(inc.createdAt || new Date());
      const label = `${date.getHours().toString().padStart(2, '0')}:00`;
      if (hours[label]) {
        hours[label].investigated++;
      }
    });

    return Object.entries(hours).map(([time, counts]) => ({
      time,
      ...counts
    }));
  }, [alerts, securityIncidents]);

  // Compute blocked count from resolved alerts
  const blockedCount = useMemo(() => {
    return alerts.filter(a => {
      const status = (a.status || '').toLowerCase();
      return status === 'resolved' || status === 'dismissed' || status === 'blocked' || status === 'closed';
    }).length;
  }, [alerts]);

  // Compute mean response time from security incidents
  const meanResponseTime = useMemo(() => {
    const resolvedIncidents = securityIncidents.filter(i => 
      (i.status === 'Resolved' || i.status === 'Closed') && i.createdAt && i.resolvedAt
    );
    if (resolvedIncidents.length === 0) return null;
    const totalMs = resolvedIncidents.reduce((sum, i) => {
      return sum + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt!).getTime());
    }, 0);
    const avgMs = totalMs / resolvedIncidents.length;
    const avgMins = Math.round(avgMs / 60000);
    if (avgMins < 60) return `${avgMins}m`;
    const avgHours = Math.round(avgMins / 60);
    return `${avgHours}h`;
  }, [securityIncidents]);

  const threatSummary = [
    { label: 'Active Threats', value: alerts.length, color: '#D13438', icon: AlertTriangle },
    { label: 'Investigated', value: securityIncidents.filter(i => i.status === 'InProgress' || i.status === 'Acknowledged').length, color: '#FFB900', icon: Eye },
    { label: 'Blocked', value: blockedCount, color: '#107C10', icon: Shield },
    { label: 'Mean Response', value: meanResponseTime || '—', color: '#0078d4', icon: Clock },
  ];

  // Map real security incidents
  const recentIncidents = securityIncidents.map(inc => ({
    id: inc.id || 'SOC-INC',
    title: inc.title || 'Security Incident',
    severity: inc.severity || 'Medium',
    time: inc.createdAt ? new Date(inc.createdAt).toLocaleTimeString() : 'Unknown time',
    status: inc.status || 'Active',
    source: 'Azure Sentinel'
  }));

  const mitreTactics = useMemo(() => {
    const baseTactics = [
      { tactic: 'Initial Access', count: 0, color: '#D13438' },
      { tactic: 'Execution', count: 0, color: '#c05500' },
      { tactic: 'Persistence', count: 0, color: '#FFB900' },
      { tactic: 'Privilege Escalation', count: 0, color: '#107C10' },
      { tactic: 'Defense Evasion', count: 0, color: '#FFB900' },
      { tactic: 'Credential Access', count: 0, color: '#D13438' },
      { tactic: 'Discovery', count: 0, color: '#FFB900' },
      { tactic: 'Lateral Movement', count: 0, color: '#107C10' },
      { tactic: 'Collection', count: 0, color: '#0078d4' },
      { tactic: 'Exfiltration', count: 0, color: '#107C10' },
    ];

    alerts.forEach(a => {
      const desc = (a.description || a.displayName || '').toLowerCase();
      if (desc.includes('brute force') || desc.includes('login') || desc.includes('access')) {
        baseTactics[0].count++;
      } else if (desc.includes('powershell') || desc.includes('execution') || desc.includes('run')) {
        baseTactics[1].count++;
      } else if (desc.includes('persistence') || desc.includes('privilege')) {
        baseTactics[2].count++;
      } else if (desc.includes('credential') || desc.includes('password') || desc.includes('mfa')) {
        baseTactics[5].count++;
      } else if (desc.includes('discovery') || desc.includes('recon')) {
        baseTactics[6].count++;
      } else if (desc.includes('exfiltration') || desc.includes('download') || desc.includes('leak')) {
        baseTactics[9].count++;
      }
    });

    return baseTactics;
  }, [alerts]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Security Operations Center</h1>
          <p className="page-subtitle">
            Real-time threat monitoring, incident response, and MITRE ATT&CK mapping
            {tenantConfig && <> for <strong>{tenantConfig.name}</strong></>}
          </p>
        </div>
        <div className="page-actions">
          <div className="header-live-indicator" style={{ marginRight: 10 }}>
            <span className="live-dot" style={{ background: '#D13438' }} />
            <span style={{ fontWeight: 700, color: '#D13438', fontSize: 12 }}>MONITORING</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Threat Summary Cards */}
      <div className="kpi-grid">
        {threatSummary.map(item => (
          <div key={item.label} className="kpi-card">
            <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${item.color}, ${item.color}88)` }} />
            <div className="kpi-card-top">
              <div>
                <div className="kpi-label">{item.label}</div>
                <div className="kpi-value" style={{ color: item.color }}>{item.value}</div>
              </div>
              <div className="kpi-icon" style={{ background: `${item.color}18` }}>
                <item.icon size={20} color={item.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { id: 'timeline', label: 'Threat Timeline' },
          { id: 'mitre', label: 'MITRE ATT&CK' },
          { id: 'incidents', label: 'SOC Incidents', count: recentIncidents.length },
        ].map(tab => (
          <button key={tab.id} className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id as any)}>
            {tab.label}
            {tab.count !== undefined && <span className="tab-badge">{tab.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'timeline' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Activity size={16} color="#D13438" /> 24-Hour Threat Activity</div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D13438" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#D13438" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="blockedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#107C10" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#107C10" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-lg)' }} />
                <Area type="monotone" dataKey="threats" stroke="#D13438" strokeWidth={2} fill="url(#threatGrad)" name="Threats" />
                <Area type="monotone" dataKey="blocked" stroke="#107C10" strokeWidth={2} fill="url(#blockedGrad)" name="Blocked" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'mitre' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Globe size={16} color="var(--azure-600)" /> MITRE ATT&CK Coverage</div>
            <div className="card-subtitle">Threat activity mapped to MITRE ATT&CK tactics</div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mitreTactics} layout="vertical" margin={{ top: 5, right: 20, left: 120, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="tactic" type="category" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={115} />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Detections">
                  {mitreTactics.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'incidents' && (
        <div className="card">
          <div className="card-body" style={{ paddingTop: 8 }}>
            <div className="insight-list">
              {recentIncidents.map(inc => {
                const color = SEVERITY_COLORS[inc.severity] || '#64748b';
                const statusColor: Record<string, string> = { Investigating: '#FFB900', Contained: '#0078d4', Resolved: '#107C10' };
                return (
                  <div key={inc.id} className="insight-item">
                    <div className="insight-icon" style={{ background: `${color}18` }}>
                      <Siren size={16} color={color} />
                    </div>
                    <div className="insight-content">
                      <div className="insight-title">
                        <span style={{ fontWeight: 700, marginRight: 8, color: 'var(--text-tertiary)', fontSize: 11 }}>{inc.id}</span>
                        {inc.title}
                      </div>
                      <div className="insight-desc">
                        {inc.source} · {inc.time}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className={`severity-badge ${inc.severity.toLowerCase()}`}>{inc.severity}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: statusColor[inc.status] || 'var(--text-tertiary)' }}>{inc.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
