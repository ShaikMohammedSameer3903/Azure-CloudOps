// ============================================================
// AWS Dashboard — Console-like Operations Dashboard
// Shows real live data from AWS APIs for every service.
// NEVER displays placeholder values.
// ============================================================

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Server, Shield, DollarSign, AlertTriangle,
  RefreshCw, Activity, HardDrive, Cpu,
  Database, Globe, Layers, MapPin, Lock,
  CheckCircle, Zap, Cloud, Key, Eye,
  Network, Box, BarChart3, TrendingUp,
  FileText, ShieldCheck, Bug, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';
import { api } from '../services/api';
import LiveBadge, { deriveStatus } from '../components/common/LiveBadge';

const CHART_COLORS = ['#FF9900', '#FF6600', '#D13438', '#107C10', '#8b5cf6', '#0078d4', '#00B7C3', '#FFB900'];

import { fmtNumber, fmtCurrency } from '../utils/formatters';

// ── Service card configuration ──
const SERVICE_ICONS: Record<string, any> = {
  'EC2': Cpu, 'S3': HardDrive, 'RDS': Database, 'Lambda': Zap,
  'ECS': Box, 'EKS': Layers, 'DynamoDB': Database, 'VPC': Network,
  'IAM': Key, 'CloudWatch': Activity, 'SecurityHub': ShieldCheck,
  'GuardDuty': Bug, 'ElastiCache': Database, 'Redshift': Database,
  'EFS': HardDrive, 'WAF': Shield, 'SecretsManager': Lock,
  'Route53': Globe, 'ELB': Network, 'AutoScaling': Server,
};

const SERVICE_COLORS: Record<string, string> = {
  'EC2': '#FF9900', 'S3': '#569a31', 'RDS': '#3b48cc', 'Lambda': '#FF9900',
  'ECS': '#FF9900', 'EKS': '#FF9900', 'DynamoDB': '#3b48cc', 'VPC': '#8c4fff',
  'IAM': '#dd344c', 'CloudWatch': '#FF4F8B', 'SecurityHub': '#dd344c',
  'GuardDuty': '#dd344c', 'ElastiCache': '#3b48cc', 'Redshift': '#8c4fff',
  'EFS': '#569a31', 'WAF': '#dd344c', 'SecretsManager': '#dd344c',
  'Route53': '#8c4fff', 'ELB': '#8c4fff', 'AutoScaling': '#FF9900',
};

function getServiceName(type: string): string {
  if (type.includes('EC2::Instance')) return 'EC2';
  if (type.includes('S3')) return 'S3';
  if (type.includes('RDS')) return 'RDS';
  if (type.includes('Lambda')) return 'Lambda';
  if (type.includes('ECS')) return 'ECS';
  if (type.includes('EKS')) return 'EKS';
  if (type.includes('DynamoDB')) return 'DynamoDB';
  if (type.includes('VPC') && !type.includes('Subnet') && !type.includes('SecurityGroup') && !type.includes('Route') && !type.includes('Nat') && !type.includes('Internet') && !type.includes('Acl')) return 'VPC';
  if (type.includes('IAM::User') || type.includes('IAM::Role') || type.includes('IAM::Policy')) return 'IAM';
  if (type.includes('ElastiCache')) return 'ElastiCache';
  if (type.includes('Redshift')) return 'Redshift';
  if (type.includes('EFS')) return 'EFS';
  if (type.includes('WAF')) return 'WAF';
  if (type.includes('SecretsManager')) return 'SecretsManager';
  if (type.includes('Route53')) return 'Route53';
  if (type.includes('ElasticLoadBalancing')) return 'ELB';
  if (type.includes('AutoScaling')) return 'AutoScaling';
  if (type.includes('Logs::LogGroup')) return 'CloudWatch';
  if (type.includes('Volume') || type.includes('KeyPair') || type.includes('Subnet') || type.includes('SecurityGroup') || type.includes('RouteTable') || type.includes('NatGateway') || type.includes('InternetGateway') || type.includes('NetworkAcl')) return '';
  return '';
}

interface ServiceSummary {
  name: string;
  count: number;
  regions: Set<string>;
  statuses: Record<string, number>;
  resources: any[];
}

export default function AwsDashboard() {
  const navigate = useNavigate();
  const { incidents, isRefreshing, setIsRefreshing } = useAppStore();
  const { cloudAccounts } = useCloudStore();
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws');

  const [loading, setLoading] = useState(true);
  const [awsResources, setAwsResources] = useState<any[]>([]);
  const [costData, setCostData] = useState<any>(null);
  const [securityData, setSecurityData] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('idle');
  const [costError, setCostError] = useState<string | null>(null);
  const [secError, setSecError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setIsRefreshing(true);
    setSyncStatus('syncing');
    try {
      const resResult = await api.get<any[]>('/api/resources', { params: { provider: 'aws' } }).catch(() => []);
      setAwsResources(resResult);

      const [costResult, secResult] = await Promise.allSettled([
        api.get<any>('/api/monitoring/cost/unified', { params: { provider: 'aws' } }),
        api.get<any>('/api/monitoring/security/unified', { params: { provider: 'aws' } }),
      ]);

      if (costResult.status === 'fulfilled') {
        setCostData(costResult.value);
        setCostError(null);
      } else {
        setCostError((costResult as any).reason?.message || 'Cost data unavailable');
      }

      if (secResult.status === 'fulfilled') {
        setSecurityData(secResult.value);
        setSecError(null);
      } else {
        setSecError((secResult as any).reason?.message || 'Security data unavailable');
      }

      setLastSyncTime(new Date().toISOString());
      setSyncStatus('completed');
    } catch (err) {
      console.error('[AwsDashboard] Fetch error:', err);
      setSyncStatus('error');
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, [setIsRefreshing]);

  useEffect(() => {
    fetchAll();
  }, [awsAccounts.length, fetchAll]);

  // ── Group resources by service ──
  const serviceSummaries = useMemo(() => {
    const map = new Map<string, ServiceSummary>();
    for (const r of awsResources) {
      const svc = getServiceName(r.type || '');
      if (!svc) continue;
      if (!map.has(svc)) {
        map.set(svc, { name: svc, count: 0, regions: new Set(), statuses: {}, resources: [] });
      }
      const s = map.get(svc)!;
      s.count++;
      if (r.location || r.region) s.regions.add(r.location || r.region);
      const status = (r.status || 'unknown').toLowerCase();
      s.statuses[status] = (s.statuses[status] || 0) + 1;
      if (s.resources.length < 20) s.resources.push(r);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [awsResources]);

  const regions = useMemo(() => {
    const rSet = new Set<string>();
    awsResources.forEach(r => { if (r.location || r.region) rSet.add(r.location || r.region); });
    return rSet;
  }, [awsResources]);

  const awsIncidents = incidents.filter(i => ((i.provider || '').toLowerCase() === 'aws'));
  const openIncidents = awsIncidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved' && (i.status as string) !== 'CLOSED' && (i.status as string) !== 'RESOLVED').length;

  // ── Type distribution chart ──
  const typeData = serviceSummaries.slice(0, 8).map(s => ({ name: s.name, value: s.count }));

  // Derive badge status
  const badgeStatus = deriveStatus(
    lastSyncTime,
    syncStatus === 'syncing',
    syncStatus === 'error',
    awsAccounts.length > 0
  );

  // ── Loading skeleton ──
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

  // ── No AWS accounts configured ──
  if (awsAccounts.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div className="page-header-content">
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,153,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🟧</span>
              AWS Operations Dashboard
            </h1>
          </div>
        </div>
        <div className="card" style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center', padding: 40 }}>
          <LiveBadge status="unconfigured" />
          <div style={{ marginTop: 20, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>No AWS Account Connected</div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 13 }}>
            Connect your AWS account using IAM Access Keys or Role ARN to start discovering resources.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => navigate('/cloud-accounts')}>
            <Key size={14} /> Connect AWS Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,153,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🟧</span>
            AWS Operations Dashboard
            <LiveBadge status={badgeStatus} lastUpdated={lastSyncTime} />
          </h1>
          <p className="page-subtitle">
            {awsAccounts.length} account{awsAccounts.length > 1 ? 's' : ''} · {fmtNumber(awsResources.length)} resources across {regions.size} region{regions.size !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => fetchAll()} disabled={isRefreshing}>
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* ── Top KPI Cards ── */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => navigate('/aws/resources')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FF9900, #FF6600)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Total Resources</div><div className="kpi-value">{fmtNumber(awsResources.length)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(255,153,0,.1)' }}><Server size={20} color="#FF9900" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{serviceSummaries.length} services · {regions.size} regions</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FF9900, #f59e0b)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">EC2 Instances</div><div className="kpi-value">{fmtNumber(serviceSummaries.find(s => s.name === 'EC2')?.count || 0)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(255,153,0,.1)' }}><Cpu size={20} color="#FF9900" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            {serviceSummaries.find(s => s.name === 'EC2')?.regions.size || 0} regions
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #569a31, #22c55e)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">S3 Buckets</div><div className="kpi-value">{fmtNumber(serviceSummaries.find(s => s.name === 'S3')?.count || 0)}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(86,154,49,.1)' }}><HardDrive size={20} color="#569a31" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Simple Storage Service</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #3b48cc, #6366f1)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Databases</div><div className="kpi-value">{fmtNumber(
              (serviceSummaries.find(s => s.name === 'RDS')?.count || 0) +
              (serviceSummaries.find(s => s.name === 'DynamoDB')?.count || 0) +
              (serviceSummaries.find(s => s.name === 'ElastiCache')?.count || 0) +
              (serviceSummaries.find(s => s.name === 'Redshift')?.count || 0)
            )}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(59,72,204,.1)' }}><Database size={20} color="#3b48cc" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>RDS · DynamoDB · ElastiCache · Redshift</div>
        </div>

        <div className="kpi-card" onClick={() => navigate('/aws/security')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: securityData?.overallScore != null
            ? (securityData.overallScore >= 80 ? 'linear-gradient(90deg, #107C10, #22c55e)' : 'linear-gradient(90deg, #D13438, #f87171)')
            : 'linear-gradient(90deg, #94a3b8, #cbd5e1)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Security Hub</div>
              <div className="kpi-value" style={{ color: securityData?.overallScore != null
                ? (securityData.overallScore >= 80 ? '#107C10' : '#D13438') : '#94a3b8' }}>
                {securityData?.overallScore != null ? `${securityData.overallScore}%` : secError ? '⚠️' : '—'}
              </div>
            </div>
            <div className="kpi-icon" style={{ background: securityData?.overallScore != null ? 'rgba(16,124,16,.1)' : '#f1f5f9' }}>
              <Shield size={20} color={securityData?.overallScore != null ? '#107C10' : '#94a3b8'} />
            </div>
          </div>
          <div className="kpi-trend" style={{ color: secError ? '#D13438' : 'var(--text-tertiary)', fontSize: 12 }}>
            {secError ? 'Permission Required' : securityData?.overallScore != null ? `${securityData.criticalAlerts || 0} critical · ${securityData.highAlerts || 0} high` : 'Awaiting data…'}
          </div>
        </div>

        <div className="kpi-card" onClick={() => navigate('/aws/cost')} style={{ cursor: 'pointer' }}>
          <div className="kpi-card-accent" style={{ background: costError ? 'linear-gradient(90deg, #94a3b8, #cbd5e1)' : 'linear-gradient(90deg, #FFB900, #f97316)' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Monthly Cost</div>
              <div className="kpi-value">{costError ? '⚠️' : fmtCurrency(costData?.totalCost)}</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(255,185,0,.1)' }}><DollarSign size={20} color="#FFB900" /></div>
          </div>
          <div className="kpi-trend" style={{ color: costError ? '#D13438' : 'var(--text-tertiary)', fontSize: 12 }}>
            {costError ? 'Billing Permission Required' : 'AWS Cost Explorer'}
          </div>
        </div>
      </div>

      {/* ── Service Cards Grid ── */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={18} color="#FF9900" /> Running Services
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {serviceSummaries.map(svc => {
            const IconComponent = SERVICE_ICONS[svc.name] || Cloud;
            const color = SERVICE_COLORS[svc.name] || '#FF9900';
            const runningCount = svc.statuses['running'] || svc.statuses['active'] || svc.statuses['available'] || svc.count;
            return (
              <div key={svc.name} className="card" style={{ cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onClick={() => navigate('/aws/resources')}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 25px rgba(0,0,0,.1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconComponent size={18} color={color} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{svc.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{svc.regions.size} region{svc.regions.size !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <LiveBadge status={badgeStatus} lastUpdated={lastSyncTime} compact showTimestamp={false} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resources</div>
                      <div style={{ fontWeight: 700, fontSize: 18, color, marginTop: 2 }}>{fmtNumber(svc.count)}</div>
                    </div>
                    <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Running</div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: '#107C10', marginTop: 2 }}>{fmtNumber(runningCount)}</div>
                    </div>
                  </div>

                  {/* Top resources preview */}
                  {svc.resources.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
                      {svc.resources.slice(0, 3).map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', color: 'var(--text-secondary)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.status === 'running' || r.status === 'available' || r.status === 'Active' || r.status === 'ACTIVE' ? '#107C10' : '#94a3b8', flexShrink: 0 }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 10, flexShrink: 0 }}>{r.location || r.region || 'global'}</span>
                        </div>
                      ))}
                      {svc.resources.length > 3 && (
                        <div style={{ fontSize: 10, color: color, fontWeight: 600, marginTop: 4 }}>
                          +{svc.resources.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="dashboard-grid" style={{ marginTop: 24 }}>
        {/* Resource Distribution */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title"><Server size={16} color="#FF9900" /> Resource Distribution</div></div>
          <div className="card-body">
            {typeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={typeData} cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={2} dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}>
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

        {/* Cost Trend */}
        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title"><DollarSign size={16} color="#FFB900" /> Cost Trend (30 Days)</div>
            {costError && <span className="severity-badge p2" style={{ fontSize: 10 }}>⚠️ {costError.substring(0, 30)}</span>}
          </div>
          <div className="card-body">
            {costData?.details?.[0]?.breakdown?.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={costData.details[0].breakdown.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="service" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }}
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Cost']} />
                  <Bar dataKey="cost" fill="#FF9900" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon"><DollarSign size={24} /></div>
                <div className="empty-state-title">{costError ? 'Cost Data Unavailable' : 'No cost data yet'}</div>
                {costError && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{costError}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Security Findings */}
        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title"><Shield size={16} color="#dd344c" /> Security Findings</div>
            {securityData?.criticalAlerts > 0 && <span className="severity-badge p1">{securityData.criticalAlerts}</span>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {securityData && securityData.findings?.length > 0 ? (
              <div className="insight-list">
                {securityData.findings.slice(0, 6).map((f: any, idx: number) => (
                  <div key={f.id || idx} className="insight-item">
                    <div className="insight-icon" style={{
                      background: f.severity === 'CRITICAL' ? 'rgba(209,52,56,.1)' : f.severity === 'HIGH' || f.severity === 'WARNING' ? 'rgba(255,185,0,.1)' : 'rgba(107,114,128,.1)'
                    }}>
                      {f.severity === 'CRITICAL' ? <AlertTriangle size={14} color="#D13438" /> : <ShieldCheck size={14} color={f.severity === 'HIGH' || f.severity === 'WARNING' ? '#FFB900' : '#6B7280'} />}
                    </div>
                    <div className="insight-content">
                      <div className="insight-title" style={{ fontSize: 12 }}>{f.title?.substring(0, 60) || 'Finding'}</div>
                      <div className="insight-desc" style={{ fontSize: 10 }}>{f.source || f.provider} · {f.resourceType || 'Unknown'}</div>
                    </div>
                    <span className={`severity-badge ${f.severity === 'CRITICAL' || f.severity === 'High' ? 'p1' : f.severity === 'HIGH' || f.severity === 'WARNING' ? 'p2' : 'p3'}`} style={{ fontSize: 9 }}>
                      {f.severity}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon">
                  {secError ? <AlertTriangle size={24} color="#D13438" /> : <CheckCircle size={24} color="#107C10" />}
                </div>
                <div className="empty-state-title">{secError ? 'Security Data Unavailable' : 'No active findings'}</div>
                {secError && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{secError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Active Alarms Section ── */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title"><AlertTriangle size={16} color={openIncidents > 0 ? '#D13438' : '#107C10'} /> CloudWatch Alarms & Incidents</div>
          {openIncidents > 0 && <span className="severity-badge p1">{openIncidents} active</span>}
        </div>
        <div className="card-body" style={{ paddingTop: 8 }}>
          {openIncidents > 0 ? (
            <div className="insight-list">
              {awsIncidents.slice(0, 8).map(inc => (
                <div key={inc.id} className="insight-item">
                  <div className="insight-icon" style={{ background: 'rgba(209,52,56,.1)' }}><AlertTriangle size={16} color="#D13438" /></div>
                  <div className="insight-content">
                    <div className="insight-title">{inc.title}</div>
                    <div className="insight-desc">{inc.description}</div>
                  </div>
                  <span className={`severity-badge ${inc.severity === 'CRITICAL' || inc.severity === 'SEV0' ? 'p1' : inc.severity === 'WARNING' || inc.severity === 'SEV1' ? 'p2' : 'p3'}`}>{inc.severity}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-icon"><CheckCircle size={24} color="#107C10" /></div><div className="empty-state-title">No active alarms</div></div>
          )}
        </div>
      </div>

      {/* ── Region Summary ── */}
      {regions.size > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header"><div className="card-title"><Globe size={16} color="#8c4fff" /> Active Regions</div></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Array.from(regions).sort().map(r => {
                const count = awsResources.filter(res => (res.location || res.region) === r).length;
                return (
                  <div key={r} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, background: 'var(--bg-elevated)',
                    fontSize: 12, border: '1px solid var(--border-default)',
                  }}>
                    <MapPin size={12} color="#8c4fff" />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>({count})</span>
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
