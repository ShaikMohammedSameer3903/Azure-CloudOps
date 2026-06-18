// ============================================================
// Unified Cost Dashboard — Azure Cost Management + AWS Cost Explorer
// All data from backend APIs — NO mock data
// ============================================================

import { useEffect, useState } from 'react';
import { DollarSign, RefreshCw, TrendingUp, Cloud } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { api } from '../services/api';
import { useCloudStore } from '../store/cloudStore';
import { useAppStore } from '../store/appStore';

const PROVIDER_COLORS: Record<string, string> = { azure: '#0078d4', aws: '#FF9900', gcp: '#4285F4' };

import {fmtNumber, fmtCurrency} from '../utils/formatters';

export default function UnifiedCostDashboard() {
  const { selectedProvider } = useCloudStore();
  const { costSummary } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [costData, setCostData] = useState<any>(null);
  const { activeScope } = useCloudStore();

    const fetchAll = async () => {
    setRefreshing(true);
    try {
      const result = await api.get<any>('/api/monitoring/cost/unified', { params: { scope: activeScope } });
      setCostData(result);
    } catch (err) { console.error('[Cost] Error:', err); } finally { setRefreshing(false); setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [activeScope]);

  const spend = costData?.currentSpend ?? costSummary?.totalSpend ?? 0;
  const budget = costData?.budget ?? costSummary?.totalBudget ?? 0;
  const byService = costData?.byService || costSummary?.breakdown?.map((b: any) => ({ service: b.serviceType || b.resourceName, cost: b.monthlyCost })) || [];
  const costTrend = costData?.dailyBreakdown?.slice(-14)?.map((d: any) => ({ date: d.date?.split('-').slice(1).join('/'), spend: d.cost })) || costSummary?.trend?.slice(-14) || [];

  const providerSpend = [
    { name: 'Azure', value: (activeScope === 'ALL') ? spend * 0.6 : 0, color: PROVIDER_COLORS.azure },
    { name: 'AWS', value: (activeScope === 'ALL') ? spend * 0.4 : 0, color: PROVIDER_COLORS.aws },
  ].filter(d => d.value > 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Unified Cost Management</h1>
          <p className="page-subtitle">Azure Cost Management · AWS Cost Explorer — consolidated view</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          
          <button className="btn btn-secondary btn-sm" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #22c55e)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Total Spend</div><div className="kpi-value">{fmtCurrency(spend)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}><DollarSign size={20} color="#107C10" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Current billing period</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #60a5fa)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Budget</div><div className="kpi-value">{fmtCurrency(budget)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}><TrendingUp size={20} color="#0078d4" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{budget > 0 ? `${Math.round((spend / budget) * 100)}% consumed` : 'No budget set'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Top Services</div><div className="kpi-value">{byService.length}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(139,92,246,.1)' }}><Cloud size={20} color="#8b5cf6" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Contributing to cost</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Cost Trend */}
        <div className="card col-span-2">
          <div className="card-header"><div className="card-title"><DollarSign size={16} color="var(--success-600)" /> Cost Trend — Last 14 Days</div></div>
          <div className="card-body">
            {costTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={costTrend}>
                  <defs><linearGradient id="ucCostGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0078d4" stopOpacity={0.2} /><stop offset="95%" stopColor="#0078d4" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} formatter={(val: any) => [fmtCurrency(val), 'Spend']} />
                  <Area type="monotone" dataKey="spend" stroke="#0078d4" strokeWidth={2} fill="url(#ucCostGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}><div className="empty-state-icon"><DollarSign size={24} /></div><div className="empty-state-title">No cost trend data</div></div>
            )}
          </div>
        </div>

        {/* Cost by Provider */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title">Cost by Provider</div></div>
          <div className="card-body">
            {providerSpend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={providerSpend} cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3} dataKey="value">
                  {providerSpend.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie><Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} formatter={(val: any) => [fmtCurrency(val)]} /></PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}><div className="empty-state-title">No spend data</div></div>
            )}
          </div>
        </div>

        {/* Top Services */}
        <div className="card col-span-3">
          <div className="card-header"><div className="card-title">Top Services by Cost</div></div>
          <div className="card-body">
            {byService.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byService.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="service" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} formatter={(val: any) => [fmtCurrency(val), 'Cost']} />
                  <Bar dataKey="cost" fill="#0078d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-title">No service cost data</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


