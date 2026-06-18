import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, RefreshCw, Key, Lock, Eye } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useProvider } from '../../context/ProviderContext';
import { api } from '../../services/api';

export default function AwsSecurity() {
  const { resources } = useAppStore();
  const { selectedProvider } = useProvider();
  
  const [loading, setLoading] = useState(false);
  const [securityScore, setSecurityScore] = useState<number | null>(null);
  const [findings, setFindings] = useState<any[]>([]);

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<any>('/api/monitoring/security/unified', {
        params: { provider: 'aws' }
      });
      if (data) {
        setSecurityScore(data.overallScore);
        setFindings(data.findings || []);
      }
    } catch (err) {
      console.error('[AwsSecurity] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const criticalFindings = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'High');
  const highFindings = findings.filter(f => f.severity === 'HIGH');
  const mediumFindings = findings.filter(f => f.severity === 'MEDIUM');

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">AWS Security Hub</h1>
          <p className="page-subtitle">Security Hub · GuardDuty · Inspector Findings</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchSecurityData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: securityScore && securityScore > 80 ? '#107C10' : '#FFB900' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Security Score</div>
              <div className="kpi-value">{securityScore != null ? `${securityScore}%` : '—'}</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}>
              <Shield size={20} color={securityScore && securityScore > 80 ? '#107C10' : '#FFB900'} />
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: '#D13438' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Critical Findings</div>
              <div className="kpi-value">{criticalFindings.length}</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(209,52,56,.1)' }}>
              <AlertTriangle size={20} color="#D13438" />
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: '#FF9900' }} />
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">High Findings</div>
              <div className="kpi-value">{highFindings.length}</div>
            </div>
            <div className="kpi-icon" style={{ background: 'rgba(255,153,0,.1)' }}>
              <AlertTriangle size={20} color="#FF9900" />
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid mt-6">
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title">
              <Eye size={16} color="#FF9900" /> GuardDuty & Inspector Findings
            </div>
          </div>
          <div className="card-body">
            {findings.length > 0 ? (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Finding</th>
                      <th>Resource</th>
                      <th>Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.slice(0, 15).map((f, i) => (
                      <tr key={i}>
                        <td>
                          <span className={`severity-badge ${f.severity === 'CRITICAL' ? 'p1' : f.severity === 'HIGH' ? 'p2' : 'p3'}`}>
                            {f.severity}
                          </span>
                        </td>
                        <td>{f.title || f.description || 'Unknown Finding'}</td>
                        <td>{f.resourceId || '—'}</td>
                        <td>{f.accountName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><CheckCircle size={24} color="#107C10" /></div>
                <div className="empty-state-title">No Security Findings</div>
                <div className="empty-state-desc">AWS Security Hub reports zero critical issues.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
