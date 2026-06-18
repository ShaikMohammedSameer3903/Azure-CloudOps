// ============================================================
// Unified Backup Dashboard — Azure Recovery Services + AWS Backup
// All data from backend APIs — NO mock data
// ============================================================

import { useEffect, useState } from 'react';
import { HardDrive, RefreshCw, CheckCircle, XCircle, Clock, Shield, Cloud } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../services/api';
import { useCloudStore } from '../store/cloudStore';
import { useAppStore } from '../store/appStore';

const PROVIDER_COLORS: Record<string, string> = { azure: '#0078d4', aws: '#FF9900' };

export default function UnifiedBackupDashboard() {
  const { selectedProvider } = useCloudStore();
  const { backupHealth } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backupData, setBackupData] = useState<any>(null);
  const [filterProvider, setFilterProvider] = useState<string>('all');

  const fetchAll = async () => {
    setRefreshing(true);
    try {
      const result = await api.get<any>('/api/monitoring/backup', { params: { provider: filterProvider } });
      setBackupData(result);
    } catch (err) { console.error('[Backup] Error:', err); } finally { setRefreshing(false); setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [filterProvider]);

  const protectedItems = backupData?.totalProtectedItems ?? backupHealth?.[0]?.protectedItems ?? 0;
  const healthyItems = backupData?.healthyItems ?? backupHealth?.[0]?.healthyItems ?? 0;
  const failedJobs = backupData?.failedJobs ?? backupHealth?.[0]?.criticalItems ?? 0;
  const successRate = protectedItems > 0 ? Math.round((healthyItems / protectedItems) * 100) : 0;
  const lastBackup = backupData?.recentJobs?.[0]?.timestamp ?? backupHealth?.[0]?.lastSuccessfulBackup ?? null;
  const recentJobs = backupData?.recentJobs || backupHealth?.[0]?.jobs || [];

  const statusData = [
    { name: 'Healthy', value: healthyItems, color: '#107C10' },
    { name: 'Failed', value: failedJobs, color: '#D13438' },
    { name: 'Warning', value: Math.max(0, protectedItems - healthyItems - failedJobs), color: '#FFB900' },
  ].filter(d => d.value > 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Unified Backup & Disaster Recovery</h1>
          <p className="page-subtitle">Azure Recovery Services · AWS Backup — consolidated protection status</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-subtle)' }}>
            {['all', 'azure', 'aws'].map(p => (
              <button key={p} onClick={() => setFilterProvider(p)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: filterProvider === p ? (p === 'azure' ? '#0078d4' : p === 'aws' ? '#FF9900' : 'var(--azure-500)') : 'transparent',
                color: filterProvider === p ? 'white' : 'var(--text-secondary)', transition: 'all 150ms ease',
              }}>{p === 'all' ? '🌐 All' : p === 'azure' ? '🔷 Azure' : '🟠 AWS'}</button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #00B7C3)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Protected Resources</div><div className="kpi-value">{protectedItems}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}><Shield size={20} color="#0078d4" /></div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${successRate >= 90 ? '#107C10' : '#FFB900'}, ${successRate >= 90 ? '#22c55e' : '#FCD34D'})` }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Success Rate</div><div className="kpi-value" style={{ color: successRate >= 90 ? '#107C10' : '#FFB900' }}>{successRate}%</div></div>
            <div className="kpi-icon" style={{ background: `${successRate >= 90 ? '#107C10' : '#FFB900'}18` }}><CheckCircle size={20} color={successRate >= 90 ? '#107C10' : '#FFB900'} /></div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #D13438, #FF6B6B)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Failed Jobs</div><div className="kpi-value" style={{ color: failedJobs > 0 ? '#D13438' : '#107C10' }}>{failedJobs}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(209,52,56,.1)' }}><XCircle size={20} color="#D13438" /></div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Last Backup</div><div className="kpi-value" style={{ fontSize: 16 }}>{lastBackup ? new Date(lastBackup).toLocaleString() : '—'}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(139,92,246,.1)' }}><Clock size={20} color="#8b5cf6" /></div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Health Pie */}
        <div className="card col-span-1">
          <div className="card-header"><div className="card-title">Protection Status</div></div>
          <div className="card-body">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={statusData} cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3} dataKey="value">
                  {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie><Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} /></PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}><div className="empty-state-title">No backup data</div></div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
              {statusData.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="card col-span-2">
          <div className="card-header"><div className="card-title"><HardDrive size={16} color="#0078d4" /> Recent Backup Jobs</div></div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {recentJobs.length > 0 ? (
              <div className="insight-list">
                {recentJobs.slice(0, 8).map((job: any, i: number) => {
                  const isSuccess = job.status === 'Completed' || job.status === 'Succeeded' || job.status === 'Success';
                  return (
                    <div key={job.id || i} className="insight-item">
                      <div className="insight-icon" style={{ background: isSuccess ? 'rgba(16,124,16,.1)' : 'rgba(209,52,56,.1)' }}>
                        {isSuccess ? <CheckCircle size={16} color="#107C10" /> : <XCircle size={16} color="#D13438" />}
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{job.name || 'Backup Job'}</div>
                        <div className="insight-desc">{job.operation || job.type || 'Backup'} · {job.startTime || job.timestamp ? new Date(job.startTime || job.timestamp).toLocaleString() : '—'}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isSuccess ? '#107C10' : '#D13438', background: isSuccess ? 'rgba(16,124,16,.1)' : 'rgba(209,52,56,.1)', padding: '2px 8px', borderRadius: 20 }}>
                        {job.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-state-title">No recent backup jobs</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
