// ============================================================
// AWS Governance Dashboard — Real IAM, Config, & Compliance data
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { Shield, RefreshCw, Key, Users, Lock, CheckCircle, AlertTriangle, Eye, FileText, ShieldCheck } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useCloudStore } from '../../store/cloudStore';
import { api } from '../../services/api';
import LiveBadge, { deriveStatus } from '../../components/common/LiveBadge';
import { fmtNumber } from '../../utils/formatters';

const COLORS = ['#107C10', '#FF9900', '#D13438', '#3b48cc', '#8c4fff', '#00B7C3'];

export default function AwsGovernance() {
  const { cloudAccounts } = useCloudStore();
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws');
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<any[]>([]);
  const [complianceData, setComplianceData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resResult, compResult] = await Promise.allSettled([
        api.get<any[]>('/api/resources', { params: { provider: 'aws' } }),
        api.get<any>('/api/monitoring/compliance/unified', { params: { provider: 'aws', framework: 'CIS' } }),
      ]);
      if (resResult.status === 'fulfilled') setResources(resResult.value);
      if (compResult.status === 'fulfilled') setComplianceData(compResult.value);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch governance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const badgeStatus = deriveStatus(lastUpdated, loading, !!error, awsAccounts.length > 0);

  // Compute IAM stats from real resources
  const iamUsers = resources.filter(r => r.type?.includes('IAM::User'));
  const iamRoles = resources.filter(r => r.type?.includes('IAM::Role'));
  const iamPolicies = resources.filter(r => r.type?.includes('IAM::Policy'));
  const secrets = resources.filter(r => r.type?.includes('SecretsManager'));
  const wafAcls = resources.filter(r => r.type?.includes('WAF'));
  const securityGroups = resources.filter(r => r.type?.includes('SecurityGroup'));

  const iamSummary = [
    { name: 'Users', value: iamUsers.length, icon: Users, color: '#FF9900' },
    { name: 'Roles', value: iamRoles.length, icon: Key, color: '#3b48cc' },
    { name: 'Policies', value: iamPolicies.length, icon: FileText, color: '#8c4fff' },
    { name: 'Secrets', value: secrets.length, icon: Lock, color: '#D13438' },
    { name: 'WAF ACLs', value: wafAcls.length, icon: Shield, color: '#107C10' },
    { name: 'Security Groups', value: securityGroups.length, icon: ShieldCheck, color: '#00B7C3' },
  ];

  const pieData = iamSummary.filter(i => i.value > 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={22} color="#FF9900" /> AWS Governance & Compliance
            <LiveBadge status={badgeStatus} lastUpdated={lastUpdated} />
          </h1>
          <p className="page-subtitle">IAM, compliance frameworks, and security governance</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="kpi-grid">{[...Array(6)].map((_, i) => <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 80, borderRadius: 10 }} /></div>)}</div>
      ) : (
        <>
          {/* IAM Summary Cards */}
          <div className="kpi-grid">
            {iamSummary.map(item => {
              const Icon = item.icon;
              return (
                <div key={item.name} className="kpi-card">
                  <div className="kpi-card-accent" style={{ background: item.color }} />
                  <div className="kpi-card-top">
                    <div><div className="kpi-label">{item.name}</div><div className="kpi-value">{fmtNumber(item.value)}</div></div>
                    <div className="kpi-icon" style={{ background: `${item.color}15` }}><Icon size={20} color={item.color} /></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dashboard-grid" style={{ marginTop: 20 }}>
            {/* IAM Distribution */}
            <div className="card col-span-1">
              <div className="card-header"><div className="card-title"><Key size={16} color="#FF9900" /> IAM Distribution</div></div>
              <div className="card-body">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value" paddingAngle={2}
                        label={({ name, value }: any) => `${name}: ${value}`}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state" style={{ padding: 30 }}><div className="empty-state-title">No IAM resources discovered</div></div>
                )}
              </div>
            </div>

            {/* Compliance Score */}
            <div className="card col-span-1">
              <div className="card-header"><div className="card-title"><ShieldCheck size={16} color="#107C10" /> Compliance ({complianceData?.framework || 'CIS'})</div></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
                {complianceData ? (
                  <>
                    <div style={{
                      width: 120, height: 120, borderRadius: '50%',
                      background: `conic-gradient(${complianceData.overallScore >= 80 ? '#107C10' : complianceData.overallScore >= 60 ? '#FFB900' : '#D13438'} ${complianceData.overallScore * 3.6}deg, var(--bg-elevated) 0)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: complianceData.overallScore >= 80 ? '#107C10' : complianceData.overallScore >= 60 ? '#FFB900' : '#D13438' }}>
                          {complianceData.overallScore}%
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                      {fmtNumber(complianceData.totalControls || 0)} controls · {fmtNumber(complianceData.failedControls || 0)} failed
                    </div>
                    <div style={{
                      marginTop: 8, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: complianceData.riskLevel === 'Low' ? 'rgba(16,124,16,.1)' : complianceData.riskLevel === 'Medium' ? 'rgba(255,185,0,.1)' : 'rgba(209,52,56,.1)',
                      color: complianceData.riskLevel === 'Low' ? '#107C10' : complianceData.riskLevel === 'Medium' ? '#FFB900' : '#D13438',
                    }}>
                      {complianceData.riskLevel} Risk
                    </div>
                  </>
                ) : (
                  <div className="empty-state"><div className="empty-state-title">Compliance data unavailable</div></div>
                )}
              </div>
            </div>

            {/* IAM Users Table */}
            <div className="card col-span-1">
              <div className="card-header"><div className="card-title"><Users size={16} color="#FF9900" /> IAM Users ({iamUsers.length})</div></div>
              <div className="card-body" style={{ paddingTop: 0, maxHeight: 300, overflowY: 'auto' }}>
                {iamUsers.length > 0 ? (
                  <div className="insight-list">
                    {iamUsers.slice(0, 15).map((u, i) => (
                      <div key={u.id || i} className="insight-item">
                        <div className="insight-icon" style={{ background: 'rgba(255,153,0,.1)' }}><Users size={14} color="#FF9900" /></div>
                        <div className="insight-content">
                          <div className="insight-title" style={{ fontSize: 12 }}>{u.name}</div>
                          <div className="insight-desc" style={{ fontSize: 10 }}>
                            {u.properties?.mfaEnabled ? '✅ MFA' : '⚠️ No MFA'} · Created: {u.properties?.createDate ? new Date(u.properties.createDate).toLocaleDateString() : '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 20 }}><div className="empty-state-title">No IAM users found</div></div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
