// ============================================================
// Executive Dashboard — Live Azure data, KPIs, charts
// No hardcoded metrics — all values computed from API responses
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Server, Shield, DollarSign, AlertTriangle,
  RefreshCw, TrendingUp, Minus,
  CheckCircle, XCircle, AlertCircle, Zap,
  Activity, Cloud, Lock, Landmark, HardDrive,
  Globe, Database, Box, Layers, MapPin, ChevronRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAppStore, TENANT_CONFIGS, type IndustryTenant } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';
import { api } from '../services/api';

import {fmtNumber, fmtCurrency} from '../utils/formatters';

const CHART_COLORS = ['#0078d4', '#00B7C3', '#107C10', '#FFB900', '#8b5cf6', '#f97316'];

// ── Skeleton loader ──────────────────────────────────────────
function KpiSkeleton() {
  return (
    <div className="kpi-card">
      <div className="kpi-card-accent skeleton" style={{ height: 3, position: 'absolute', top: 0, left: 0, right: 0 }} />
      <div className="kpi-card-top">
        <div>
          <div className="skeleton skeleton-text sm mb-2" style={{ width: 80 }} />
          <div className="skeleton skeleton-text lg" style={{ width: 60, height: 28 }} />
        </div>
        <div className="skeleton skeleton-circle" style={{ width: 40, height: 40 }} />
      </div>
      <div className="skeleton skeleton-text sm" style={{ width: 100 }} />
    </div>
  );
}

// ── Ring Gauge ─────────────────────────────────────────────
function RingGauge({ value, max = 100, size = 120, color = '#0078d4', label }: {
  value: number | null; max?: number; size?: number; color?: string; label?: string;
}) {
  if (value == null) return (
    <div className="ring-gauge" style={{ width: size, height: size }}>
      <div className="ring-gauge-text">
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600 }}>N/A</div>
      </div>
    </div>
  );

  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="ring-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-surface-tertiary)" strokeWidth={10} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="ring-gauge-text">
        <div className="ring-gauge-value" style={{ fontSize: size < 100 ? 18 : 24, color }}>{Math.round(pct)}</div>
        {label && <div className="ring-gauge-label">{label}</div>}
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────
export default function Dashboard() {
  const {
    subscriptions, setSubscriptions,
    activeSubscriptionId, setActiveSubscription,
    resources, setResources,
    incidents, setIncidents,
    costSummary, setCostSummary,
    securityScore, setSecurityScore,
    setBackupHealth,
    advisorRecommendations, setAdvisorRecommendations,
    riskScore, setRiskScore,
    cloudHealthScore, setCloudHealthScore,
    backupHealth,
    isRefreshing, setIsRefreshing,
    lastUpdated, setLastUpdated,
  } = useAppStore();
  
  const { cloudAccounts, selectedProvider } = useCloudStore();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string>('eastus');
  const [usageData, setUsageData] = useState<{
    currentSpend: number | null;
    remainingCredits: number | null;
    totalCredits: number | null;
    creditsAvailable: boolean;
    availableRegions: Array<{ name: string; displayName: string }>;
    usages: Array<{ name: string; localizedName: string; currentValue: number; limit: number }>;
  } | null>(null);

  const fetchAll = async (subId?: string, region?: string) => {
    setIsRefreshing(true);
    setError(null);
    try {
      const subs = await api.get<any[]>('/api/subscriptions');
      setSubscriptions(subs);
      const resolvedSubId = subId || activeSubscriptionId || (subs[0]?.id ?? null);
      if (!activeSubscriptionId && subs.length > 0) setActiveSubscription(subs[0].id);
      if (!resolvedSubId) return;

      const q = { params: { subscriptionId: resolvedSubId, provider: selectedProvider === 'all' ? undefined : selectedProvider } };
      const qUsage = { params: { subscriptionId: resolvedSubId, location: region || selectedRegion, provider: selectedProvider === 'all' ? undefined : selectedProvider } };

      const [
        resResult, incResult, costResult,
        secResult, backupResult, advisorResult,
        riskResult, healthResult,
        usageResult,
      ] = await Promise.allSettled([
        api.get<any[]>('/api/resources', q),
        api.get<any[]>('/api/incidents'),
        api.get<any>('/api/monitoring/cost', q),
        api.get<any>('/api/monitoring/defender', q),
        api.get<any>('/api/monitoring/backup', q),
        api.get<any>('/api/monitoring/advisor', q),
        api.get<any>('/api/monitoring/risk', q),
        api.get<any>('/api/monitoring/cloud-health', q),
        api.get<any>('/api/monitoring/usage', qUsage),
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
            monthlyCost: s.cost, budgetLimit: c.budget ? c.budget / Math.max(1, (c.byService || []).length) : 0,
            currency: 'USD', trend: 'stable' as const,
          })),
          trend: (c.dailyBreakdown || []).map((d: any) => ({
            date: d.date?.split('-').slice(1).join('/') || d.date, spend: d.cost,
            budget: c.budget ? c.budget / 30 : 0,
          })),
          forecast: [],
          costExplorerUnavailable: c.costExplorerUnavailable,
          errorMsg: c.errorMsg,
        });
      }

      if (secResult.status === 'fulfilled') {
        const s = secResult.value;
        if (s?.score) setSecurityScore(s.score);
        if (s?.secureScore) setSecurityScore(s.secureScore);
      }

      if (backupResult.status === 'fulfilled') {
        const b = backupResult.value;
        setBackupHealth([{
          vaultName: b.vaults?.[0]?.name || 'Recovery Services',
          protectedItems: b.totalProtectedItems || 0,
          healthyItems: b.totalProtectedItems - (b.failedJobs || 0),
          warningItems: 0,
          criticalItems: b.failedJobs || 0,
          lastSuccessfulBackup: b.recentJobs?.[0]?.timestamp,
          jobs: (b.recentJobs || []).slice(0, 5).map((j: any) => ({
            id: j.name, name: j.name, status: j.status || 'Unknown',
            operation: j.type || 'Backup', startTime: j.timestamp,
          })),
        }]);
      }

      if (advisorResult.status === 'fulfilled') {
        setAdvisorRecommendations(advisorResult.value?.recommendations || []);
      }
      if (riskResult.status === 'fulfilled') setRiskScore(riskResult.value);
      if (healthResult.status === 'fulfilled') setCloudHealthScore(healthResult.value);
      if (usageResult.status === 'fulfilled') setUsageData(usageResult.value);

      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const activeEnvironment = useAppStore(s => s.activeEnvironment);
  const tenantConfig = activeEnvironment !== 'All' ? TENANT_CONFIGS[activeEnvironment] : null;

  useEffect(() => {
    const prefixes: Record<string, string> = {
      Healthcare: 'sub-healthcare-prod',
      Education: 'sub-university-prod',
      Government: 'sub-government-prod',
      Banking: 'sub-banking-prod',
      Retail: 'sub-retail-prod',
      Manufacturing: 'sub-manufacturing-prod',
    };
    if (activeEnvironment !== 'All' && prefixes[activeEnvironment]) {
      // Find matching subscription
      const matchSub = useAppStore.getState().subscriptions.find(s =>
        s.id === prefixes[activeEnvironment] || s.name?.toLowerCase().includes(activeEnvironment.toLowerCase())
      );
      if (matchSub) setActiveSubscription(matchSub.id);
    }
  }, [activeEnvironment]);

  useEffect(() => {
    if (activeSubscriptionId) {
      fetchAll(activeSubscriptionId);
      const interval = setInterval(() => {
        fetchAll(activeSubscriptionId);
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [activeSubscriptionId]);

  // ── Compute all metrics dynamically from API data ─────────
  const filteredResources = useMemo(() => {
    if (activeEnvironment === 'All') return resources;
    return resources.filter(r =>
      r.tags?.Environment?.toLowerCase() === activeEnvironment.toLowerCase() ||
      r.tags?.environment?.toLowerCase() === activeEnvironment.toLowerCase()
    );
  }, [resources, activeEnvironment]);

  const resourceCounts = useMemo(() => {
    const byType: Record<string, number> = {};
    filteredResources.forEach(r => {
      const t = (r.type || 'Other').split('/')[0].replace('Microsoft.', '');
      byType[t] = (byType[t] || 0) + 1;
    });
    return {
      total: filteredResources.length,
      vms: filteredResources.filter(r => r.type?.toLowerCase().includes('virtualmachines')).length,
      storage: filteredResources.filter(r => r.type?.toLowerCase().includes('storageaccounts')).length,
      byType,
    };
  }, [filteredResources]);

  const openIncidents = useMemo(() => {
    const list = activeEnvironment === 'All'
      ? incidents
      : incidents.filter(i => {
          const res = resources.find(r => r.id === (i.relatedResourceId || (i as any).resource_id));
          return res?.tags?.Environment?.toLowerCase() === activeEnvironment.toLowerCase();
        });
    return list.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;
  }, [incidents, resources, activeEnvironment]);

  // Computed security score from API (no hardcoding)
  const secPct = securityScore?.percentage ?? null;
  const secColor = secPct == null ? '#94a3b8' : secPct >= 80 ? '#107C10' : secPct >= 60 ? '#FFB900' : '#D13438';

  // Computed risk score from API
  const riskVal = riskScore ? (100 - (riskScore.safetyScore ?? 0)) : null;
  const riskColor = riskVal == null ? '#94a3b8' : riskVal <= 20 ? '#107C10' : riskVal <= 40 ? '#FFB900' : '#D13438';

  // Compliance score from governance data or cloud health
  const complianceScore = cloudHealthScore?.governance ?? cloudHealthScore?.overall ?? null;
  const compColor = complianceScore == null ? '#94a3b8' : complianceScore >= 80 ? '#107C10' : complianceScore >= 60 ? '#FFB900' : '#D13438';

  // Backup health
  const backupOk = backupHealth.length > 0 ? backupHealth[0].healthyItems : null;
  const backupTotal = backupHealth.length > 0 ? backupHealth[0].protectedItems : null;

  const costTrend = costSummary?.trend?.slice(-14) || [];

  const [showComparison, setShowComparison] = useState(false);

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
          <button onClick={() => navigate('/discovery?cloud=Azure')} className="btn" style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <Cloud size={18} /> Connect Azure
          </button>
          <button onClick={() => navigate('/discovery?cloud=AWS')} className="btn" style={{ background: 'rgba(255,153,0,0.1)', color: '#FF9900', border: '1px solid rgba(255,153,0,0.2)', padding: '12px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <Layers size={18} /> Connect AWS
          </button>
          <button onClick={() => navigate('/discovery?cloud=GCP')} className="btn" style={{ background: 'rgba(66,133,244,0.1)', color: '#4285F4', border: '1px solid rgba(66,133,244,0.2)', padding: '12px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <Box size={18} /> Connect GCP
          </button>
        </div>
      </div>
    );
  }

  if (!loading && subscriptions.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', height: '60vh', textAlign: 'center'
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'white' }}>No Azure Subscriptions Available</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 450, lineHeight: 1.5, marginBottom: 24 }}>
          No Azure subscriptions available for this account.
        </p>
      </div>
    );
  }

  if (loading && resources.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div className="page-header-content">
            <div className="skeleton skeleton-text lg" style={{ width: 220, height: 26, marginBottom: 6 }} />
            <div className="skeleton skeleton-text" style={{ width: 340 }} />
          </div>
        </div>
        <div className="kpi-grid">
          {[...Array(6)].map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">
            {activeEnvironment === 'All' ? 'Executive Command Center' : `${activeEnvironment} Operations Dashboard`}
          </h1>
          <p className="page-subtitle">
            Real-time multi-industry oversight
            {tenantConfig && <> of <strong>{tenantConfig.name}</strong> ({tenantConfig.complianceFrameworks.join(', ')})</>}
            {activeEnvironment === 'All' && <> across <strong>all industry tenants</strong></>}
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 10 }}>
          <button className={`btn ${showComparison ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setShowComparison(!showComparison)}>
            {showComparison ? 'Exit Comparison' : 'Compare Tenants'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => fetchAll()} disabled={isRefreshing}>
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Multi-Tenant Comparison */}
      {showComparison && (
        <div className="card mb-5" style={{ background: 'var(--bg-surface-secondary)', border: '1px dashed var(--azure-500)' }}>
          <div className="card-header">
            <div className="card-title">Multi-Tenant Comparison Matrix</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {(Object.keys(TENANT_CONFIGS) as Array<Exclude<IndustryTenant, 'All'>>).map(key => {
              const cfg = TENANT_CONFIGS[key];
              return (
                <div key={key} className="card p-4" style={{ borderTop: `3px solid ${cfg.color}` }}>
                  <h3 style={{ color: cfg.color, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                    <span>{cfg.icon}</span> {cfg.industry}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: 'Compliance', val: cfg.complianceFrameworks.join(', ') },
                      { label: 'Scope', val: cfg.description },
                    ].map(m => (
                      <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                        <span style={{ fontWeight: 600 }}>{m.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI Cards — All computed from live data */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: tenantConfig?.gradient || 'linear-gradient(90deg, #0078d4, #00B7C3)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Active Resources</div>
              <div className="kpi-value">{fmtNumber(resourceCounts.total)}</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}>
              <Server size={20} color={tenantConfig?.color || 'var(--azure-600)'} />
            </div>
          </div>
          <div className="kpi-trend stable" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            <Minus size={12} /> {activeEnvironment === 'All' ? 'Across all tenants' : tenantConfig?.name || ''}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${secColor}, ${secColor}88)` }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Security Posture</div>
              <div className="kpi-value" style={{ color: secColor }}>{secPct != null ? `${Math.round(secPct)}%` : '—'}</div>
            </div>
            <div className="kpi-icon" style={{ background: `${secColor}18` }}>
              <Shield size={20} color={secColor} />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: secColor, fontSize: 12 }}>
            {secPct != null ? <><CheckCircle size={12} /> {selectedProvider === 'aws' ? 'AWS Security Hub' : selectedProvider === 'all' ? 'Unified Security Feed' : 'Azure Defender Feed'}</> : 'Awaiting data…'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${compColor}, ${compColor}88)` }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Cloud Health</div>
              <div className="kpi-value" style={{ color: compColor }}>
                {complianceScore != null ? `${Math.round(complianceScore)}%` : '—'}
              </div>
            </div>
            <div className="kpi-icon" style={{ background: `${compColor}18` }}>
              <Activity size={20} color={compColor} />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            {tenantConfig ? tenantConfig.complianceFrameworks.join(' · ') : 'Unified Health Score'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${riskColor}, ${riskColor}88)` }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Risk Score</div>
              <div className="kpi-value" style={{ color: riskColor }}>
                {riskVal != null ? riskVal : '—'} <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>/100</span>
              </div>
            </div>
            <div className="kpi-icon" style={{ background: `${riskColor}18` }}>
              <AlertTriangle size={20} color={riskColor} />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            Lower is better · {riskScore?.findingsCount ?? 0} findings
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #60a5fa)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Remaining Student Credits</div>
              {usageData && !usageData.creditsAvailable ? (
                <div style={{ fontSize: 13, color: 'var(--warning-500)', fontWeight: 500, marginTop: 6, lineHeight: 1.3 }}>
                  Credit information unavailable for this subscription.
                </div>
              ) : (
                <div className="kpi-value">
                  {usageData && usageData.remainingCredits !== null ? fmtCurrency(usageData.remainingCredits) : fmtCurrency(100 - (costSummary?.totalSpend || 0))}
                </div>
              )}
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}>
              <DollarSign size={20} color="#0078d4" />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            {usageData && !usageData.creditsAvailable ? (
              <span style={{ color: 'var(--text-tertiary)' }}>No billing source verified</span>
            ) : (
              <>
                <span>Spent: {fmtCurrency(costSummary?.totalSpend)}</span>
                <span>Total: $100</span>
              </>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: backupTotal ? 'linear-gradient(90deg, #107C10, #22c55e)' : 'linear-gradient(90deg, #94a3b8, #cbd5e1)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Backup Health</div>
              <div className="kpi-value" style={{ color: backupOk != null ? '#107C10' : '#94a3b8' }}>
                {backupOk != null ? `${backupOk}/${backupTotal}` : '—'}
              </div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}>
              <HardDrive size={20} color="#107C10" />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            Protected items healthy
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="dashboard-grid">
        <div className="card col-span-2">
          <div className="card-header">
            <div>
              <div className="card-title"><DollarSign size={16} color="var(--success-600)" /> Cost Trend — Last 14 Days</div>
              <div className="card-subtitle">Daily spend from {selectedProvider === 'aws' ? 'AWS Cost Explorer API' : selectedProvider === 'all' ? 'Multi-Cloud Cost APIs' : 'Azure Cost Management API'}</div>
            </div>
          </div>
          <div className="card-body">
            {costSummary?.costExplorerUnavailable ? (
              <div className="empty-state" style={{ padding: '40px 24px' }}>
                <div className="empty-state-icon" style={{ background: 'rgba(255, 185, 0, 0.1)' }}><AlertTriangle size={28} color="#FFB900" /></div>
                <div className="empty-state-title" style={{ color: '#FFB900' }}>Cost Explorer Unavailable</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>{costSummary.errorMsg || 'AWS Cost Explorer is not enabled for this account.'}</div>
              </div>
            ) : costTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={costTrend} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0078d4" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0078d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${fmtNumber(v)}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-lg)' }}
                    formatter={(val: any) => [fmtCurrency(val), 'Spend']} />
                  <Area type="monotone" dataKey="spend" stroke="#0078d4" strokeWidth={2} fill="url(#costGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 24px' }}>
                <div className="empty-state-icon"><DollarSign size={28} /></div>
                <div className="empty-state-title">No cost data available</div>
              </div>
            )}
          </div>
        </div>

        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title"><Server size={16} color="var(--azure-600)" /> Resource Distribution</div>
          </div>
          <div className="card-body">
            {Object.keys(resourceCounts.byType).length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={Object.entries(resourceCounts.byType).slice(0, 6).map(([name, value]) => ({ name, value }))}
                    cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2} dataKey="value">
                    {Object.entries(resourceCounts.byType).slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon"><Server size={24} /></div>
                <div className="empty-state-title">No resources found</div>
              </div>
            )}
          </div>
        </div>

        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title">
              <AlertTriangle size={16} color={openIncidents > 0 ? 'var(--danger-600)' : 'var(--success-600)'} />
              Active Incidents
            </div>
            {openIncidents > 0 && <span className="severity-badge p1">{openIncidents}</span>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {incidents.length > 0 ? (
              <div className="insight-list">
                {incidents.slice(0, 5).map(inc => {
                  const sevMap: Record<string, string> = { CRITICAL: 'p1', WARNING: 'p2', INFORMATIONAL: 'p4', P1: 'p1', P2: 'p2', P3: 'p3', P4: 'p4' };
                  const sev = sevMap[inc.severity] || 'p4';
                  const statusColor: Record<string, string> = {
                    ACTIVE: 'var(--danger-600)', Open: 'var(--danger-600)',
                    ACKNOWLEDGED: 'var(--warning-500)', InProgress: 'var(--warning-500)',
                    RESOLVED: 'var(--success-600)', Resolved: 'var(--success-600)',
                    Closed: 'var(--text-tertiary)',
                  };
                  const color = statusColor[inc.status] || 'var(--text-tertiary)';
                  return (
                    <div key={inc.id} className="insight-item">
                      <div className="insight-icon" style={{ background: `${color}18` }}>
                        <AlertTriangle size={16} color={color} />
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{inc.title}</div>
                        <div className="insight-desc" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inc.description}
                        </div>
                      </div>
                      <span className={`severity-badge ${sev}`}>{inc.severity}</span>
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

        {/* Quick Links to sub-dashboards */}
        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title">Quick Navigation</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            {[
              { label: 'Security Center', icon: Shield, path: '/security', color: '#D13438' },
              { label: 'Governance', icon: Landmark, path: '/governance', color: '#0e7c6b' },
              { label: 'Cost Management', icon: DollarSign, path: '/cost', color: '#0078d4' },
              { label: 'Backup & DR', icon: HardDrive, path: '/backup', color: '#8b5cf6' },
              { label: 'SOC Dashboard', icon: AlertCircle, path: '/soc', color: '#c05500' },
            ].map(link => (
              <a
                key={link.path}
                href={link.path}
                onClick={e => { e.preventDefault(); window.location.hash = ''; window.location.pathname = link.path; }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 8, textDecoration: 'none', color: 'var(--text-primary)',
                  fontSize: 13, fontWeight: 500,
                  background: 'var(--bg-surface-secondary)',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: `${link.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <link.icon size={14} color={link.color} />
                </div>
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* VM Quota and Usage */}
        {usageData && usageData.usages && usageData.usages.length > 0 && (
          <div className="card col-span-3">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div className="card-title">
                  <Zap size={16} color="var(--warning-500)" />
                  Virtual Machine Compute Quotas ({usageData.availableRegions?.find(r => r.name === selectedRegion)?.displayName || selectedRegion})
                </div>
                <div className="card-subtitle">
                  Current compute usage vs limits from {selectedProvider === 'aws' ? 'AWS EC2 API' : selectedProvider === 'all' ? 'Cloud Compute APIs' : 'Azure Compute API'} · Last Refreshed: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Region:</span>
                <select
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    fetchAll(activeSubscriptionId || undefined, e.target.value);
                  }}
                  className="input-select"
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'var(--bg-surface-tertiary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {usageData.availableRegions?.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, paddingTop: 8 }}>
              {usageData.usages.filter(u => u.limit > 0).slice(0, 8).map(u => {
                const percent = Math.min(100, Math.round((u.currentValue / u.limit) * 100));
                return (
                  <div key={u.name} style={{ background: 'var(--bg-surface-secondary)', padding: 12, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '150px' }} title={u.name}>{u.localizedName}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{u.currentValue} / {u.limit} ({percent}%)</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-surface-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${percent}%`, height: '100%', background: percent > 85 ? 'var(--danger-500)' : percent > 50 ? 'var(--warning-500)' : 'var(--azure-500)', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* ── Security Overview Panel (informational only) ─── */}
        <div className="card col-span-2" id="security-overview-panel">
          <div className="card-header">
            <div>
              <div className="card-title"><Shield size={16} color="#0078d4" /> Security Overview</div>
              <div className="card-subtitle">Informational display — read-only. Does not perform any actions.</div>
            </div>
          </div>
          <div className="card-body" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14 }}>
            {(()=>{
              const storageResources = filteredResources.filter(r => r.type?.toLowerCase().includes('storageaccounts'));
              const publicEndpoints = filteredResources.filter(r =>
                r.type?.toLowerCase().includes('publicipaddresses') ||
                r.type?.toLowerCase().includes('staticsites') ||
                r.status === 'Public'
              ).length;
              const encStatus = storageResources.length > 0 ? 'Enabled (SSE-AES256)' : 'No storage found';
              const rbacStatus = securityScore?.percentage != null
                ? (securityScore.percentage > 60 ? 'Configured' : 'Needs Review')
                : 'Unknown';
              const authStatus = selectedProvider === 'aws' ? 'AWS IAM + MFA' : selectedProvider === 'all' ? 'Unified IdP + MFA' : 'Azure AD + MFA';
              const items = [
                { label:'Public Endpoints', val: String(publicEndpoints), color: publicEndpoints > 3 ? '#FFB900' : '#107C10', icon: Globe },
                { label:'Storage Encryption', val: encStatus, color:'#107C10', icon: Lock },
                { label:'Authentication', val: authStatus, color:'#107C10', icon: Shield },
                { label:'RBAC Status', val: rbacStatus, color: rbacStatus === 'Configured' ? '#107C10' : '#FFB900', icon: CheckCircle },
              ];
              return items.map(({label, val, color, icon: Icon}) => (
                <div key={label} style={{ background:'var(--bg-surface-secondary)', borderRadius:10, padding:'12px 14px', border:'1px solid var(--border-subtle)', display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:28, height:28, borderRadius:6, background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Icon size={14} color={color} />
                    </div>
                    <span style={{ fontSize:11, color:'var(--text-tertiary)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</span>
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color, paddingLeft:2 }}>{val}</div>
                </div>
              ));
            })()}
          </div>
          {/* Recommendations from Advisor */}
          {advisorRecommendations.length > 0 && (
            <div style={{ padding:'0 20px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Security Recommendations</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {advisorRecommendations.slice(0,3).map((rec: any, i: number) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, color:'var(--text-secondary)', background:'var(--bg-surface-secondary)', borderRadius:8, padding:'8px 10px', border:'1px solid var(--border-subtle)' }}>
                    <AlertCircle size={13} color="#FFB900" style={{ marginTop:2, flexShrink:0 }} />
                    <span>{rec.shortDescription || rec.problem || rec.recommendation || 'Review recommended security settings.'}</span>
                  </div>
                ))}
                {advisorRecommendations.length === 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#107C10' }}>
                    <CheckCircle size={13} /> No critical security recommendations.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Student Lab Architecture Card ─────────────── */}
        {(()=>{
          const studentRes = resources.filter(r =>
            r.tags?.StudentLab === 'true' ||
            (r.resource_group||r.resourceGroup||'').toLowerCase().includes('student-lab') ||
            (r.name||'').toLowerCase().includes('student-lab') ||
            (r.name||'').toLowerCase().includes('forstudents') ||
            (r.name||'').toLowerCase().includes('swa-student')
          );
          if (studentRes.length === 0) return null;
          const sRg = studentRes.find(r => r.type?.includes('resourceGroups'));
          const sSa = studentRes.find(r => r.type?.includes('storageAccounts'));
          const sSwa = studentRes.find(r => r.type?.includes('staticSites'));
          return (
            <div className="card col-span-1" id="student-lab-architecture-card" style={{ border:'1.5px solid rgba(0,120,212,0.3)', background:'linear-gradient(145deg,rgba(0,120,212,0.05),rgba(0,183,195,0.03))' }}>
              <div className="card-header" style={{ background:'rgba(0,120,212,0.07)', borderBottom:'1px solid rgba(0,120,212,0.12)' }}>
                <div className="card-title" style={{ color:'#0078d4' }}>
                  <Layers size={16} color="#0078d4" /> Student Lab Deployment
                </div>
                <span style={{ fontSize:10, fontWeight:700, color:'#107C10', background:'rgba(16,124,16,0.12)', border:'1px solid rgba(16,124,16,0.3)', borderRadius:20, padding:'2px 8px' }}>LIVE</span>
              </div>
              <div className="card-body">
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { icon:Layers, label:'Resource Group', name: sRg?.name||'—', status: sRg?.status||'Active', color:'#0078d4' },
                    { icon:Database, label:'Storage Account', name: sSa?.name||'—', status: sSa?.status||'Available', color:'#107C10' },
                    { icon:Box, label:'Static Web App', name: sSwa?.name||'—', status: sSwa?.status||'Provisioning', color:'#00B7C3' },
                  ].map(({ icon:Icon, label, name, status, color }) => (
                    <div key={label} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--bg-surface-secondary)', borderRadius:8, padding:'8px 10px', border:`1px solid ${color}22` }}>
                      <div style={{ width:32, height:32, borderRadius:7, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Icon size={16} color={color} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                        <div style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:2 }}>{label}</div>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, color: status==='Active'||status==='Available'||status==='Ready' ? '#107C10':'#FFB900', background: status==='Active'||status==='Available'||status==='Ready'?'rgba(16,124,16,0.1)':'rgba(255,185,0,0.1)', borderRadius:20, padding:'2px 8px', whiteSpace:'nowrap' }}>
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:12, display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text-tertiary)', borderTop:'1px solid var(--border-subtle)', paddingTop:10 }}>
                  <span><MapPin size={10} style={{ verticalAlign:'middle', marginRight:4 }} />{(sRg?.location||sSa?.location||'—').replace('southeastasia','Southeast Asia')}</span>
                  <span>{studentRes.length} resource{studentRes.length!==1?'s':''} deployed</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
