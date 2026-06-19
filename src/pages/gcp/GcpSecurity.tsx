import { useEffect, useState, useCallback } from 'react';
import { Shield, RefreshCw, AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';
import { useCloudStore } from '../../store/cloudStore';
import { api } from '../../services/api';
import LiveBadge, { deriveStatus } from '../../components/common/LiveBadge';
import { fmtNumber } from '../../utils/formatters';

export default function GcpSecurity() {
  const { cloudAccounts } = useCloudStore();
  const gcpAccounts = cloudAccounts.filter(a => a.provider === 'gcp');
  const [loading, setLoading] = useState(true);
  const [securityData, setSecurityData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resResult = await api.get<any>('/api/monitoring/security/unified', { params: { provider: 'gcp' } });
      setSecurityData(resResult || null);
      setLastUpdated(new Date().toISOString());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const badgeStatus = deriveStatus(lastUpdated, loading, false, gcpAccounts.length > 0);

  const findings = securityData?.findings || [];
  const score = securityData?.overallScore;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={22} color="#34A853" /> GCP Security Command Center
            <LiveBadge status={badgeStatus} lastUpdated={lastUpdated} />
          </h1>
          <p className="page-subtitle">Security findings and compliance from SCC</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 80, borderRadius: 10 }} /></div>)}</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: score ? (score > 80 ? '#107C10' : '#FFB900') : '#94a3b8' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Security Score</div><div className="kpi-value">{score ? `${score}%` : '—'}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(52,168,83,.1)' }}><ShieldCheck size={20} color="#34A853" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: securityData?.criticalAlerts > 0 ? '#D13438' : '#107C10' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Critical Findings</div><div className="kpi-value" style={{ color: securityData?.criticalAlerts > 0 ? '#D13438' : 'inherit' }}>{securityData?.criticalAlerts || 0}</div></div>
                <div className="kpi-icon" style={{ background: securityData?.criticalAlerts > 0 ? 'rgba(209,52,56,.1)' : 'rgba(16,124,16,.1)' }}>
                  {securityData?.criticalAlerts > 0 ? <AlertTriangle size={20} color="#D13438" /> : <CheckCircle size={20} color="#107C10" />}
                </div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#FF9900' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">High Findings</div><div className="kpi-value">{securityData?.highAlerts || 0}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(255,153,0,.1)' }}><AlertTriangle size={20} color="#FF9900" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#3b48cc' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Total Findings</div><div className="kpi-value">{securityData?.totalFindings || 0}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(59,72,204,.1)' }}><Shield size={20} color="#3b48cc" /></div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header"><div className="card-title"><Shield size={16} color="#34A853" /> Security Findings</div></div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="data-table-container">
                <table className="data-table">
                  <thead><tr><th>Finding</th><th>Severity</th><th>Resource</th><th>Recommendation</th></tr></thead>
                  <tbody>
                    {findings.map((f: any, i: number) => (
                      <tr key={f.id || i}>
                        <td><span style={{ fontWeight: 500 }}>{f.title}</span></td>
                        <td><span className={`severity-badge ${f.severity === 'CRITICAL' ? 'p1' : f.severity === 'HIGH' ? 'p2' : 'p3'}`}>{f.severity}</span></td>
                        <td>{f.resourceName?.split('/').pop() || 'Unknown'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.recommendation}</td>
                      </tr>
                    ))}
                    {findings.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>No active security findings</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
// Add this temporarily since it was omitted from imports above
import { ShieldAlert } from 'lucide-react';
