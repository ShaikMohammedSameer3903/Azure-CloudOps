import { useEffect, useState, useCallback, useMemo } from 'react';
import { Server, RefreshCw, Download, Database, Cloud, HardDrive, Shield } from 'lucide-react';
import { useCloudStore } from '../../store/cloudStore';
import { api } from '../../services/api';
import LiveBadge, { deriveStatus } from '../../components/common/LiveBadge';
import { fmtNumber } from '../../utils/formatters';

export default function GcpResources() {
  const { cloudAccounts } = useCloudStore();
  const gcpAccounts = cloudAccounts.filter(a => a.provider === 'gcp');
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resResult = await api.get<any[]>('/api/resources', { params: { provider: 'gcp' } });
      setResources(resResult || []);
      setLastUpdated(new Date().toISOString());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const badgeStatus = deriveStatus(lastUpdated, loading, false, gcpAccounts.length > 0);

  const exportCSV = () => {
    const rows = [['ID', 'Name', 'Type', 'Location', 'Status', 'Project']];
    resources.forEach(r => {
      rows.push([r.id, r.name, r.type, r.location || '', r.status || '', r.resourceGroup || '']);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `gcp-resources-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const computeCount = resources.filter(r => r.type?.toLowerCase().includes('compute engine')).length;
  const storageCount = resources.filter(r => r.type?.toLowerCase().includes('cloud storage')).length;
  const dbCount = resources.filter(r => r.type?.toLowerCase().includes('sql') || r.resourceGroup?.toLowerCase().includes('database')).length;
  const serverlessCount = resources.filter(r => r.type?.toLowerCase().includes('run') || r.type?.toLowerCase().includes('functions')).length;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Server size={22} color="#4285F4" /> GCP Resource Inventory
            <LiveBadge status={badgeStatus} lastUpdated={lastUpdated} />
          </h1>
          <p className="page-subtitle">Complete inventory of Google Cloud resources</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={exportCSV} disabled={resources.length === 0}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="kpi-grid">{[...Array(4)].map((_, i) => <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 80, borderRadius: 10 }} /></div>)}</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#4285F4' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Compute Engine</div><div className="kpi-value">{fmtNumber(computeCount)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(66,133,244,.1)' }}><Server size={20} color="#4285F4" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#34A853' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Cloud Storage</div><div className="kpi-value">{fmtNumber(storageCount)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(52,168,83,.1)' }}><HardDrive size={20} color="#34A853" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#EA4335' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Databases</div><div className="kpi-value">{fmtNumber(dbCount)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(234,67,53,.1)' }}><Database size={20} color="#EA4335" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#8b5cf6' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Serverless</div><div className="kpi-value">{fmtNumber(serverlessCount)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(139,92,246,.1)' }}><Cloud size={20} color="#8b5cf6" /></div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header"><div className="card-title"><Cloud size={16} color="#4285F4" /> Discovered Resources</div></div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="data-table-container">
                <table className="data-table">
                  <thead><tr><th>Resource Name</th><th>Type</th><th>Location</th><th>Status</th></tr></thead>
                  <tbody>
                    {resources.map((r, i) => (
                      <tr key={r.id || i}>
                        <td><span style={{ fontWeight: 500 }}>{r.name}</span></td>
                        <td>{r.type}</td>
                        <td>{r.location || 'global'}</td>
                        <td>
                          <span className={`status-pill ${r.status?.toLowerCase() === 'running' || r.status?.toLowerCase() === 'active' || r.status?.toLowerCase() === 'available' ? 'active' : r.status?.toLowerCase() === 'disabled' || r.status?.toLowerCase() === 'stopped' ? 'inactive' : 'warning'}`}>
                            {r.status || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {resources.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>No GCP resources discovered</td></tr>
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
