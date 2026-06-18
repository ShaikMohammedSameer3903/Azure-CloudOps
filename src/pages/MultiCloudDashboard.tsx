// ============================================================
// Multi-Cloud Dashboard — Aggregated view across all providers
// All data from backend APIs — NO mock data
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Server, Shield, DollarSign, AlertTriangle,
  RefreshCw, Activity, Cloud, Layers, Globe,
  CheckCircle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { useCloudStore } from '../store/cloudStore';
import { useAppStore } from '../store/appStore';
import { api } from '../services/api';

const PROVIDER_COLORS: Record<string, string> = { azure: '#0078d4', aws: '#FF9900', gcp: '#4285F4' };
const CHART_COLORS = ['#0078d4', '#FF9900', '#4285F4', '#107C10', '#8b5cf6', '#D13438'];

import {fmtNumber, fmtCurrency} from '../utils/formatters';

export default function MultiCloudDashboard() {
  const { activeScope } = useCloudStore();
  const { resources, incidents, costSummary } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allResources, setAllResources] = useState<any[]>([]);
  const [allIncidents, setAllIncidents] = useState<any[]>([]);
  const [costData, setCostData] = useState<any>(null);
  const [secData, setSecData] = useState<any>(null);

  const fetchAll = async () => {
    setRefreshing(true);
    try {
      const [resResult, incResult, costResult, secResult] = await Promise.allSettled([
        api.get<any[]>('/api/resources', { params: { scope: activeScope } }),
        api.get<any[]>('/api/incidents'),
        api.get<any>('/api/monitoring/cost/unified', { params: { scope: activeScope } }),
        api.get<any>('/api/monitoring/security/unified', { params: { scope: activeScope } }),
      ]);

      if (resResult.status === 'fulfilled') setAllResources(resResult.value);
      else setAllResources(resources); // fallback to appStore
      if (incResult.status === 'fulfilled') setAllIncidents(incResult.value || []);
      else setAllIncidents(incidents);
      if (costResult.status === 'fulfilled') setCostData(costResult.value);
      if (secResult.status === 'fulfilled') setSecData({ score: { percentage: secResult.value.overallScore } });
    } catch (err) {
      console.error('[MultiCloud] Fetch error:', err);
      setAllResources(resources);
      setAllIncidents(incidents);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [activeScope]);

  // Derived data
  const { cloudAccounts } = useCloudStore();
  const isZeroState = cloudAccounts.length === 0;

  const azureRes = isZeroState ? [] : allResources.filter(r => (r.provider || 'azure').toLowerCase() === 'azure');
  const awsRes = isZeroState ? [] : allResources.filter(r => r.provider === 'aws');
  const gcpRes = isZeroState ? [] : allResources.filter(r => r.provider === 'gcp');
  
  const effectiveResources = isZeroState ? [] : allResources;
  const effectiveIncidents = isZeroState ? [] : allIncidents;

  const resourceByType = useMemo(() => {
    const byType: Record<string, number> = {};
    effectiveResources.forEach(r => {
      const t = (r.type || 'Other').split('/').pop()?.replace('Microsoft.', '') || 'Other';
      byType[t] = (byType[t] || 0) + 1;
    });
    return Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [allResources]);

  const providerDist = [
    { name: 'Azure', value: azureRes.length, color: PROVIDER_COLORS.azure },
    { name: 'AWS', value: awsRes.length, color: PROVIDER_COLORS.aws },
  ].filter(d => d.value > 0);

  const sevBreakdown = useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, WARNING: 0, INFORMATIONAL: 0 };
    effectiveIncidents.forEach(i => {
      const sev = i.severity?.toUpperCase() || 'INFORMATIONAL';
      if (sev.includes('CRITICAL') || sev === 'SEV0') counts.CRITICAL++;
      else if (sev.includes('WARNING') || sev === 'SEV1' || sev === 'SEV2') counts.WARNING++;
      else counts.INFORMATIONAL++;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [allIncidents]);

  const costTrend = costData?.details?.[0]?.breakdown?.slice(-14)?.map((d: any) => ({ date: d.service, spend: d.cost })) || costSummary?.trend?.slice(-14) || [];

  if (loading && effectiveResources.length === 0) {
    return (
      <div>
        <div className="page-header"><div className="page-header-content">
          <div className="skeleton skeleton-text lg" style={{ width: 280, height: 26 }} />
        </div></div>
        <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 80, borderRadius: 10 }} /></div>)}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Multi-Cloud Operations</h1>
          <p className="page-subtitle">Aggregated resource and security intelligence across Azure & AWS</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #FF9900)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Total Resources</div><div className="kpi-value">{fmtNumber(effectiveResources.length)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}><Server size={20} color="#0078d4" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Azure: {azureRes.length} · AWS: {awsRes.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #D13438, #FFB900)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Active Incidents</div><div className="kpi-value">{effectiveIncidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(209,52,56,.1)' }}><AlertTriangle size={20} color="#D13438" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{sevBreakdown.find(s => s.name === 'CRITICAL')?.value || 0} critical</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #22c55e)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Security Score</div><div className="kpi-value">{(!isZeroState && secData?.score?.percentage) != null ? `${Math.round(secData.score.percentage)}%` : secData?.secureScore?.percentage != null ? `${Math.round(secData.secureScore.percentage)}%` : '—'}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}><Shield size={20} color="#107C10" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Cross-cloud security posture</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Cloud Spend</div><div className="kpi-value">{fmtCurrency((isZeroState ? 0 : (costData?.currentSpend || costSummary?.totalSpend)))}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(139,92,246,.1)' }}><DollarSign size={20} color="#8b5cf6" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Current month</div>
        </div>
      </div>

      {/* Charts */}
      <div className="dashboard-grid">
        {/* Resource Distribution */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title"><Layers size={16} color="#0078d4" /> By Provider</div></div>
          <div className="card-body">
            {providerDist.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={providerDist} cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3} dataKey="value">
                    {providerDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><Cloud size={24} /></div><div className="empty-state-title">No resources</div></div>
            )}
          </div>
        </div>

        {/* Resource by Type */}
        <div className="card col-span-2">
          <div className="card-header"><div className="card-title"><Server size={16} color="#00B7C3" /> Resource Types</div></div>
          <div className="card-body">
            {resourceByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={resourceByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#0078d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-title">No resource data</div></div>
            )}
          </div>
        </div>

        {/* Cost Trend */}
        <div className="card col-span-2">
          <div className="card-header"><div className="card-title"><DollarSign size={16} color="var(--success-600)" /> Cost Trend</div></div>
          <div className="card-body">
            {costTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={costTrend}>
                  <defs><linearGradient id="mcCostGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0078d4" stopOpacity={0.2} /><stop offset="95%" stopColor="#0078d4" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} formatter={(val: any) => [fmtCurrency(val), 'Spend']} />
                  <Area type="monotone" dataKey="spend" stroke="#0078d4" strokeWidth={2} fill="url(#mcCostGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><DollarSign size={24} /></div><div className="empty-state-title">No cost data available</div></div>
            )}
          </div>
        </div>

        {/* Incident Severity */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title"><AlertTriangle size={16} color="#D13438" /> Severity Breakdown</div></div>
          <div className="card-body">
            {effectiveIncidents.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sevBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {sevBreakdown.map((_, i) => <Cell key={i} fill={['#D13438', '#FFB900', '#0078d4'][i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><CheckCircle size={24} color="var(--success-600)" /></div><div className="empty-state-title">No incidents</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


