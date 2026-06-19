// ============================================================
// GCP Dashboard — Google Cloud Platform Operations Dashboard
// Data from GCP APIs (Compute, Storage, SCC, Billing)
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Server, Shield, DollarSign, AlertTriangle,
  RefreshCw, HardDrive, Cpu, Database, CheckCircle, Cloud
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';
import { api } from '../services/api';

const CHART_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#8b5cf6', '#0078d4'];

import { fmtNumber, fmtCurrency } from '../utils/formatters';

export default function GcpDashboard() {
  const navigate = useNavigate();
  const { incidents, isRefreshing, setIsRefreshing } = useAppStore();
  const { cloudAccounts } = useCloudStore();
  const gcpAccounts = cloudAccounts.filter(a => a.provider === 'gcp');

  const [loading, setLoading] = useState(true);
  const [gcpResources, setGcpResources] = useState<any[]>([]);
  const [costSummary, setCostSummary] = useState<any>(null);
  const [securityScore, setSecurityScore] = useState<any>(null);

  const fetchAll = async () => {
    setIsRefreshing(true);
    try {
      const resResult = await api.get<any[]>('/api/resources', { params: { provider: 'gcp' } }).catch(() => []);
      setGcpResources(resResult);
      
      const incResult = await api.get<any[]>('/api/incidents', { params: { provider: 'gcp' } }).catch(() => []);
      if (incResult.length > 0) {
        useAppStore.getState().setIncidents(incResult);
      }
      
      const costData = await api.get<any>('/api/monitoring/cost/unified', { params: { provider: 'gcp' } }).catch(() => null);
      if (costData) {
        setCostSummary({ totalSpend: costData.totalCost });
      }
      
      const secData = await api.get<any>('/api/monitoring/security/unified', { params: { provider: 'gcp' } }).catch(() => null);
      if (secData) {
        setSecurityScore(secData.overallScore);
      }
    } catch (err) {
      console.error('[GcpDashboard] Fetch error:', err);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(), 60000);
    return () => clearInterval(interval);
  }, [gcpAccounts.length]);

  // ── Computed metrics ──
  const computeCount = gcpResources.filter(r => r.type?.toLowerCase().includes('compute engine')).length;
  const storageCount = gcpResources.filter(r => r.type?.toLowerCase().includes('cloud storage')).length;
  const sqlCount = gcpResources.filter(r => r.type?.toLowerCase().includes('sql')).length;

  const locations = useMemo(() => {
    const lSet = new Set<string>();
    gcpResources.forEach(r => { if (r.location) lSet.add(r.location); });
    return lSet.size;
  }, [gcpResources]);

  const byType: Record<string, number> = {};
  gcpResources.forEach(r => {
    const t = (r.type || 'Other');
    byType[t] = (byType[t] || 0) + 1;
  });
  const typeData = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

  const gcpIncidents = incidents.filter(i => ((i.provider || '').toLowerCase() === 'gcp'));
  const openIncidents = gcpIncidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;

  if (loading && gcpResources.length === 0) {
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
            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(66,133,244,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔴</span>
            Google Cloud Platform Dashboard
          </h1>
          <p className="page-subtitle">
            {gcpAccounts.length} project(s) · {gcpResources.length} resources discovered across {locations} locations
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
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #4285F4, #34A853)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Total Resources</div><div className="kpi-value">{fmtNumber(gcpResources.length)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(66,133,244,.1)' }}><Cloud size={20} color="#4285F4" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{locations} locations active</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #4285F4, #00B7C3)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Compute Engine</div><div className="kpi-value">{fmtNumber(computeCount)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(66,133,244,.1)' }}><Cpu size={20} color="#4285F4" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>VM Instances</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #34A853)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Cloud Storage</div><div className="kpi-value">{fmtNumber(storageCount)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(52,168,83,.1)' }}><HardDrive size={20} color="#34A853" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Storage Buckets</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #EA4335, #FBBC05)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Cloud SQL</div><div className="kpi-value">{fmtNumber(sqlCount)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(234,67,53,.1)' }}><Database size={20} color="#EA4335" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Managed Databases</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: securityScore ? 'linear-gradient(90deg, #34A853, #107C10)' : 'linear-gradient(90deg, #94a3b8, #cbd5e1)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">SCC Findings</div><div className="kpi-value" style={{ color: securityScore ? '#34A853' : '#94a3b8' }}>{securityScore ? `${securityScore}%` : '—'}</div></div>
            <div className="kpi-icon" style={{ background: securityScore ? 'rgba(52,168,83,.1)' : '#f1f5f9' }}><Shield size={20} color={securityScore ? '#34A853' : '#94a3b8'} /></div>
          </div>
          <div className="kpi-trend" style={{ color: securityScore ? '#34A853' : '#94a3b8', fontSize: 12 }}>{securityScore ? 'Security Command Center' : 'Security Score (Pending)'}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FBBC05, #f97316)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Monthly Cost</div><div className="kpi-value">{fmtCurrency(costSummary?.totalSpend)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(251,188,5,.1)' }}><DollarSign size={20} color="#FBBC05" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Cloud Billing</div>
        </div>
      </div>

      {/* Charts */}
      <div className="dashboard-grid">
        {/* Resource Distribution */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title"><Cloud size={16} color="#4285F4" /> Resource Distribution</div></div>
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
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><Cpu size={24} /></div><div className="empty-state-title">No GCP resources discovered</div></div>
            )}
          </div>
        </div>

        {/* Active Incidents */}
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title"><AlertTriangle size={16} color={openIncidents > 0 ? '#D13438' : '#107C10'} /> Operations Incidents</div>
            {openIncidents > 0 && <span className="severity-badge p1">{openIncidents}</span>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {openIncidents > 0 ? (
              <div className="insight-list">
                {gcpIncidents.slice(0, 5).map(inc => (
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
      </div>
    </div>
  );
}
