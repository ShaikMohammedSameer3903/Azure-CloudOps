import { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, AlertTriangle, CheckCircle, Server, Database } from 'lucide-react';
import { useCloudStore } from '../../store/cloudStore';
import { api } from '../../services/api';
import LiveBadge, { deriveStatus } from '../../components/common/LiveBadge';
import { fmtNumber } from '../../utils/formatters';

export default function GcpMonitoring() {
  const { cloudAccounts } = useCloudStore();
  const gcpAccounts = cloudAccounts.filter(a => a.provider === 'gcp');
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resResult, incResult] = await Promise.allSettled([
        api.get<any[]>('/api/resources', { params: { provider: 'gcp' } }),
        api.get<any[]>('/api/incidents', { params: { provider: 'gcp' } }),
      ]);
      if (resResult.status === 'fulfilled') setResources(resResult.value || []);
      if (incResult.status === 'fulfilled') setIncidents(incResult.value || []);
      setLastUpdated(new Date().toISOString());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const badgeStatus = deriveStatus(lastUpdated, loading, false, gcpAccounts.length > 0);

  const openIncidents = incidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved');
  const runningResources = resources.filter(r => r.status?.toLowerCase() === 'running' || r.status?.toLowerCase() === 'active' || r.status?.toLowerCase() === 'available').length;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={22} color="#4285F4" /> GCP Monitoring
            <LiveBadge status={badgeStatus} lastUpdated={lastUpdated} />
          </h1>
          <p className="page-subtitle">Resource health and active operations incidents</p>
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
              <div className="kpi-card-accent" style={{ background: openIncidents.length > 0 ? '#D13438' : '#107C10' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Active Incidents</div><div className="kpi-value" style={{ color: openIncidents.length > 0 ? '#D13438' : 'inherit' }}>{openIncidents.length}</div></div>
                <div className="kpi-icon" style={{ background: openIncidents.length > 0 ? 'rgba(209,52,56,.1)' : 'rgba(16,124,16,.1)' }}>
                  {openIncidents.length > 0 ? <AlertTriangle size={20} color="#D13438" /> : <CheckCircle size={20} color="#107C10" />}
                </div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#4285F4' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Healthy Resources</div><div className="kpi-value">{fmtNumber(runningResources)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(66,133,244,.1)' }}><Server size={20} color="#4285F4" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#3b48cc' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Total Resources</div><div className="kpi-value">{fmtNumber(resources.length)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(59,72,204,.1)' }}><Database size={20} color="#3b48cc" /></div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid" style={{ marginTop: 20 }}>
            <div className="card col-span-2">
              <div className="card-header"><div className="card-title"><AlertTriangle size={16} color={openIncidents.length > 0 ? '#D13438' : '#107C10'} /> Active Incidents</div></div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                {openIncidents.length > 0 ? (
                  <div className="insight-list">
                    {openIncidents.map(inc => (
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
                  <div className="empty-state" style={{ padding: '40px 0' }}>
                    <div className="empty-state-icon"><CheckCircle size={32} color="#107C10" /></div>
                    <div className="empty-state-title">No active incidents</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
