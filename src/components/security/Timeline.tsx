import React from 'react';
import type { SecurityEvent } from '../../types/security';
import { Activity, ShieldAlert, Key, AlertTriangle } from 'lucide-react';

interface Props {
  events: SecurityEvent[];
}

export default React.memo(function Timeline({ events }: Props) {
  const sortedEvents = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8);

  const getIcon = (eventName: string, severity: string) => {
    if (severity === 'CRITICAL') return <ShieldAlert size={16} color="#fff" />;
    if (eventName.includes('Login') || eventName.includes('Key')) return <Key size={16} color="#fff" />;
    if (eventName.includes('Delete') || eventName.includes('Stop')) return <AlertTriangle size={16} color="#fff" />;
    return <Activity size={16} color="#fff" />;
  };

  const getColor = (severity: string) => {
    if (severity === 'CRITICAL') return 'var(--danger-600)';
    if (severity === 'HIGH') return 'var(--warning-500)';
    if (severity === 'MEDIUM') return 'var(--azure-500)';
    return 'var(--success-500)';
  };

  return (
    <div className="timeline" style={{ padding: '8px 0' }}>
      {sortedEvents.length > 0 ? sortedEvents.map((event, index) => (
        <div key={event.id} style={{ display: 'flex', gap: 16, marginBottom: 20, position: 'relative' }}>
          {index !== sortedEvents.length - 1 && (
            <div style={{ position: 'absolute', left: 15, top: 32, bottom: -20, width: 2, background: 'var(--border-subtle)' }} />
          )}
          <div style={{ 
            width: 32, height: 32, borderRadius: '50%', background: getColor(event.severity),
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, flexShrink: 0
          }}>
            {getIcon(event.eventName, event.severity)}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{event.eventName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {event.user} • {event.resource}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {new Date(event.timestamp).toLocaleString()}
            </div>
            {event.remediation && event.remediation.length > 0 && (
              <div style={{ 
                marginTop: 6, padding: '4px 8px', background: 'var(--success-50)', 
                border: '1px solid var(--success-100)', borderRadius: 4, fontSize: 11, color: 'var(--success-700)' 
              }}>
                ↳ Remediated: {event.remediation[0].action}
              </div>
            )}
          </div>
        </div>
      )) : (
        <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0' }}>No timeline events.</div>
      )}
    </div>
  );
});
