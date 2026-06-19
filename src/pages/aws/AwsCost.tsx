// ============================================================
// AWS Cost Dashboard — Real AWS Cost Explorer Data
// Shows current/last month cost, forecast, breakdowns, budgets
// NEVER fabricates values — shows explicit errors when unavailable
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import {
  DollarSign, RefreshCw, TrendingUp, TrendingDown, BarChart3,
  AlertTriangle, CheckCircle, PieChart as PieIcon,
  Globe, MapPin, Calendar, Activity,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  Legend,
} from 'recharts';
import { useCloudStore } from '../../store/cloudStore';
import { api } from '../../services/api';
import LiveBadge, { deriveStatus } from '../../components/common/LiveBadge';
import { fmtNumber, fmtCurrency } from '../../utils/formatters';

const COLORS = ['#FF9900', '#FF6600', '#3b48cc', '#569a31', '#8c4fff', '#00B7C3', '#D13438', '#FFB900', '#107C10', '#f97316'];

export default function AwsCost() {
  const { cloudAccounts } = useCloudStore();
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws');

  const [loading, setLoading] = useState(true);
  const [costData, setCostData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const fetchCost = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<any>('/api/monitoring/cost/unified', { params: { provider: 'aws' } });
      setCostData(result);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.message || err?.message || 'Failed to fetch cost data');
      setErrorCode(body?.code || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCost(); }, [fetchCost]);

  const badgeStatus = deriveStatus(lastUpdated, loading, !!error, awsAccounts.length > 0);
  const detail = costData?.details?.[0];
  const breakdown = detail?.breakdown || [];
  const monthlyChange = (costData?.totalCost && detail?.cost) ? ((costData.totalCost - (detail.cost || 0)) / (detail.cost || 1) * 100) : 0;

  if (awsAccounts.length === 0) {
    return (
      <div>
        <div className="page-header"><div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DollarSign size={22} color="#FF9900" /> AWS Cost Management
            <LiveBadge status="unconfigured" />
          </h1>
        </div></div>
        <div className="card" style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>No AWS Account Connected</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>Connect an AWS account with billing read access to view cost data.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DollarSign size={22} color="#FF9900" /> AWS Cost Management
            <LiveBadge status={badgeStatus} lastUpdated={lastUpdated} />
          </h1>
          <p className="page-subtitle">Real-time cost analysis powered by AWS Cost Explorer</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchCost} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="card" style={{ borderLeft: '3px solid #D13438', marginBottom: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertTriangle size={20} color="#D13438" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#D13438' }}>
              {errorCode === 'MissingBillingPermission' ? 'Billing Permission Required' : 'Cost Data Unavailable'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{error}</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !costData ? (
        <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 80, borderRadius: 10 }} /></div>)}</div>
      ) : costData ? (
        <>
          {/* KPI Cards */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FF9900, #FF6600)' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Current Month</div><div className="kpi-value">{fmtCurrency(costData.totalCost)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(255,153,0,.1)' }}><DollarSign size={20} color="#FF9900" /></div>
              </div>
              <div className="kpi-trend" style={{ fontSize: 12 }}>
                <Calendar size={12} style={{ marginRight: 4 }} /> {costData.month}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #8c4fff, #a78bfa)' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Forecast</div><div className="kpi-value">{fmtCurrency(costData.totalForecast)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(140,79,255,.1)' }}><TrendingUp size={20} color="#8c4fff" /></div>
              </div>
              <div className="kpi-trend" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>End-of-month estimate</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #22c55e)' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Services</div><div className="kpi-value">{breakdown.length}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}><Activity size={20} color="#107C10" /></div>
              </div>
              <div className="kpi-trend" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Active billing services</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #60a5fa)' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Accounts</div><div className="kpi-value">{costData.details?.length || 0}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}><Globe size={20} color="#0078d4" /></div>
              </div>
              <div className="kpi-trend" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Connected AWS accounts</div>
            </div>
          </div>

          {/* Charts */}
          <div className="dashboard-grid" style={{ marginTop: 20 }}>
            {/* Service Breakdown Chart */}
            <div className="card col-span-1">
              <div className="card-header"><div className="card-title"><PieIcon size={16} color="#FF9900" /> Cost by Service</div></div>
              <div className="card-body">
                {breakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={breakdown.slice(0, 10)} cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={2} dataKey="cost"
                        label={({ name, value }: any) => value > 0 ? `$${value.toFixed(0)}` : ''}>
                        {breakdown.slice(0, 10).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }}
                        formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Cost']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state" style={{ padding: 30 }}><div className="empty-state-title">No service cost data</div></div>
                )}
              </div>
            </div>

            {/* Service Cost Table */}
            <div className="card col-span-2">
              <div className="card-header"><div className="card-title"><BarChart3 size={16} color="#FF9900" /> Service Cost Breakdown</div></div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr><th>Service</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>% of Total</th><th>Bar</th></tr>
                    </thead>
                    <tbody>
                      {breakdown.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[idx % COLORS.length], flexShrink: 0 }} />
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{item.service}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 13 }}>${item.cost?.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 12 }}>
                            {costData.totalCost > 0 ? `${((item.cost / costData.totalCost) * 100).toFixed(1)}%` : '0%'}
                          </td>
                          <td style={{ width: '30%' }}>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 3, width: `${costData.totalCost > 0 ? Math.min(100, (item.cost / costData.totalCost) * 100) : 0}%`, background: COLORS[idx % COLORS.length], transition: 'width 0.5s ease' }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
