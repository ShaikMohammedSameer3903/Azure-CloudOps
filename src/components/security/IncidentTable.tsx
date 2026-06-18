import React, { useState } from 'react';
import type { SecurityEvent } from '../../types/security';
import { ShieldAlert, Check, XCircle, CheckCircle } from 'lucide-react';

interface Props {
  events: SecurityEvent[];
  onRemediate: (id: string) => void;
}

export default React.memo(function IncidentTable({ events, onRemediate }: Props) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleRemediate = async (id: string) => {
    setProcessingId(id);
    await onRemediate(id);
    setProcessingId(null);
  };

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card-header">
        <div className="card-title"><ShieldAlert size={16} /> Security Incident Response</div>
      </div>
      <div className="card-body">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                <th style={{ padding: '12px 8px' }}>Timestamp</th>
                <th>Provider</th>
                <th>Severity</th>
                <th>Event</th>
                <th>Resource</th>
                <th>User / IP</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 10).map(event => (
                <tr key={event.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '12px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {new Date(event.timestamp).toLocaleString()}
                  </td>
                  <td>
                    <span style={{ 
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                      background: event.provider === 'aws' ? 'rgba(255,153,0,0.1)' : 'rgba(0,120,212,0.1)',
                      color: event.provider === 'aws' ? '#FF9900' : '#0078D4'
                    }}>
                      {event.provider}
                    </span>
                  </td>
                  <td>
                    <span className={`severity-badge ${event.severity === 'CRITICAL' ? 'p1' : event.severity === 'HIGH' ? 'p2' : 'p3'}`}>
                      {event.severity}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{event.eventName}</td>
                  <td style={{ fontSize: 13 }}>{event.resource}</td>
                  <td style={{ fontSize: 12 }}>
                    <div>{event.user}</div>
                    <div style={{ color: 'var(--text-tertiary)' }}>{event.ip}</div>
                  </td>
                  <td>
                    <span style={{
                      color: event.status === 'Resolved' ? 'var(--success-600)' : 'var(--danger-600)',
                      fontWeight: 500, fontSize: 12
                    }}>
                      {event.status}
                    </span>
                  </td>
                  <td>
                    {event.status === 'Open' ? (
                      <button 
                        onClick={() => handleRemediate(event.id)}
                        disabled={processingId === event.id}
                        style={{
                          background: 'var(--danger-600)', color: 'white', padding: '6px 12px',
                          borderRadius: 4, fontSize: 12, fontWeight: 500, opacity: processingId === event.id ? 0.5 : 1
                        }}
                      >
                        {processingId === event.id ? 'Remediating...' : 'Remediate'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success-600)', fontSize: 12 }}>
                        <Check size={14} /> Remediated
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>
                    <CheckCircle size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    No active incidents.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
