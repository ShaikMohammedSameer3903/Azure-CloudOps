// ============================================================
// Threat Hunting Dashboard & Attack Timeline
// All data from backend APIs — NO mock data
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Shield, Target, Activity, ArrowRight, Crosshair, Users, Server, Database, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { useCloudStore } from '../store/cloudStore';
import { useAppStore } from '../store/appStore';
import { api } from '../services/api';

interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  description: string;
  type: 'LOGIN' | 'PRIVILEGE' | 'LATERAL' | 'EXFILTRATION' | 'REMEDIATION';
}

function classifyAlert(alert: any): TimelineEvent['type'] {
  const desc = (alert.description || alert.displayName || '').toLowerCase();
  if (desc.includes('login') || desc.includes('brute') || desc.includes('access') || desc.includes('sign-in')) return 'LOGIN';
  if (desc.includes('privilege') || desc.includes('escalat') || desc.includes('admin') || desc.includes('role')) return 'PRIVILEGE';
  if (desc.includes('lateral') || desc.includes('rdp') || desc.includes('ssh') || desc.includes('movement')) return 'LATERAL';
  if (desc.includes('exfiltrat') || desc.includes('download') || desc.includes('leak') || desc.includes('data')) return 'EXFILTRATION';
  if (desc.includes('remediat') || desc.includes('contain') || desc.includes('quarantin') || desc.includes('disabled')) return 'REMEDIATION';
  return 'LOGIN'; // default category
}

export default function ThreatHuntingDashboard() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);
  const { activeSubscriptionId } = useAppStore();
  
  const fetchAlerts = async () => {
    setLoading(true);
    try {
      if (activeSubscriptionId) {
        const data = await api.get<any>('/api/monitoring/defender', { params: { subscriptionId: activeSubscriptionId } });
        setAlerts(data?.alerts || []);
      }
    } catch (err) {
      console.error('[ThreatHunting] Failed to fetch alerts:', err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, [activeSubscriptionId]);

  const timeline: TimelineEvent[] = useMemo(() => {
    return alerts.map((alert, idx) => {
      const detectedAt = alert.detectedAt ? new Date(alert.detectedAt) : new Date();
      return {
        id: alert.id || String(idx),
        time: detectedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: alert.displayName || alert.alertName || 'Security Alert',
        description: alert.description || 'Detected by Azure Defender',
        type: classifyAlert(alert),
      };
    });
  }, [alerts]);

  const filteredTimeline = useMemo(() => {
    if (!query.trim()) return timeline;
    const q = query.toLowerCase();
    return timeline.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q)
    );
  }, [timeline, query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setTimeout(() => setSearching(false), 400);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Threat Hunting Center</h1>
          <p className="page-subtitle">Proactively search and investigate cross-cloud security events</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchAlerts} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <form onSubmit={handleSearch} className="flex" style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 16, top: 12, color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Search IPs, Users, Resources, or Event IDs across all connected clouds..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 16px 10px 45px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 14
                }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={searching}>
              {searching ? 'Hunting...' : 'Hunt'}
            </button>
          </form>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <span className="badge" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}><Users size={12} /> Compromised Users</span>
            <span className="badge" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}><Server size={12} /> Exposed VMs</span>
            <span className="badge" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}><Database size={12} /> Open Storage</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Attack Timeline */}
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title">Attack Timeline Analysis</div>
            <div className="card-subtitle">{filteredTimeline.length} events from live security alerts</div>
          </div>
          <div className="card-body">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 12 }}>
                {[1,2,3].map(i => <div key={i} className="skeleton skeleton-row" style={{ height: 50, borderRadius: 8 }} />)}
              </div>
            ) : filteredTimeline.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 24px' }}>
                <div className="empty-state-icon"><CheckCircle size={28} color="var(--success-600)" /></div>
                <div className="empty-state-title">No threat events detected</div>
                <div className="empty-state-desc">
                  {alerts.length === 0
                    ? 'No security alerts found in your connected subscriptions.'
                    : 'No events match your search query.'}
                </div>
              </div>
            ) : (
              <div style={{ paddingLeft: 16, borderLeft: '2px solid var(--border-subtle)' }}>
                {filteredTimeline.map((event, index) => (
                  <div key={event.id} style={{ position: 'relative', paddingBottom: index === filteredTimeline.length - 1 ? 0 : 32 }}>
                    {/* Timeline Dot */}
                    <div style={{
                      position: 'absolute',
                      left: -21,
                      top: 0,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: event.type === 'REMEDIATION' ? '#107C10' : '#D13438',
                      border: '2px solid var(--bg-surface)'
                    }} />
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{event.time}</span>
                          <span className="badge" style={{ fontSize: 10, background: 'var(--bg-hover)' }}>{event.type}</span>
                        </div>
                        <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{event.title}</h4>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{event.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Threat Intelligence / Quick Actions */}
        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title">Investigation Tools</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: 12 }}>
                <Crosshair size={16} /> Look up IP in Threat Intel
              </button>
              <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: 12 }}>
                <Target size={16} /> Find Lateral Movement
              </button>
              <button className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: 12 }}>
                <Shield size={16} /> Isolate Affected Assets
              </button>
            </div>
            
            {alerts.length > 0 && (
              <div style={{ marginTop: 24, padding: 16, background: 'rgba(209,52,56,0.05)', borderRadius: 8, border: '1px solid rgba(209,52,56,0.2)' }}>
                <h4 style={{ fontSize: 13, color: '#D13438', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> Critical Findings
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {alerts.length} active security alert{alerts.length !== 1 ? 's' : ''} detected across connected subscriptions.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
