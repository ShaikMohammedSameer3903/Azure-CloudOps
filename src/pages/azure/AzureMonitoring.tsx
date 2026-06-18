// ============================================================
// Monitoring Page — Live Azure Monitor metrics and alerts
// ============================================================

import { useEffect, useState } from 'react';
import {
  Activity, RefreshCw, AlertTriangle, CheckCircle,
  Cpu, Wifi, Bell, BarChart2,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAppStore } from '../../store/appStore';
import { api } from '../../services/api';

export default function AzureMonitoring() {
  const { activeSubscriptionId, resources } = useAppStore();
  const [metrics, setMetrics] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedResource, setSelectedResource] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(true);

  // Get VMs and Apps for metric selection
  const monitorableResources = resources.filter(r =>
    r.type?.toLowerCase().includes('virtualmachines') ||
    r.type?.toLowerCase().includes('sites')
  );

  const fetchAlerts = async () => {
    if (!activeSubscriptionId) return;
    setAlertsLoading(true);
    try {
      const data = await api.get<any[]>('/api/monitoring/alerts', {
        params: { subscriptionId: activeSubscriptionId, provider: 'azure' },
      });
      setAlerts(data);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  };

  const fetchMetrics = async (resourceId: string) => {
    if (!activeSubscriptionId || !resourceId) return;
    setLoading(true);
    try {
      const data = await api.get<any>('/api/monitoring/metrics', {
        params: { subscriptionId: activeSubscriptionId, resourceId, provider: 'azure' },
      });
      setMetrics(data);
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, [activeSubscriptionId]);

  useEffect(() => {
    if (selectedResource) fetchMetrics(selectedResource);
  }, [selectedResource]);

  useEffect(() => {
    if (!selectedResource && monitorableResources.length > 0) {
      setSelectedResource(monitorableResources[0].id);
    }
  }, [monitorableResources.length]);

  const cpuData = (metrics || []).map((d: any) => ({
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: d.cpuPercentage ?? null,
    memGB: d.memoryAvailableBytes != null ? +(d.memoryAvailableBytes / 1e9).toFixed(2) : null,
    netIn: d.networkInBytes != null ? +(d.networkInBytes / 1e6).toFixed(2) : null,
    netOut: d.networkOutBytes != null ? +(d.networkOutBytes / 1e6).toFixed(2) : null,
  })).filter((_: any, i: number) => i % 2 === 0); // downsample for readability

  const latestCPU = cpuData[cpuData.length - 1]?.cpu;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Monitoring Center</h1>
          <p className="page-subtitle">Azure Monitor metrics · Live telemetry · Active alerts</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchAlerts}>
            <RefreshCw size={14} /> Refresh Alerts
          </button>
        </div>
      </div>

      {/* Alert Summary Strip */}
      <div className="grid-4 mb-6">
        {[
          { label: 'Critical', count: alerts.filter(a => a.severity === 'Sev0' || a.severity === 'Critical').length, color: '#D13438', icon: AlertTriangle },
          { label: 'High', count: alerts.filter(a => a.severity === 'Sev1' || a.severity === 'High').length, color: '#c05500', icon: AlertTriangle },
          { label: 'Warning', count: alerts.filter(a => a.severity === 'Sev2' || a.severity === 'Warning').length, color: '#FFB900', icon: Bell },
          { label: 'Informational', count: alerts.filter(a => ['Sev3', 'Sev4', 'Informational', 'Low'].includes(a.severity)).length, color: '#0078d4', icon: Bell },
        ].map(item => (
          <div key={item.label} className="kpi-card">
            <div className="kpi-card-accent" style={{ background: item.color, height: 3, position: 'absolute', top: 0, left: 0, right: 0 }} />
            <div className="kpi-card-top">
              <div>
                <div className="kpi-label">{item.label}</div>
                <div className="kpi-value" style={{ color: item.count > 0 ? item.color : 'var(--text-primary)' }}>
                  {alertsLoading ? '…' : item.count}
                </div>
              </div>
              <div className="kpi-icon" style={{ background: `${item.color}18` }}>
                <item.icon size={20} color={item.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Resource Metrics — col 2 */}
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title">
              <BarChart2 size={16} color="var(--azure-600)" />
              Resource Metrics
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {monitorableResources.length > 0 && (
                <div className="select-wrapper" style={{ minWidth: 240 }}>
                  <select
                    className="form-select"
                    style={{ height: 32, fontSize: 12.5 }}
                    value={selectedResource}
                    onChange={e => setSelectedResource(e.target.value)}
                  >
                    {monitorableResources.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {loading && <div className="spinner spinner-sm" />}
            </div>
          </div>
          <div className="card-body">
            {cpuData.length > 0 ? (
              <>
                {/* CPU Chart */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Cpu size={14} color="var(--azure-600)" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>CPU Utilization</span>
                    </div>
                    {latestCPU != null && (
                      <span style={{ fontSize: 18, fontWeight: 800, color: latestCPU > 80 ? '#D13438' : latestCPU > 60 ? '#FFB900' : '#107C10' }}>
                        {latestCPU.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={cpuData}>
                      <defs>
                        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0078d4" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#0078d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--border-default)' }} formatter={(v: any) => [`${v?.toFixed(1)}%`, 'CPU']} />
                      <Area type="monotone" dataKey="cpu" stroke="#0078d4" strokeWidth={2} fill="url(#cpuGrad)" dot={false} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Network Chart */}
                {cpuData.some((d: any) => d.netIn != null) && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Wifi size={14} color="var(--teal-500)" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Network I/O (MB)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={130}>
                      <AreaChart data={cpuData}>
                        <defs>
                          <linearGradient id="netInGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00B7C3" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#00B7C3" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}MB`} />
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--border-default)' }} />
                        <Area type="monotone" dataKey="netIn" name="Network In" stroke="#00B7C3" strokeWidth={2} fill="url(#netInGrad)" dot={false} connectNulls />
                        <Area type="monotone" dataKey="netOut" name="Network Out" stroke="#8b5cf6" strokeWidth={2} fill="transparent" dot={false} connectNulls strokeDasharray="4 2" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><Activity size={28} /></div>
                <div className="empty-state-title">
                  {monitorableResources.length === 0 ? 'No monitorable resources' : loading ? 'Loading metrics…' : 'No metric data available'}
                </div>
                <div className="empty-state-desc">
                  {monitorableResources.length === 0
                    ? 'Discover resources first, then select a VM or App Service to view metrics.'
                    : 'Azure Monitor metrics require Diagnostics Settings or Azure Monitor Agent to be configured on the resource.'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active Alerts — col 1 */}
        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title">
              <Bell size={16} color="var(--warning-500)" />
              Active Alerts
            </div>
            {alerts.length > 0 && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--warning-600)', background: 'var(--warning-50)', padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid rgba(255,185,0,.25)' }}>
                {alerts.length}
              </span>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {alertsLoading ? (
              [...Array(4)].map((_, i) => <div key={i} className="skeleton skeleton-row mb-2" style={{ borderRadius: 8 }} />)
            ) : alerts.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-state-icon"><CheckCircle size={24} color="var(--success-600)" /></div>
                <div className="empty-state-title">No active alerts</div>
                <div className="empty-state-desc">Azure Monitor shows no active alert conditions.</div>
              </div>
            ) : (
              <div className="insight-list">
                {alerts.slice(0, 10).map((alert: any, i: number) => {
                  const sevColor: Record<string, string> = {
                    Sev0: '#D13438', Critical: '#D13438',
                    Sev1: '#c05500', High: '#c05500',
                    Sev2: '#FFB900', Warning: '#FFB900',
                    Sev3: '#0078d4', Sev4: '#0078d4', Informational: '#0078d4', Low: '#0078d4',
                  };
                  const color = sevColor[alert.severity] || '#64748b';
                  return (
                    <div key={alert.id || i} className="insight-item">
                      <div className="insight-icon" style={{ background: `${color}18` }}>
                        <AlertTriangle size={15} color={color} />
                      </div>
                      <div className="insight-content">
                        <div className="insight-title">{alert.name}</div>
                        <div className="insight-desc">{alert.condition || alert.description}</div>
                        <div className="insight-meta">{alert.firedAt ? new Date(alert.firedAt).toLocaleString() : alert.state}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
