// ============================================================
// AWS Reports — Real data export & summary reports
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { FileText, RefreshCw, Download, BarChart3, Shield, DollarSign, Server, Calendar } from 'lucide-react';
import { useCloudStore } from '../../store/cloudStore';
import { api } from '../../services/api';
import LiveBadge, { deriveStatus } from '../../components/common/LiveBadge';
import { fmtNumber, fmtCurrency } from '../../utils/formatters';

export default function AwsReports() {
  const { cloudAccounts } = useCloudStore();
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws');
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<any[]>([]);
  const [costData, setCostData] = useState<any>(null);
  const [securityData, setSecurityData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resResult, costResult, secResult] = await Promise.allSettled([
        api.get<any[]>('/api/resources', { params: { provider: 'aws' } }),
        api.get<any>('/api/monitoring/cost/unified', { params: { provider: 'aws' } }),
        api.get<any>('/api/monitoring/security/unified', { params: { provider: 'aws' } }),
      ]);
      if (resResult.status === 'fulfilled') setResources(resResult.value);
      if (costResult.status === 'fulfilled') setCostData(costResult.value);
      if (secResult.status === 'fulfilled') setSecurityData(secResult.value);
      setLastUpdated(new Date().toISOString());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const badgeStatus = deriveStatus(lastUpdated, loading, false, awsAccounts.length > 0);

  // Resource type summary
  const typeMap = new Map<string, number>();
  resources.forEach(r => {
    const t = r.type || 'Unknown';
    typeMap.set(t, (typeMap.get(t) || 0) + 1);
  });
  const typeEntries = Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1]);

  // Region summary
  const regionMap = new Map<string, number>();
  resources.forEach(r => {
    const reg = r.location || r.region || 'global';
    regionMap.set(reg, (regionMap.get(reg) || 0) + 1);
  });
  const regionEntries = Array.from(regionMap.entries()).sort((a, b) => b[1] - a[1]);

  const exportCSV = () => {
    const rows = [['ID', 'Name', 'Type', 'Region', 'Status', 'Resource Group']];
    resources.forEach(r => {
      rows.push([r.id, r.name, r.type, r.location || r.region || '', r.status || '', r.resourceGroup || '']);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `aws-resources-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={22} color="#FF9900" /> AWS Reports & Analytics
            <LiveBadge status={badgeStatus} lastUpdated={lastUpdated} />
          </h1>
          <p className="page-subtitle">Resource inventory, cost summary, and security reports</p>
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
          {/* Summary KPIs */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#FF9900' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Total Resources</div><div className="kpi-value">{fmtNumber(resources.length)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(255,153,0,.1)' }}><Server size={20} color="#FF9900" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#3b48cc' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Resource Types</div><div className="kpi-value">{typeEntries.length}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(59,72,204,.1)' }}><BarChart3 size={20} color="#3b48cc" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#FFB900' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Monthly Cost</div><div className="kpi-value">{costData ? fmtCurrency(costData.totalCost) : '—'}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(255,185,0,.1)' }}><DollarSign size={20} color="#FFB900" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: securityData?.criticalAlerts > 0 ? '#D13438' : '#107C10' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Security Findings</div><div className="kpi-value">{securityData?.findings?.length ?? '—'}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(16,124,16,.1)' }}><Shield size={20} color={securityData?.criticalAlerts > 0 ? '#D13438' : '#107C10'} /></div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid" style={{ marginTop: 20 }}>
            {/* Resource Types Table */}
            <div className="card col-span-2">
              <div className="card-header"><div className="card-title"><BarChart3 size={16} color="#FF9900" /> Resources by Type</div></div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                <div className="data-table-container" style={{ maxHeight: 400 }}>
                  <table className="data-table">
                    <thead><tr><th>Resource Type</th><th style={{ textAlign: 'right' }}>Count</th><th>Percentage</th></tr></thead>
                    <tbody>
                      {typeEntries.map(([type, count]) => (
                        <tr key={type}>
                          <td style={{ fontSize: 12 }}>{type}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{count}</td>
                          <td style={{ width: '30%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 3, background: '#FF9900', width: `${(count / resources.length) * 100}%` }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 35 }}>{((count / resources.length) * 100).toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* By Region */}
            <div className="card col-span-1">
              <div className="card-header"><div className="card-title"><Calendar size={16} color="#8c4fff" /> Resources by Region</div></div>
              <div className="card-body" style={{ paddingTop: 0, maxHeight: 400, overflowY: 'auto' }}>
                <div className="insight-list">
                  {regionEntries.map(([region, count]) => (
                    <div key={region} className="insight-item">
                      <div className="insight-icon" style={{ background: 'rgba(140,79,255,.1)' }}><Server size={14} color="#8c4fff" /></div>
                      <div className="insight-content">
                        <div className="insight-title" style={{ fontSize: 12 }}>{region}</div>
                        <div className="insight-desc" style={{ fontSize: 10 }}>{count} resources</div>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#8c4fff' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
