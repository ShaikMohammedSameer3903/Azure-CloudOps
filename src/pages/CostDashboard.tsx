// ============================================================
// Cost Management & Optimization Dashboard
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  RefreshCw, PieChart as PieChartIcon, BarChart3, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { useAppStore, TENANT_CONFIGS } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';
import { api } from '../services/api';

const CHART_COLORS = ['#0078d4', '#00B7C3', '#107C10', '#FFB900', '#8b5cf6', '#f97316', '#D13438', '#64748b'];

import {fmtNumber, fmtCurrency} from '../utils/formatters';

export default function CostDashboard() {
  const { activeSubscriptionId, costSummary, setCostSummary, activeEnvironment, advisorRecommendations } = useAppStore();
  const { selectedProvider, activeScope, cloudAccounts } = useCloudStore();
  const [loading, setLoading] = useState(true);
  const tenantConfig = activeEnvironment !== 'All' ? TENANT_CONFIGS[activeEnvironment] : null;

  const currentAccountId = useMemo(() => {
    if (selectedProvider === 'aws') {
      if (activeScope && activeScope !== 'ALL') {
        return activeScope;
      }
      const firstAws = cloudAccounts.find(a => a.provider === 'aws');
      return firstAws ? firstAws.id : '';
    }
    if (selectedProvider === 'azure') {
      if (activeScope && activeScope !== 'ALL') {
        return activeScope;
      }
      const firstAzure = cloudAccounts.find(a => a.provider === 'azure');
      return firstAzure ? firstAzure.id : activeSubscriptionId;
    }
    return activeSubscriptionId;
  }, [selectedProvider, activeScope, cloudAccounts, activeSubscriptionId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (currentAccountId) {
        const data = await api.get<any>('/api/monitoring/cost', { params: { subscriptionId: currentAccountId } });
        setCostSummary({
          totalSpend: data.currentSpend, totalBudget: data.budget,
          currency: data.currency || 'USD', period: 'Current Month',
          breakdown: (data.byService || []).map((s: any) => ({
            resourceName: s.service, resourceGroup: 'Shared', serviceType: s.service,
            monthlyCost: s.cost, budgetLimit: data.budget ? data.budget / Math.max(1, (data.byService || []).length) : 0,
            currency: 'USD', trend: 'stable' as const,
          })),
          trend: (data.dailyBreakdown || []).map((d: any) => ({
            date: d.date?.split('-').slice(1).join('/') || d.date, spend: d.cost,
            budget: data.budget ? data.budget / 30 : 0,
          })),
          forecast: [],
        });
      }
    } catch {
      // Fallback data already in store
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentAccountId]);

  const totalSpend = costSummary?.totalSpend ?? 0;
  const totalBudget = costSummary?.totalBudget ?? 0;
  const budgetUsage = totalBudget > 0 ? Math.round((totalSpend / totalBudget) * 100) : 0;
  const budgetColor = budgetUsage >= 90 ? '#D13438' : budgetUsage >= 75 ? '#FFB900' : '#107C10';
  const costTrend = costSummary?.trend?.slice(-14) || [];
  const topServices = costSummary?.breakdown?.slice(0, 8) || [];

  const costOptimizations = useMemo(() => {
    const costRecs = (advisorRecommendations || []).filter(r => r.category === 'Cost');
    return costRecs;
  }, [advisorRecommendations]);

  // Compute potential savings dynamically from real recommendations
  const totalPotentialSavings = useMemo(() => {
    let total = 0;
    costOptimizations.forEach((rec: any) => {
      const savingsStr = rec.savings || '';
      const num = parseFloat(savingsStr.replace(/[^0-9.]/g, ''));
      if (!isNaN(num)) total += num;
    });
    return total;
  }, [costOptimizations]);

  const serviceChartData = topServices.map((s, i) => ({
    name: s.serviceType?.replace('Microsoft.', '').split('/')[0] || `Service ${i + 1}`,
    cost: s.monthlyCost,
  }));

  const primaryColor = selectedProvider === 'aws' ? '#FF9900' : '#0078d4';
  const primaryGradient = selectedProvider === 'aws' ? 'linear-gradient(90deg, #FF9900, #ffb240)' : 'linear-gradient(90deg, #0078d4, #60a5fa)';
  const primaryIconBg = selectedProvider === 'aws' ? 'rgba(255,153,0,.1)' : 'rgba(0,120,212,.1)';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Cost Management & Optimization</h1>
          <p className="page-subtitle">
            {selectedProvider === 'aws' ? 'AWS Cost Explorer data' : 'Azure Cost Management data'}, budget tracking, and optimization recommendations
            {tenantConfig && <> for <strong>{tenantConfig.name}</strong></>}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: primaryGradient }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Current Spend</div>
              <div className="kpi-value">{fmtCurrency(totalSpend)}</div>
            </div>
            <div className="kpi-icon" style={{ background: primaryIconBg }}>
              <DollarSign size={20} color={primaryColor} />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            This billing period
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${budgetColor}, ${budgetColor}88)` }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Budget Usage</div>
              <div className="kpi-value" style={{ color: budgetColor }}>{budgetUsage}%</div>
            </div>
            <div className="kpi-icon" style={{ background: `${budgetColor}18` }}>
              <BarChart3 size={20} color={budgetColor} />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: budgetColor, fontSize: 12 }}>
            {budgetUsage >= 90 ? '⚠ Over budget threshold' : budgetUsage >= 75 ? '⚠ Approaching limit' : '✓ Within budget'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #22c55e)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Budget Remaining</div>
              <div className="kpi-value" style={{ color: '#107C10' }}>{fmtCurrency(Math.max(0, totalBudget - totalSpend))}</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}>
              <TrendingDown size={20} color="#107C10" />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            Of {fmtCurrency(totalBudget)} total budget
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FFB900, #fbbf24)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Potential Savings</div>
              <div className="kpi-value" style={{ color: '#b45309' }}>{totalPotentialSavings > 0 ? fmtCurrency(totalPotentialSavings) : '—'}</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(255,185,0,.1)' }}>
              <Zap size={20} color="#FFB900" />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: '#b45309', fontSize: 12 }}>
            <TrendingUp size={12} /> {costOptimizations.length} optimizations found
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Cost Trend Chart */}
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title"><DollarSign size={16} color="var(--success-600)" /> Daily Cost Trend</div>
            <div className="card-subtitle">{selectedProvider === 'aws' ? 'AWS Cost Explorer API' : 'Azure Cost Management API'} — last 14 days</div>
          </div>
          <div className="card-body">
            {costSummary?.costExplorerUnavailable ? (
              <div className="empty-state" style={{ padding: '40px 24px' }}>
                <div className="empty-state-icon" style={{ background: 'rgba(255, 185, 0, 0.1)' }}><AlertTriangle size={28} color="#FFB900" /></div>
                <div className="empty-state-title" style={{ color: '#FFB900' }}>Cost Explorer Unavailable</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>{costSummary.errorMsg || 'Cost Explorer is not enabled for this account.'}</div>
              </div>
            ) : costTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={costTrend} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primaryColor} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-lg)' }}
                    formatter={(val: any) => [fmtCurrency(val), 'Spend']} />
                  <Area type="monotone" dataKey="spend" stroke={primaryColor} strokeWidth={2} fill="url(#costGradient)" dot={false} />
                  {costTrend[0]?.budget && <Area type="monotone" dataKey="budget" stroke="#D13438" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} />}
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

        {/* Cost by Service */}
        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title"><PieChartIcon size={16} color={selectedProvider === 'aws' ? '#FF9900' : 'var(--azure-600)'} /> Cost by Service</div>
          </div>
          <div className="card-body">
            {costSummary?.costExplorerUnavailable ? (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon" style={{ background: 'rgba(255, 185, 0, 0.1)' }}><AlertTriangle size={24} color="#FFB900" /></div>
                <div className="empty-state-title" style={{ color: '#FFB900' }}>Data Unavailable</div>
              </div>
            ) : serviceChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={serviceChartData} cx="50%" cy="50%" outerRadius={70} innerRadius={38} paddingAngle={2} dataKey="cost">
                      {serviceChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }}
                      formatter={(val: any) => [fmtCurrency(val), 'Cost']} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                  {serviceChartData.slice(0, 4).map((s, i) => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: CHART_COLORS[i] }} />
                      {s.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state"><div className="empty-state-icon"><PieChartIcon size={24} /></div><div className="empty-state-title">No data</div></div>
            )}
          </div>
        </div>

        {/* Optimization Recommendations */}
        <div className="card col-span-3">
          <div className="card-header">
            <div className="card-title"><Zap size={16} color="#FFB900" /> Cost Optimization Recommendations</div>
            <div className="card-subtitle">{selectedProvider === 'aws' ? 'AWS Cost Explorer recommendations' : 'Azure Advisor cost recommendations'}</div>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <div className="insight-list">
              {costOptimizations.map((rec: any, i: number) => {
                const impactColor: Record<string, string> = { High: '#D13438', Medium: '#FFB900', Low: '#0078d4' };
                const color = impactColor[rec.impact] || '#0078d4';
                return (
                  <div key={rec.id || i} className="insight-item">
                    <div className="insight-icon" style={{ background: `${color}18` }}>
                      <DollarSign size={16} color={color} />
                    </div>
                    <div className="insight-content">
                      <div className="insight-title">{rec.title}</div>
                      <div className="insight-desc">{rec.description}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className={`severity-badge ${(rec.impact || 'low').toLowerCase()}`}>{rec.impact}</span>
                      {rec.savings && <span style={{ fontSize: 11, fontWeight: 700, color: '#107C10' }}>{rec.savings}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
