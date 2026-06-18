// ============================================================
// AWS Dashboard — Full AWS-only operations dashboard
// Data from AWS APIs (EC2, S3, RDS, Cost Explorer)
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Server, Shield, DollarSign, AlertTriangle,
  RefreshCw, Activity, HardDrive, Cpu,
  Database, Globe, Layers, MapPin, Lock,
  CheckCircle, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';
import { api } from '../services/api';

const CHART_COLORS = ['#FF9900', '#FF6600', '#D13438', '#107C10', '#8b5cf6', '#0078d4'];

import {fmtNumber, fmtCurrency} from '../utils/formatters';

export default function AwsDashboard() {
  const navigate = useNavigate();
  const { resources, incidents, isRefreshing, setIsRefreshing } = useAppStore();
  const { cloudAccounts } = useCloudStore();
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws');

  const [loading, setLoading] = useState(true);
  const [awsResources, setAwsResources] = useState<any[]>([]);
  const [costSummary, setCostSummary] = useState<any>(null);
  const [securityScore, setSecurityScore] = useState<any>(null);

  const fetchAll = async () => {
    setIsRefreshing(true);
    try {
      const resResult = await api.get<any[]>('/api/resources', { params: { provider: 'aws' } }).catch(() => []);
      setAwsResources(resResult);
      
      const incResult = await api.get<any[]>('/api/incidents', { params: { provider: 'aws' } }).catch(() => []);
      if (incResult.length > 0) {
        useAppStore.getState().setIncidents(incResult);
      }
      
      const costData = await api.get<any>('/api/monitoring/cost/unified', { params: { provider: 'aws' } }).catch(() => null);
      if (costData) {
        setCostSummary({ totalSpend: costData.totalCost });
      }
      
      const secData = await api.get<any>('/api/monitoring/security/unified', { params: { provider: 'aws' } }).catch(() => null);
      if (secData) {
        setSecurityScore(secData.overallScore);
      }
    } catch (err) {
      console.error('[AwsDashboard] Fetch error:', err);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(), 60000);
    return () => clearInterval(interval);
  }, [awsAccounts.length]);

  // ── Computed metrics ──
  const ec2Count = awsResources.filter(r => r.type?.toLowerCase().includes('ec2')).length;
  const s3Count = awsResources.filter(r => r.type?.toLowerCase().includes('s3')).length;
  const rdsCount = awsResources.filter(r => r.type?.toLowerCase().includes('rds')).length;
  const lambdaCount = awsResources.filter(r => r.type?.toLowerCase().includes('lambda')).length;

  const regions = useMemo(() => {
    const rSet = new Set<string>();
    awsResources.forEach(r => { if (r.region) rSet.add(r.region); });
    return rSet.size;
  }, [awsResources]);

  const byType: Record<string, number> = {};
  awsResources.forEach(r => {
    const t = (r.type || 'Other').split('/').pop() || 'Other';
    byType[t] = (byType[t] || 0) + 1;
  });
  const typeData = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

  const awsIncidents = incidents.filter(i => ((i.provider || '').toLowerCase() === 'aws'));
  const openIncidents = awsIncidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;

  if (loading && awsResources.length === 0) {
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
            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,153,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🟧</span>
            AWS Operations Dashboard
          </h1>
          <p className="page-subtitle">
            {awsAccounts.length} account(s) · {awsResources.length} resources discovered across {regions} regions
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
        <div className="kpi-card" onClick={() => navigate('/aws/resources')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FF9900, #FF6600)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Total Resources</div><div className="kpi-value">{fmtNumber(awsResources.length)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(255,153,0,.1)' }}><Server size={20} color="#FF9900" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{regions} regions active</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #00B7C3)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">EC2 Instances</div><div className="kpi-value">{fmtNumber(ec2Count)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}><Cpu size={20} color="#0078d4" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Elastic Compute</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #22c55e)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">S3 Buckets</div><div className="kpi-value">{fmtNumber(s3Count)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}><HardDrive size={20} color="#107C10" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Simple Storage</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">RDS / Lambda</div><div className="kpi-value">{fmtNumber(rdsCount + lambdaCount)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(139,92,246,.1)' }}><Zap size={20} color="#8b5cf6" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Databases & Serverless</div>
        </div>

        <div className="kpi-card" onClick={() => navigate('/aws/security')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: securityScore ? 'linear-gradient(90deg, #107C10, #22c55e)' : 'linear-gradient(90deg, #94a3b8, #cbd5e1)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Security Hub</div><div className="kpi-value" style={{ color: securityScore ? '#107C10' : '#94a3b8' }}>{securityScore ? `${securityScore}%` : '—'}</div></div>
            <div className="kpi-icon" style={{ background: securityScore ? 'rgba(16,124,16,.1)' : '#f1f5f9' }}><Shield size={20} color={securityScore ? '#107C10' : '#94a3b8'} /></div>
          </div>
          <div className="kpi-trend" style={{ color: securityScore ? '#107C10' : '#94a3b8', fontSize: 12 }}>{securityScore ? 'AWS Security Hub' : 'Security Score (Pending)'}</div>
        </div>

        <div className="kpi-card" onClick={() => navigate('/aws/cost')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FFB900, #f97316)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Monthly Cost</div><div className="kpi-value">{fmtCurrency(costSummary?.totalSpend)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(255,185,0,.1)' }}><DollarSign size={20} color="#FFB900" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>AWS Cost Explorer</div>
        </div>
      </div>

      {/* Charts */}
      <div className="dashboard-grid">
        {/* Resource Distribution */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title"><Server size={16} color="#FF9900" /> Resource Distribution</div></div>
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
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><Cpu size={24} /></div><div className="empty-state-title">No AWS resources discovered</div></div>
            )}
          </div>
        </div>

        {/* Active Incidents */}
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title"><AlertTriangle size={16} color={openIncidents > 0 ? '#D13438' : '#107C10'} /> AWS CloudWatch Alarms</div>
            {openIncidents > 0 && <span className="severity-badge p1">{openIncidents}</span>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {openIncidents > 0 ? (
              <div className="insight-list">
                {awsIncidents.slice(0, 5).map(inc => (
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
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><CheckCircle size={24} color="#107C10" /></div><div className="empty-state-title">No active alarms</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
