import React, { useEffect, useState } from 'react';
import type { SecurityEvent } from '../../types/security';
import { ShieldAlert } from 'lucide-react';

interface Props {
  events: SecurityEvent[];
}

export default React.memo(function LiveAlerts({ events }: Props) {
  const [alerts, setAlerts] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    // Show only the 15 most recent Critical/High events
    const criticalEvents = events
      .filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);
    setAlerts(criticalEvents);
  }, [events]);

  return (
    <div style={{ height: 300, overflowY: 'auto', paddingRight: 8 }} className="custom-scrollbar">
      {alerts.length > 0 ? alerts.map(alert => (
        <div key={alert.id} style={{ 
          padding: 12, border: '1px solid var(--danger-100)', borderRadius: 8, 
          marginBottom: 8, background: alert.severity === 'CRITICAL' ? 'rgba(209,52,56,.05)' : 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <ShieldAlert size={14} color={alert.severity === 'CRITICAL' ? 'var(--danger-600)' : 'var(--warning-500)'} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{alert.eventName}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Detected by <strong style={{ color: 'var(--text-primary)' }}>{alert.source}</strong> in {alert.region}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>Target: {alert.resource}</span>
            <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      )) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
          No critical alerts active.
        </div>
      )}
    </div>
  );
});
