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
import { useProvider } from '../../context/ProviderContext';
import { api } from '../../services/api';

export default function AwsMonitoring() {
  const { resources } = useAppStore();
  const { selectedProvider } = useProvider();
  const [metrics, setMetrics] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedResource, setSelectedResource] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(true);

  // AWS specific monitorable resources
  const monitorableResources = resources.filter(r =>
    (r.provider === 'aws') &&
    (r.type?.toLowerCase().includes('ec2') ||
     r.type?.toLowerCase().includes('rds') ||
     r.type?.toLowerCase().includes('lambda') ||
     r.type?.toLowerCase().includes('s3'))
  );

  const fetchAlerts = async () => {
    setAlertsLoading(true);
    try {
      const data = await api.get<any[]>('/api/monitoring/alerts', {
        params: { provider: 'aws' },
      });
      setAlerts(data);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  };

  const fetchMetrics = async (resourceId: string) => {
    if (!resourceId) return;
    setLoading(true);
    try {
      const data = await api.get<any>('/api/monitoring/metrics', {
        params: { provider: 'aws', resourceId },
      });
      setMetrics(data);
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, []);

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
  })).filter((_: any, i: number) => i % 2 === 0);

  const latestCPU = cpuData[cpuData.length - 1]?.cpu;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">AWS Monitoring Center</h1>
          <p className="page-subtitle">CloudWatch Metrics · EC2 Metrics · AWS Alarms</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchAlerts}>
            <RefreshCw size={14} /> Refresh Alerts
          </button>
        </div>
      </div>

      <div className="grid-4 mb-6">
        {[
          { label: 'Critical', count: alerts.filter(a => a.severity === 'Critical').length, color: '#D13438', icon: AlertTriangle },
          { label: 'High', count: alerts.filter(a => a.severity === 'High').length, color: '#c05500', icon: AlertTriangle },
          { label: 'Warning', count: alerts.filter(a => a.severity === 'Warning').length, color: '#FFB900', icon: Bell },
          { label: 'Informational', count: alerts.filter(a => ['Low', 'Informational'].includes(a.severity)).length, color: '#0078d4', icon: Bell },
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
        <div className="card col-span-2">
          <div className="card-header">
            <div className="card-title">
              <BarChart2 size={16} color="#FF9900" />
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
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Cpu size={14} color="#FF9900" />
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
                          <stop offset="5%" stopColor="#FF9900" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#FF9900" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--border-default)' }} formatter={(v: any) => [`${v?.toFixed(1)}%`, 'CPU']} />
                      <Area type="monotone" dataKey="cpu" stroke="#FF9900" strokeWidth={2} fill="url(#cpuGrad)" dot={false} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><Activity size={28} /></div>
                <div className="empty-state-title">
                  {monitorableResources.length === 0 ? 'No monitorable resources' : loading ? 'Loading metrics…' : 'No metric data available'}
                </div>
                <div className="empty-state-desc">
                  {monitorableResources.length === 0
                    ? 'Discover AWS resources first.'
                    : 'CloudWatch metrics require appropriate IAM roles to be configured on the resource.'}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card col-span-1">
          <div className="card-header">
            <div className="card-title">
              <Bell size={16} color="var(--warning-500)" />
              Active Alarms
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {alertsLoading ? (
              [...Array(4)].map((_, i) => <div key={i} className="skeleton skeleton-row mb-2" style={{ borderRadius: 8 }} />)
            ) : alerts.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-state-icon"><CheckCircle size={24} color="var(--success-600)" /></div>
                <div className="empty-state-title">No active alarms</div>
                <div className="empty-state-desc">CloudWatch shows no active alarm conditions.</div>
              </div>
            ) : (
              <div className="insight-list">
                {alerts.slice(0, 10).map((alert: any, i: number) => {
                  const color = '#D13438';
                  return (
                    <div key={alert.id || i} className="insight-item">
                      <div className="insight-icon" style={{ background: `${color}18` }}>
                        <AlertTriangle size={15} color={color} />
                      </div>
                      <div className="insight-content">
                         <div className="insight-title">{alert.name}</div>
                         <div className="insight-desc">{alert.condition || alert.description}</div>
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
