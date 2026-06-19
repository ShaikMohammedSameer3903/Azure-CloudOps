// ============================================================
// Azure Dashboard — Full Azure-only operations dashboard
// Data from Azure ARM API, Resource Graph, Monitor, Defender, Cost Management
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Server, Shield, DollarSign, AlertTriangle,
  RefreshCw, Cloud, Activity, HardDrive,
  Database, Globe, Layers, MapPin, Lock,
  CheckCircle, Minus,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';
import { api } from '../services/api';

const CHART_COLORS = ['#0078d4', '#00B7C3', '#107C10', '#FFB900', '#8b5cf6', '#f97316'];

import {fmtNumber, fmtCurrency} from '../utils/formatters';

export default function AzureDashboard() {
  const navigate = useNavigate();
  const {
    subscriptions, activeSubscriptionId, setActiveSubscription,
    resources, setResources, securityScore, setSecurityScore,
    costSummary, setCostSummary, incidents, setIncidents,
    backupHealth, setBackupHealth,
    setSubscriptions, isRefreshing, setIsRefreshing, setLastUpdated,
  } = useAppStore();
  const { cloudAccounts } = useCloudStore();
  const azureAccounts = cloudAccounts.filter(a => a.provider === 'azure');

  const [loading, setLoading] = useState(true);
  const [costError, setCostError] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const fetchAll = async (subId?: string) => {
    setIsRefreshing(true);
    try {
      const subs = await api.get<any[]>('/api/subscriptions');
      setSubscriptions(subs);
      const isValidActive = activeSubscriptionId && subs.some(s => s.id === activeSubscriptionId);
      const resolvedSubId = subId || (isValidActive ? activeSubscriptionId : (subs[0]?.id ?? null));
      if (!isValidActive && subs.length > 0) setActiveSubscription(subs[0].id);
      if (!resolvedSubId) return;

      const q = { params: { subscriptionId: resolvedSubId } };
      const [resResult, incResult, costResult, secResult, backupResult] = await Promise.allSettled([
        api.get<any[]>('/api/resources', q),
        api.get<any[]>('/api/incidents', { params: { provider: 'azure' } }),
        api.get<any>('/api/monitoring/cost', q),
        api.get<any>('/api/monitoring/defender', q),
        api.get<any>('/api/monitoring/backup', q),
      ]);

      if (resResult.status === 'fulfilled') setResources(resResult.value);
      if (incResult.status === 'fulfilled') setIncidents(incResult.value);
      if (costResult.status === 'fulfilled') {
        const c = costResult.value;
        setCostSummary({
          totalSpend: c.currentSpend, totalBudget: c.budget,
          currency: c.currency || 'USD', period: 'Current Month',
          breakdown: (c.byService || []).map((s: any) => ({
            resourceName: s.service, resourceGroup: 'Shared', serviceType: s.service,
            monthlyCost: s.cost, budgetLimit: 0, currency: 'USD', trend: 'stable' as const,
          })),
          trend: (c.dailyBreakdown || []).map((d: any) => ({
            date: d.date?.split('-').slice(1).join('/') || d.date, spend: d.cost, budget: 0,
          })),
          forecast: [],
        });
        setCostError(null);
      } else {
        const err = costResult.reason;
        setCostError(err.message || 'Billing Reader role required');
        setCostSummary(null);
      }
      if (secResult.status === 'fulfilled') {
        const s = secResult.value;
        if (s?.score) setSecurityScore(s.score);
        if (s?.secureScore) setSecurityScore(s.secureScore);
        setSecurityError(null);
      } else {
        const err = secResult.reason;
        setSecurityError(err.message || 'Security Reader role required');
        setSecurityScore(null);
      }
      if (backupResult.status === 'fulfilled') {
        const b = backupResult.value;
        setBackupHealth([{
          vaultName: b.vaults?.[0]?.name || 'Recovery Services',
          protectedItems: b.totalProtectedItems || 0,
          healthyItems: b.totalProtectedItems - (b.failedJobs || 0),
          warningItems: 0, criticalItems: b.failedJobs || 0,
          lastSuccessfulBackup: b.recentJobs?.[0]?.timestamp,
          jobs: [],
        }]);
      }
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error('[AzureDashboard] Fetch error:', err);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll(activeSubscriptionId || undefined);
    const interval = setInterval(() => fetchAll(activeSubscriptionId || undefined), 60000);
    return () => clearInterval(interval);
  }, [activeSubscriptionId]);

  // ── Computed metrics from live data ──
  const azureResources = resources.filter(r => (r.provider || 'azure').toLowerCase() === 'azure');
  const vmCount = azureResources.filter(r => r.type?.toLowerCase().includes('virtualmachines')).length;
  const aksCount = azureResources.filter(r => r.type?.toLowerCase().includes('managedclusters') || r.type?.toLowerCase().includes('containerservice')).length;
  const storageCount = azureResources.filter(r => r.type?.toLowerCase().includes('storageaccounts')).length;
  const networkCount = azureResources.filter(r => r.type?.toLowerCase().includes('virtualnetworks') || r.type?.toLowerCase().includes('publicipaddresses') || r.type?.toLowerCase().includes('networkinterfaces')).length;

  const resourceGroups = useMemo(() => {
    const groups = new Set<string>();
    azureResources.forEach(r => { if (r.resourceGroup) groups.add(r.resourceGroup); });
    return groups.size;
  }, [azureResources]);

  const byType: Record<string, number> = {};
  azureResources.forEach(r => {
    const t = (r.type || 'Other').split('/').pop()?.replace('Microsoft.', '') || 'Other';
    byType[t] = (byType[t] || 0) + 1;
  });
  const typeData = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

  const azureIncidents = incidents.filter(i => (i.provider || 'azure').toLowerCase() === 'azure');
  const openIncidents = azureIncidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;
  const secPct = securityScore?.percentage ?? null;
  const secColor = secPct == null ? '#94a3b8' : secPct >= 80 ? '#107C10' : secPct >= 60 ? '#FFB900' : '#D13438';
  const costTrend = costSummary?.trend?.slice(-14) || [];

  if (loading && azureResources.length === 0) {
    return (
      <div>
        <div className="page-header"><div className="page-header-content">
          <div className="skeleton skeleton-text lg" style={{ width: 260, height: 26, marginBottom: 6 }} />
          <div className="skeleton skeleton-text" style={{ width: 400 }} />
        </div></div>
        <div className="kpi-grid">{[...Array(6)].map((_, i) => <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 80, borderRadius: 10 }} /></div>)}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,120,212,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔷</span>
            Azure Operations Dashboard
          </h1>
          <p className="page-subtitle">
            {subscriptions.length} subscription(s) · {azureAccounts.length} account(s) · {azureResources.length} resources discovered
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => fetchAll()} disabled={isRefreshing}>
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => navigate('/azure/resources')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #00B7C3)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Total Resources</div><div className="kpi-value">{fmtNumber(azureResources.length)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}><Server size={20} color="#0078d4" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{resourceGroups} resource groups</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Virtual Machines</div><div className="kpi-value">{fmtNumber(vmCount)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(139,92,246,.1)' }}><Server size={20} color="#8b5cf6" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Azure Compute</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #00B7C3, #0078d4)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">AKS Clusters</div><div className="kpi-value">{fmtNumber(aksCount)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(0,183,195,.1)' }}><Layers size={20} color="#00B7C3" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Kubernetes Service</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #22c55e)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Storage Accounts</div><div className="kpi-value">{fmtNumber(storageCount)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}><HardDrive size={20} color="#107C10" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Blob / Files / Queue / Table</div>
        </div>

         <div className="kpi-card" onClick={() => navigate('/azure/security')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${secColor}, ${secColor}88)` }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Security Score</div>
              <div className="kpi-value" style={{ color: secColor, fontSize: securityError ? '11px' : undefined, whiteSpace: 'normal', lineHeight: '1.2' }}>
                {securityError ? securityError : (secPct != null ? `${Math.round(secPct)}%` : '—')}
              </div>
            </div>
            <div className="kpi-icon" style={{ background: `${secColor}18` }}><Shield size={20} color={secColor} /></div>
          </div>
          <div className="kpi-trend" style={{ color: securityError ? '#D13438' : secColor, fontSize: 12 }}>
            {securityError ? 'Discovery Failed' : (secPct != null ? 'Microsoft Defender' : 'Awaiting data…')}
          </div>
        </div>

        <div className="kpi-card" onClick={() => navigate('/azure/cost')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FFB900, #f97316)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Monthly Cost</div>
              <div className="kpi-value" style={{ fontSize: costError ? '11px' : undefined, whiteSpace: 'normal', lineHeight: '1.2' }}>
                {costError ? costError : (costSummary?.totalSpend != null ? fmtCurrency(costSummary.totalSpend) : '—')}
              </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(255,185,0,.1)' }}><DollarSign size={20} color="#FFB900" /></div>
          </div>
          <div className="kpi-trend" style={{ color: costError ? '#D13438' : 'var(--text-tertiary)', fontSize: 12 }}>
            {costError ? 'API Returned No Data' : 'Azure Cost Management API'}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="dashboard-grid">
        {/* Cost Trend */}
        <div className="card col-span-2">
          <div className="card-header">
            <div><div className="card-title"><DollarSign size={16} color="var(--success-600)" /> Cost Trend — Last 14 Days</div>
            <div className="card-subtitle">Daily spend from Azure Cost Management API</div></div>
          </div>
          <div className="card-body">
            {costTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={costTrend}>
                  <defs><linearGradient id="azCostGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0078d4" stopOpacity={0.2} /><stop offset="95%" stopColor="#0078d4" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${fmtNumber(v)}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} formatter={(val: any) => [fmtCurrency(val), 'Spend']} />
                  <Area type="monotone" dataKey="spend" stroke="#0078d4" strokeWidth={2} fill="url(#azCostGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 24px' }}><div className="empty-state-icon"><DollarSign size={28} /></div><div className="empty-state-title">No cost data available</div></div>
            )}
          </div>
        </div>

        {/* Resource Distribution */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title"><Server size={16} color="#0078d4" /> Resource Distribution</div></div>
          <div className="card-body">
            {typeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={typeData} cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2} dataKey="value">
                    {typeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><Server size={24} /></div><div className="empty-state-title">No resources</div></div>
            )}
          </div>
        </div>

        {/* Active Incidents */}
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title"><AlertTriangle size={16} color={openIncidents > 0 ? '#D13438' : '#107C10'} /> Azure Incidents</div>
            {openIncidents > 0 && <span className="severity-badge p1">{openIncidents}</span>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {incidents.length > 0 ? (
              <div className="insight-list">
                {azureIncidents.slice(0, 5).map(inc => (
                  <div key={inc.id} className="insight-item">
                    <div className="insight-icon" style={{ background: 'rgba(209,52,56,.1)' }}><AlertTriangle size={16} color="#D13438" /></div>
                    <div className="insight-content">
                      <div className="insight-title">{inc.title}</div>
                      <div className="insight-desc">{inc.description}</div>
                    </div>
                    <span className={`severity-badge ${inc.severity === 'CRITICAL' || inc.severity === 'P1' ? 'p1' : inc.severity === 'WARNING' || inc.severity === 'P2' ? 'p2' : 'p3'}`}>{inc.severity}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><CheckCircle size={24} color="#107C10" /></div><div className="empty-state-title">No active incidents</div></div>
            )}
          </div>
        </div>

        {/* Quick Navigation */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title">Azure Navigation</div></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            {[
              { label: 'Resources', icon: Server, path: '/azure/resources', color: '#0078d4' },
              { label: 'Monitoring', icon: Activity, path: '/azure/monitoring', color: '#00B7C3' },
              { label: 'Security Center', icon: Shield, path: '/azure/security', color: '#D13438' },
              { label: 'Cost Management', icon: DollarSign, path: '/azure/cost', color: '#107C10' },
              { label: 'Networking', icon: Globe, path: '/azure/resources', color: '#8b5cf6' },
            ].map(link => (
              <button key={link.path + link.label} onClick={() => navigate(link.path)} style={{
                all: 'unset', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontWeight: 500,
                background: 'var(--bg-surface-secondary)', cursor: 'pointer',
                transition: 'all 150ms ease', border: '1px solid transparent',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = link.color; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'transparent'; }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: `${link.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <link.icon size={14} color={link.color} />
                </div>
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
