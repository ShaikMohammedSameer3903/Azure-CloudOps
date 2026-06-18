// ============================================================
// Incident Management Page Component
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import { Clock, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuth } from '../providers/AuthProvider';
import { api } from '../services/api';

export default function Incidents() {
  const { user } = useAuth();
  const {
    incidents, setIncidents,
    updateIncident,
    activeSubscriptionId,
    isRefreshing, setIsRefreshing
  } = useAppStore();

  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>('ALL');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isReadOnly = ['VIEWER', 'AUDITOR'].includes(user?.role || '');

  const fetchIncidents = async () => {
    setIsRefreshing(true);
    try {
      const data = await api.get<any[]>('/api/incidents');
      // Map database incidents to AppStore format
      const formatted = data.map(inc => {
        // Calculate SLA breached (e.g. 4 hours for Critical, 12 hours for Warning)
        const created = new Date(inc.created_at);
        const limitHours = inc.severity === 'CRITICAL' ? 4 : inc.severity === 'WARNING' ? 12 : 24;
        const deadline = new Date(created.getTime() + limitHours * 60 * 60 * 1000);
        const breached = Date.now() > deadline.getTime() && inc.status !== 'RESOLVED';

        return {
          id: inc.id,
          title: inc.title,
          description: inc.description || '',
          severity: (inc.severity === 'CRITICAL' ? 'P1' : inc.severity === 'WARNING' ? 'P2' : 'P3') as any,
          status: (inc.status === 'ACTIVE' ? 'Open' : inc.status === 'ACKNOWLEDGED' ? 'InProgress' : 'Resolved') as any,
          createdBy: 'System Monitor',
          createdByName: 'Azure Monitor',
          createdAt: inc.created_at,
          updatedAt: inc.created_at,
          slaDeadline: deadline.toISOString(),
          slaBreached: breached,
          relatedResourceId: inc.resource_id,
          relatedResourceName: inc.resource_name || 'Azure Resource',
          tags: [inc.category],
          timeline: []
        };
      });
      setIncidents(formatted);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [activeSubscriptionId]);

  // Actions
  const handleAcknowledge = async (id: string) => {
    if (isReadOnly) return;
    setActionLoading(id);
    try {
      await api.post(`/api/incidents/${id}/acknowledge`);
      updateIncident(id, { status: 'InProgress' as any });
    } catch (err) {
      console.error('Failed to acknowledge incident:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (id: string) => {
    if (isReadOnly) return;
    setActionLoading(id);
    try {
      await api.post(`/api/incidents/${id}/resolve`);
      updateIncident(id, { status: 'Resolved' as any, resolvedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Failed to resolve incident:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      if (filter === 'ALL') return true;
      if (filter === 'ACTIVE') return inc.status === 'Open';
      if (filter === 'ACKNOWLEDGED') return inc.status === 'InProgress';
      if (filter === 'RESOLVED') return inc.status === 'Resolved';
      return true;
    });
  }, [incidents, filter]);

  return (
    <div>
      <header className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Operational Alarms & Incidents</h1>
          <p className="page-subtitle">
            Acknowledge and resolve security, cost, and availability alert tickets.
          </p>
        </div>

        <button 
          className="btn btn-secondary btn-sm"
          onClick={fetchIncidents}
          disabled={isRefreshing}
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {/* Filters bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { id: 'ALL', label: 'All tickets', count: incidents.length },
          { id: 'ACTIVE', label: 'Active', count: incidents.filter(i => i.status === 'Open').length },
          { id: 'ACKNOWLEDGED', label: 'Acknowledged', count: incidents.filter(i => i.status === 'InProgress').length },
          { id: 'RESOLVED', label: 'Resolved', count: incidents.filter(i => i.status === 'Resolved').length },
        ].map(item => (
          <button 
            key={item.id}
            className={`btn ${filter === item.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setFilter(item.id as any)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {item.label}
            <span style={{
              background: filter === item.id ? 'white' : 'var(--bg-surface-tertiary)',
              color: filter === item.id ? 'var(--azure-600)' : 'var(--text-secondary)',
              borderRadius: 'var(--radius-full)',
              padding: '1px 6px', fontSize: 10.5, fontWeight: 700
            }}>{item.count}</span>
          </button>
        ))}
      </div>

      {/* Incidents list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 16 }} />
          ))
        ) : filteredIncidents.length > 0 ? (
          filteredIncidents.map(inc => {
            const isCritical = inc.severity === 'P1';
            const isResolved = inc.status === 'Resolved';
            const isOpen = inc.status === 'Open';
            const isInProgress = inc.status === 'InProgress';
            const borderLeftColor = isCritical ? 'var(--danger-600)' : 'var(--warning-500)';
            
            return (
              <div 
                className="card"
                key={inc.id}
                style={{ borderLeft: `4px solid ${borderLeftColor}` }}
              >
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={`severity-badge ${isCritical ? 'critical' : 'warning'}`}>
                          {isCritical ? 'CRITICAL' : 'WARNING'}
                        </span>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{inc.title}</h3>
                      </div>
                      <p style={{ margin: '8px 0 16px', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {inc.description}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                      <Clock size={12} />
                      <span>{new Date(inc.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, background: 'var(--bg-surface-secondary)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                        Resource: <strong>{inc.relatedResourceName}</strong>
                      </span>
                      <span style={{ fontSize: 11.5, background: 'var(--bg-surface-secondary)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                        Category: <strong>{inc.tags[0]}</strong>
                      </span>
                      {inc.slaBreached && (
                        <span className="severity-badge critical" style={{ fontSize: 10.5 }}>SLA BREACHED</span>
                      )}
                      {!inc.slaBreached && !isResolved && (
                        <span className="severity-badge info" style={{ fontSize: 10.5 }}>
                          SLA Deadline: {new Date(inc.slaDeadline).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      {isOpen && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={isReadOnly || actionLoading === inc.id}
                          onClick={() => handleAcknowledge(inc.id)}
                        >
                          Acknowledge
                        </button>
                      )}
                      {(isOpen || isInProgress) && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={isReadOnly || actionLoading === inc.id}
                          onClick={() => handleResolve(inc.id)}
                        >
                          Resolve Ticket
                        </button>
                      )}
                      {isResolved && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success-600)', fontWeight: 600, fontSize: 13.5 }}>
                          <CheckCircle2 size={16} />
                          <span>Resolved</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><CheckCircle2 size={32} color="var(--success-600)" /></div>
            <div className="empty-state-title">No incidents found</div>
            <div className="empty-state-desc">No active incidents found matching the selected filter criteria.</div>
          </div>
        )}
      </div>
    </div>
  );
}
