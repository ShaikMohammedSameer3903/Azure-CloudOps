// ============================================================
// Executive Dashboard — Multi-Cloud KPIs & Cross-Cloud Metrics
// All data from backend APIs — NO mock data
// ============================================================

import { useEffect, useState } from 'react';
import {
  Server, Shield, DollarSign, AlertTriangle,
  RefreshCw, CheckCircle, Activity, Cloud,
  HardDrive, TrendingUp, Globe, Layers,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useCloudStore, type CloudProvider } from '../store/cloudStore';
import { api } from '../services/api';
import { cloudAccountsApi } from '../services/cloudAccounts';

import { AnimatedCounter } from '../components/common/AnimatedCounter';

const PROVIDER_COLORS: Record<string, string> = {
  azure: '#0078d4',
  aws: '#FF9900',
  gcp: '#4285F4',
};

const CHART_COLORS = ['#0078d4', '#FF9900', '#4285F4', '#107C10', '#8b5cf6', '#D13438'];

import {fmtNumber, fmtCurrency} from '../utils/formatters';

function KpiCard({ label, value, icon: Icon, color, subtitle, rawValue, isCurrency }: {
  label: string; value: string; icon: any; color: string; subtitle?: string; rawValue?: number; isCurrency?: boolean;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      <div className="kpi-card-top">
        <div>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value" style={{ color }}>
            {rawValue !== undefined && rawValue !== null ? (
              <AnimatedCounter value={rawValue} formatValue={isCurrency ? fmtCurrency : fmtNumber} />
            ) : value}
          </div>
        </div>
        <div className="kpi-icon" style={{ background: `${color}18` }}>
          <Icon size={20} color={color} />
        </div>
      </div>
      {subtitle && <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{subtitle}</div>}
    </div>
  );
}

export default function ExecutiveDashboard() {
  const { selectedProvider, setSelectedProvider, cloudAccounts, setCloudAccounts } = useCloudStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Aggregated data from APIs
  const [metrics, setMetrics] = useState<any>(null);
  const [resources, setResources] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [costData, setCostData] = useState<any>(null);
  const [securityData, setSecurityData] = useState<any>(null);

  const fetchAll = async () => {
    setRefreshing(true);
    try {
      const [accountsRes, resourcesRes, incidentsRes, costRes, secRes] = await Promise.allSettled([
        cloudAccountsApi.getAll(),
        api.get<any[]>('/api/resources', { params: { provider: selectedProvider } }),
        api.get<any>('/api/monitoring/security/unified', { params: { provider: selectedProvider } }),
        api.get<any>('/api/monitoring/cost/unified', { params: { provider: selectedProvider } }),
        api.get<any>('/api/monitoring/security/unified', { params: { provider: selectedProvider } }),
      ]);

      if (accountsRes.status === 'fulfilled') setCloudAccounts(accountsRes.value);
      if (resourcesRes.status === 'fulfilled') setResources(resourcesRes.value);
      if (incidentsRes.status === 'fulfilled') setIncidents(incidentsRes.value.findings || []);
      if (costRes.status === 'fulfilled') setCostData(costRes.value);
      if (secRes.status === 'fulfilled') setSecurityData({ score: { percentage: secRes.value.overallScore } });
    } catch (err) {
      console.error('[Executive] Failed to fetch data:', err);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [selectedProvider]);

  const isZeroState = cloudAccounts.length === 0;

  const azureAccounts = cloudAccounts.filter(a => a.provider === 'azure').length;
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws').length;
  const gcpAccounts = cloudAccounts.filter(a => a.provider === 'gcp').length;
  
  const azureResources = isZeroState ? 0 : resources.filter(r => (r.provider || 'azure').toLowerCase() === 'azure').length;
  const awsResources = isZeroState ? 0 : resources.filter(r => r.provider === 'aws').length;
  const gcpResources = isZeroState ? 0 : resources.filter(r => r.provider === 'gcp').length;
  
  const totalResources = azureResources + awsResources + gcpResources;

  const openIncidents = isZeroState ? 0 : incidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved' && i.status !== 'CLOSED' && i.status !== 'ARCHIVED').length;
  const criticalIncidents = isZeroState ? 0 : incidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'SEV0' || i.severity === 'High').length;
  const secScore = isZeroState ? null : (securityData?.score?.percentage ?? securityData?.secureScore?.percentage ?? null);
  const spend = isZeroState ? 0 : (costData?.totalCost ?? costData?.currentSpend ?? 0);

  const providerDistribution = [
    { name: 'Azure', value: azureResources, color: PROVIDER_COLORS.azure },
    { name: 'AWS', value: awsResources, color: PROVIDER_COLORS.aws },
    { name: 'GCP', value: gcpResources, color: PROVIDER_COLORS.gcp },
  ].filter(d => d.value > 0);

  const providerTabs: { label: string; value: CloudProvider; icon: string }[] = [
    { label: 'All Clouds', value: 'all', icon: '🌐' },
    { label: 'Azure', value: 'azure', icon: '🔷' },
    { label: 'AWS', value: 'aws', icon: '🟠' },
    { label: 'GCP', value: 'gcp', icon: '🔴' },
  ];

  if (cloudAccounts.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', minHeight: '80vh', textAlign: 'center'
      }}>
        <div style={{
          width: 80, height: 80, margin: '0 auto 24px', background: 'rgba(255,255,255,0.05)',
          borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <Cloud size={40} color="#0078d4" />
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'white' }}>No Enterprise Cloud Accounts Connected</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 500, lineHeight: 1.5, marginBottom: 40, fontSize: 16 }}>
          Connect your cloud environments to begin monitoring resources, security posture, and compliance.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => window.location.href='/discovery?cloud=Azure'} className="btn" style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <Cloud size={18} /> Connect Azure
          </button>
          <button onClick={() => window.location.href='/discovery?cloud=AWS'} className="btn" style={{ background: 'rgba(255,153,0,0.1)', color: '#FF9900', border: '1px solid rgba(255,153,0,0.2)', padding: '12px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <Layers size={18} /> Connect AWS
          </button>
          <button onClick={() => window.location.href='/discovery?cloud=GCP'} className="btn" style={{ background: 'rgba(66,133,244,0.1)', color: '#4285F4', border: '1px solid rgba(66,133,244,0.2)', padding: '12px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <Globe size={18} /> Connect GCP
          </button>
        </div>
      </div>
    );
  }

  if (loading && resources.length === 0) {
    return (
      <div>
        <div className="page-header"><div className="page-header-content">
          <div className="skeleton skeleton-text lg" style={{ width: 280, height: 26, marginBottom: 6 }} />
          <div className="skeleton skeleton-text" style={{ width: 400 }} />
        </div></div>
        <div className="kpi-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 90, borderRadius: 10 }} /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Executive Command Center</h1>
          <p className="page-subtitle">Unified operational intelligence across all connected cloud providers</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Provider Selector */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-subtle)' }}>
            {providerTabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setSelectedProvider(tab.value)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: 1,
                  background: selectedProvider === tab.value ? 'var(--azure-500)' : 'transparent',
                  color: selectedProvider === tab.value ? 'white' : 'var(--text-secondary)',
                  transition: 'all 150ms ease',
                }}
                title={tab.label}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <KpiCard label="Cloud Accounts" value={String(cloudAccounts.length)} rawValue={cloudAccounts.length} icon={Cloud} color="#0078d4" subtitle={`Azure: ${azureAccounts} • AWS: ${awsAccounts} • GCP: ${gcpAccounts}`} />
        <KpiCard label="Total Resources" value={fmtNumber(totalResources)} rawValue={totalResources} icon={Server} color="#00B7C3" subtitle={`Azure: ${azureResources} • AWS: ${awsResources} • GCP: ${gcpResources}`} />
        <KpiCard label="Monthly Spend" value={fmtCurrency(spend)} rawValue={spend} isCurrency={true} icon={DollarSign} color="#107C10" subtitle="Current billing period" />
        <KpiCard label="Security Score" value={secScore != null ? `${Math.round(secScore)}%` : '—'} rawValue={secScore != null ? Math.round(secScore) : undefined} icon={Shield} color={secScore != null && secScore >= 80 ? '#107C10' : '#FFB900'} subtitle="Cross-cloud posture" />
        <KpiCard label="Open Incidents" value={String(openIncidents)} rawValue={openIncidents} icon={AlertTriangle} color={criticalIncidents > 0 ? '#D13438' : '#FFB900'} subtitle={`${criticalIncidents} critical`} />
        <KpiCard label="Active Resources" value={fmtNumber(resources.filter(r => r.status === 'Running' || r.status === 'Succeeded' || r.status === 'Active' || r.status === 'Available').length)} rawValue={resources.filter(r => r.status === 'Running' || r.status === 'Succeeded' || r.status === 'Active' || r.status === 'Available').length} icon={Activity} color="#8b5cf6" subtitle="Healthy & running" />
      </div>

      {/* Charts Row */}
      <div className="dashboard-grid">
        {/* Resource Distribution by Provider */}
        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title"><Layers size={16} color="#0078d4" /> Resource Distribution</div>
          </div>
          <div className="card-body">
            {providerDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={providerDistribution} cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3} dataKey="value">
                    {providerDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <div className="empty-state-icon"><Server size={24} /></div>
                <div className="empty-state-title">No resources discovered</div>
                <div className="empty-state-desc">Connect a cloud account to begin</div>
              </div>
            )}
            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
              {providerDistribution.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Connection Health */}
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title"><Globe size={16} color="#00B7C3" /> Connection Health</div>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {cloudAccounts.length > 0 ? (
              <div className="insight-list">
                {cloudAccounts.map(account => {
                  const healthOptions = ['Connected', 'Syncing', 'Permission Issues', 'Disconnected'];
                  // Determine health status from real account status
                  let healthStatus = account.status === 'Active' || account.status === 'Connected' ? 'Connected' : 'Disconnected';
                  if (account.status === 'Syncing') healthStatus = 'Syncing';
                  if (account.status === 'PermissionError' || account.status === 'Error') healthStatus = 'Permission Issues';

                  const getHealthBadge = (status: string) => {
                    switch(status) {
                      case 'Connected': return <span className="severity-badge p4" style={{ background: 'rgba(16,124,16,0.15)', color: '#107C10' }}><CheckCircle size={10} style={{marginRight: 4}}/> Connected</span>;
                      case 'Syncing': return <span className="severity-badge p3" style={{ background: 'rgba(0,120,212,0.15)', color: '#0078d4' }}><RefreshCw size={10} className="animate-spin" style={{marginRight: 4}}/> Syncing</span>;
                      case 'Permission Issues': return <span className="severity-badge p2" style={{ background: 'rgba(255,185,0,0.15)', color: '#FFB900' }}><AlertTriangle size={10} style={{marginRight: 4}}/> Permission Issues</span>;
                      default: return <span className="severity-badge p1"><AlertTriangle size={10} style={{marginRight: 4}}/> Disconnected</span>;
                    }
                  };

                  return (
                    <div key={account.id} className="insight-item" style={{ alignItems: 'center' }}>
                      <div className="insight-icon" style={{ background: `${PROVIDER_COLORS[account.provider] || '#94a3b8'}18` }}>
                        <Cloud size={16} color={PROVIDER_COLORS[account.provider] || '#94a3b8'} />
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{account.account_name}</div>
                        <div className="insight-desc">
                          {account.provider.toUpperCase()} · {account.subscription_id || account.account_id || 'N/A'}
                        </div>
                      </div>
                      {getHealthBadge(healthStatus)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon"><Cloud size={24} /></div>
                <div className="empty-state-title">No cloud accounts connected</div>
                <div className="empty-state-desc">You should complete the onboarding flow.</div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Incidents */}
        <div className="card col-span-3">
          <div className="card-header">
            <div className="card-title">
              <AlertTriangle size={16} color={openIncidents > 0 ? 'var(--danger-600)' : 'var(--success-600)'} />
              Recent Incidents Across All Clouds
            </div>
            {openIncidents > 0 && <span className="severity-badge p1">{openIncidents}</span>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {incidents.length > 0 ? (
              <div className="insight-list">
                {incidents.slice(0, 6).map(inc => {
                  const sevMap: Record<string, string> = { CRITICAL: 'p1', WARNING: 'p2', INFORMATIONAL: 'p4', SEV0: 'p1', SEV1: 'p1', SEV2: 'p2', SEV3: 'p3' };
                  return (
                    <div key={inc.id} className="insight-item">
                      <div className="insight-icon" style={{ background: 'rgba(209,52,56,0.1)' }}>
                        <AlertTriangle size={16} color="var(--danger-600)" />
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{inc.title}</div>
                        <div className="insight-desc">{inc.description?.substring(0, 80)}...</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${PROVIDER_COLORS[inc.provider || 'azure']}18`, color: PROVIDER_COLORS[inc.provider || 'azure'] }}>
                        {(inc.provider || 'azure').toUpperCase()}
                      </span>
                      <span className={`severity-badge ${sevMap[inc.severity] || 'p3'}`}>{inc.severity}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon"><CheckCircle size={24} color="var(--success-600)" /></div>
                <div className="empty-state-title">No active incidents</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



