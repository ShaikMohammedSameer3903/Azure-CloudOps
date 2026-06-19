import { useEffect, useState, useCallback } from 'react';
import { DollarSign, RefreshCw, AlertTriangle, Cloud } from 'lucide-react';
import { useCloudStore } from '../../store/cloudStore';
import { api } from '../../services/api';
import LiveBadge, { deriveStatus } from '../../components/common/LiveBadge';
import { fmtCurrency } from '../../utils/formatters';

export default function GcpCost() {
  const { cloudAccounts } = useCloudStore();
  const gcpAccounts = cloudAccounts.filter(a => a.provider === 'gcp');
  const [loading, setLoading] = useState(true);
  const [costData, setCostData] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resResult = await api.get<any>('/api/monitoring/cost/unified', { params: { provider: 'gcp' } });
      setCostData(resResult || null);
      setLastUpdated(new Date().toISOString());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const badgeStatus = deriveStatus(lastUpdated, loading, false, gcpAccounts.length > 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DollarSign size={22} color="#FBBC05" /> GCP Cost Management
            <LiveBadge status={badgeStatus} lastUpdated={lastUpdated} />
          </h1>
          <p className="page-subtitle">Billing and spend analysis across projects</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="kpi-grid">{[...Array(3)].map((_, i) => <div key={i} className="kpi-card"><div className="skeleton" style={{ height: 80, borderRadius: 10 }} /></div>)}</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#FBBC05' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Current Month Spend</div><div className="kpi-value">{fmtCurrency(costData?.totalCost || 0)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(251,188,5,.1)' }}><DollarSign size={20} color="#FBBC05" /></div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-accent" style={{ background: '#4285F4' }} />
              <div className="kpi-card-top">
                <div><div className="kpi-label">Forecast Spend</div><div className="kpi-value">{fmtCurrency(costData?.totalForecast || 0)}</div></div>
                <div className="kpi-icon" style={{ background: 'rgba(66,133,244,.1)' }}><Cloud size={20} color="#4285F4" /></div>
              </div>
            </div>
          </div>

          {costData?.details?.[0]?.costExplorerUnavailable && (
            <div className="card" style={{ marginTop: 20, borderLeft: '4px solid #FF9900' }}>
              <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <AlertTriangle size={24} color="#FF9900" style={{ flexShrink: 0 }} />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Detailed Cost Data Unavailable</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                    {costData.details[0].errorMsg || 'Detailed cost metrics require a BigQuery billing export setup.'}
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
                    To view granular service and region breakdowns, please enable Cloud Billing Export to BigQuery in your Google Cloud Console.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
