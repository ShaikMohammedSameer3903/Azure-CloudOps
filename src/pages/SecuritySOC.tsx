import React, { useMemo } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import { useSecurityEvents } from '../hooks/useSecurityEvents';

import ThreatSummary from '../components/security/ThreatSummary';
import IncidentTable from '../components/security/IncidentTable';
import SeverityChart from '../components/security/SeverityChart';
import Timeline from '../components/security/Timeline';
import LiveAlerts from '../components/security/LiveAlerts';
import ThreatHeatMap from '../components/security/ThreatHeatMap';
import ProviderDistribution from '../components/security/ProviderDistribution';
import AttackTrendChart from '../components/security/AttackTrendChart';
import TopAttackTypes from '../components/security/TopAttackTypes';

export default function SecuritySOC() {
  const { events, stats, loading, refresh, triggerRemediation } = useSecurityEvents();

  // Sort events so latest are always available to the components
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [events]);

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={24} color="var(--azure-600)" /> Security Operations Center (SOC)
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Enterprise Multi-Cloud Threat Intelligence & Automated Remediation
          </p>
        </div>
        <button 
          onClick={refresh} 
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      <ThreatSummary stats={stats} />

      <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
        <div className="card col-span-2">
          <div className="card-header"><div className="card-title">Attack Volume Trend (12h)</div></div>
          <div className="card-body"><AttackTrendChart events={sortedEvents} /></div>
        </div>
        
        <div className="card">
          <div className="card-header"><div className="card-title">Live Critical Alerts</div></div>
          <div className="card-body" style={{ padding: '8px 16px' }}><LiveAlerts events={sortedEvents} /></div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Severity Breakdown</div></div>
          <div className="card-body"><SeverityChart events={sortedEvents} /></div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Provider Distribution</div></div>
          <div className="card-body"><ProviderDistribution events={sortedEvents} /></div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Top Attack Vectors</div></div>
          <div className="card-body"><TopAttackTypes events={sortedEvents} /></div>
        </div>

        <div className="card col-span-2">
          <div className="card-header"><div className="card-title">Targeted Services Heat Map</div></div>
          <div className="card-body"><ThreatHeatMap events={sortedEvents} /></div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Threat Timeline</div></div>
          <div className="card-body" style={{ padding: '8px 20px', height: '300px', overflowY: 'auto' }}>
            <Timeline events={sortedEvents} />
          </div>
        </div>

        <IncidentTable events={sortedEvents} onRemediate={triggerRemediation} />
      </div>
    </div>
  );
}
