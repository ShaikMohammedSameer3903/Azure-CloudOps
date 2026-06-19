// ============================================================
// AWS Backup Dashboard — Real AWS Backup data
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { Shield, RefreshCw, Database, CheckCircle, AlertTriangle, Clock, HardDrive, Server } from 'lucide-react';
import { useCloudStore } from '../../store/cloudStore';
import { api } from '../../services/api';
import LiveBadge, { deriveStatus } from '../../components/common/LiveBadge';
import { fmtNumber } from '../../utils/formatters';

export default function AwsBackup() {
  const { cloudAccounts } = useCloudStore();
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws');
  const [loading, setLoading] = useState(true);
  const [backupData, setBackupData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch backup data for first AWS account
      const firstAccount = awsAccounts[0];
      if (!firstAccount) return;
      const result = await api.get<any>('/api/monitoring/backup', { params: { subscriptionId: firstAccount.id, provider: 'aws' } });
      setBackupData(result);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to fetch backup data');
    } finally {
      setLoading(false);
    }
  }, [awsAccounts.length]);

  useEffect(() => { if (awsAccounts.length > 0) fetchData(); else setLoading(false); }, [fetchData]);

  const badgeStatus = deriveStatus(lastUpdated, loading, !!error, awsAccounts.length > 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={22} color="#FF9900" /> AWS Backup & Recovery
            <LiveBadge status={badgeStatus} lastUpdated={lastUpdated} />
          </h1>
          <p className="page-subtitle">AWS Backup vault protection and recovery point status</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: '3px solid #D13438', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertTriangle size={18} color="#D13438" />
          <div><div style={{ fontWeight: 600, color: '#D13438', fontSize: 13 }}>Backup Data Error</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{error}</div></div>
        </div>
      )}

      {loading ? (
        <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 80, borderRadius: 10 }} /></div>)}</div>
      ) : backupData ? (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #107C10, #22c55e)' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Protected Resources</div><div className="kpi-value">{fmtNumber(backupData.totalProtectedItems || 0)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}><Server size={20} color="#107C10" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #FF9900, #FF6600)' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Backup Vaults</div><div className="kpi-value">{fmtNumber(backupData.vaults?.length || 0)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(255,153,0,.1)' }}><HardDrive size={20} color="#FF9900" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #0078d4, #60a5fa)' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Recovery Points</div><div className="kpi-value">{fmtNumber(backupData.totalRecoveryPoints || 0)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)' }}><Database size={20} color="#0078d4" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: backupData.failedJobs24h > 0 ? 'linear-gradient(90deg, #D13438, #f87171)' : 'linear-gradient(90deg, #107C10, #22c55e)' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Failed Jobs (24h)</div><div className="kpi-value" style={{ color: backupData.failedJobs24h > 0 ? '#D13438' : '#107C10' }}>{backupData.failedJobs24h || 0}</div></div>
                <div className="kpi-icon" style={{ background: backupData.failedJobs24h > 0 ? 'rgba(209,52,56,.1)' : 'rgba(16,124,16,.1)' }}>
                  {backupData.failedJobs24h > 0 ? <AlertTriangle size={20} color="#D13438" /> : <CheckCircle size={20} color="#107C10" />}
                </div>
              </div>
            </div>
          </div>

          {/* Vaults List */}
          {backupData.vaults?.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-header"><div className="card-title"><HardDrive size={16} color="#FF9900" /> Backup Vaults</div></div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                <div className="data-table-container">
                  <table className="data-table">
                    <thead><tr><th>Vault Name</th><th style={{ textAlign: 'right' }}>Recovery Points</th><th>Created</th></tr></thead>
                    <tbody>
                      {backupData.vaults.map((v: any, idx: number) => (
                        <tr key={idx}>
                          <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><HardDrive size={14} color="#FF9900" /><span style={{ fontWeight: 500 }}>{v.name}</span></div></td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{v.recoveryPoints || 0}</td>
                          <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <CheckCircle size={32} color="#107C10" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 600 }}>No backup data available</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>Configure AWS Backup to protect your resources.</p>
        </div>
      )}
    </div>
  );
}
