import { useEffect, useState } from 'react';
import { Shield, Users, Activity, Clock, Search, ShieldCheck, XCircle, Filter, RefreshCw, Key, ArrowRight, UserCheck } from 'lucide-react';
import { api } from '../services/api';
import { API_BASE_URL, CURRENT_ENV } from '../config/environment';

// Check configuration status of providers
const isMicrosoftConfigured = !!(
  import.meta.env.VITE_AZURE_CLIENT_ID &&
  import.meta.env.VITE_AZURE_CLIENT_ID.trim() !== '' &&
  !import.meta.env.VITE_AZURE_CLIENT_ID.includes('YOUR_')
);

const isGoogleConfigured = !!(
  import.meta.env.VITE_GOOGLE_CLIENT_ID &&
  import.meta.env.VITE_GOOGLE_CLIENT_ID.trim() !== '' &&
  !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('YOUR_')
);

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  tenant_id: string;
  provider: string;
  last_login: string;
  status: string;
  mfa_enabled: number;
  created_at: string;
}

interface AuditLog {
  id: number;
  user_email: string;
  action: string;
  timestamp: string;
  ip_address: string;
  user_agent: string;
}

interface Stats {
  totalUsers: number;
  activeUsers: number;
  sessionCount: number;
  failedLogins: number;
  lockedAccounts: number;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Diagnostics state
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagData, setDiagData] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  const fetchDiagnostics = async () => {
    setDiagLoading(true);
    setDiagError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) {
        const res = await response.json();
        const mappedInfo = {
          frontend: 'Healthy',
          backend: res.status === 'healthy' ? 'Healthy' : 'Critical',
          database: res.database === 'connected' ? 'Healthy' : 'Critical',
          azure: isMicrosoftConfigured ? 'Healthy' : 'Warning',
          authentication: res.auth === 'configured' ? 'Healthy' : 'Critical',
          sse: 'Healthy',
          jwtSecret: res.auth === 'configured',
          environment: res.environment || 'Production',
          sessionsCount: 0,
          googleConfigured: isGoogleConfigured,
          details: {
            JWT_SECRET: res.auth === 'configured' ? 'configured' : 'missing',
            AZURE_CLIENT_ID: isMicrosoftConfigured ? 'configured' : 'missing',
            AZURE_TENANT_ID: isMicrosoftConfigured ? 'configured' : 'missing',
            AZURE_CLIENT_SECRET: 'unknown',
            AZURE_SUBSCRIPTION_ID: 'unknown',
            GOOGLE_CLIENT_ID: isGoogleConfigured ? 'configured' : 'missing'
          }
        };
        setDiagData(mappedInfo);
      } else {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
    } catch (e: any) {
      setDiagError(e.message || 'Failed to fetch diagnostic data from backend.');
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    if (showDiagnostics) {
      fetchDiagnostics();
    }
  }, [showDiagnostics]);

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      // Fetch stats
      const statsRes = await api.get<any>('/api/auth/security-stats');
      setStats(statsRes);

      const params: Record<string, string> = {};
      if (searchQuery) params.search = searchQuery;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;

      // Fetch users
      const usersRes = await api.get<UserRow[]>('/api/admin/users', { params });
      setUsers(usersRes);

      // Fetch audit logs
      const logsRes = await api.get<AuditLog[]>('/api/admin/audit-logs');
      setAuditLogs(logsRes);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load administrator dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [roleFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await api.patch(`/api/admin/users/${userId}/role`, { role: newRole });
      setSuccessMessage(`Successfully updated role to ${newRole}`);
      fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update user role.');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    const newStatus = currentStatus === 'Disabled' ? 'Approved' : 'Disabled';
    try {
      await api.patch(`/api/admin/users/${userId}/status`, { status: newStatus });
      setSuccessMessage(`Successfully set user status to ${newStatus}`);
      fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update user status.');
    }
  };

  // Recent visitors lists users sorted by last login
  const recentVisitors = [...users]
    .filter(u => u.last_login)
    .sort((a, b) => new Date(b.last_login).getTime() - new Date(a.last_login).getTime())
    .slice(0, 5);

  const getBrowserName = (userAgent: string) => {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
  };

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: 'white', padding: 24 }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-header-content">
          <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield color="var(--accent-color, #0078d4)" size={32} /> Admin Control Center
          </h1>
          <p className="page-subtitle" style={{ color: '#a0aec0', marginTop: 4 }}>
            System-wide identity configuration, audit monitoring, and role management.
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 12 }}>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => setShowDiagnostics(true)}
            style={{ 
              background: '#1d2038', 
              border: '1px solid rgba(255,255,255,0.1)', 
              color: 'white', 
              padding: '8px 16px', 
              borderRadius: 8, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8 
            }}
          >
            <Activity size={14} />
            System Diagnostics
          </button>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={fetchData} 
            disabled={loading} 
            style={{ 
              background: '#1d2038', 
              border: '1px solid rgba(255,255,255,0.1)', 
              color: 'white', 
              padding: '8px 16px', 
              borderRadius: 8, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8 
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Force Sync
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div style={{ background: 'rgba(209,52,56,0.15)', border: '1px solid rgba(209,52,56,0.3)', color: '#FF8F95', padding: 12, borderRadius: 8, marginBottom: 20 }}>
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div style={{ background: 'rgba(16,124,16,0.15)', border: '1px solid rgba(16,124,16,0.3)', color: '#7FE08B', padding: 12, borderRadius: 8, marginBottom: 20 }}>
          {successMessage}
        </div>
      )}

      {/* Metrics Bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <Users size={16} color="#0078d4" /> TOTAL REGISTERED USERS
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{stats.totalUsers}</div>
          </div>
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <Activity size={16} color="#107C10" /> ACTIVE USERS (24H)
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{stats.activeUsers}</div>
          </div>
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <Clock size={16} color="#FFB900" /> ACTIVE SESSIONS
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{stats.sessionCount}</div>
          </div>
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <XCircle size={16} color="#D13438" /> FAILED LOGINS
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: stats.failedLogins > 0 ? '#FF8F95' : 'white' }}>{stats.failedLogins}</div>
          </div>
        </div>
      )}

      {/* Main Grid: User Management & Visitor Tracker */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 20, marginBottom: 24 }}>
        
        {/* Left Column: User Directory */}
        <div style={{ background: '#16192b', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>User Directory & Permissions</h3>
            
            {/* Search/Filter Bar */}
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search email/name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    background: '#0c0f1d',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '6px 12px 6px 30px',
                    color: 'white',
                    fontSize: 13
                  }}
                />
                <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#a0aec0' }} />
              </div>

              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                style={{
                  background: '#0c0f1d',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  color: 'white',
                  fontSize: 13
                }}
              >
                <option value="">All Roles</option>
                <option value="Admin">Admin</option>
                <option value="User">User</option>
                <option value="Viewer">Viewer</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  background: '#0c0f1d',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  color: 'white',
                  fontSize: 13
                }}
              >
                <option value="">All Statuses</option>
                <option value="Approved">Approved</option>
                <option value="Disabled">Disabled</option>
              </select>

              <button
                type="submit"
                style={{
                  background: 'var(--accent-color, #0078d4)',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Apply
              </button>
            </form>
          </div>

          {/* User Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#a0aec0' }}>
                  <th style={{ padding: '12px 8px' }}>User Details</th>
                  <th style={{ padding: '12px 8px' }}>Identity Provider</th>
                  <th style={{ padding: '12px 8px' }}>Role</th>
                  <th style={{ padding: '12px 8px' }}>Status</th>
                  <th style={{ padding: '12px 8px' }}>Last Log In</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' }}>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontWeight: 600 }}>{u.display_name}</div>
                      <div style={{ fontSize: 11, color: '#a0aec0' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{
                        fontSize: 11,
                        background: u.provider === 'Google' ? 'rgba(66,133,244,0.15)' : 'rgba(0,120,212,0.15)',
                        color: u.provider === 'Google' ? '#4285F4' : '#0078D4',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontWeight: 600
                      }}>
                        {u.provider}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <select
                        value={u.role}
                        onChange={e => handleUpdateRole(u.id, e.target.value)}
                        style={{
                          background: '#0c0f1d',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 4,
                          padding: '4px 8px',
                          color: 'white',
                          fontSize: 12
                        }}
                      >
                        <option value="Admin">Admin</option>
                        <option value="User">User</option>
                        <option value="Viewer">Viewer</option>
                        <option value="SuperAdmin">SuperAdmin</option>
                        <option value="Operator">Operator</option>
                        <option value="Reader">Reader</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: u.status === 'Approved' ? '#107C10' : '#D13438',
                        fontWeight: 700
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.status === 'Approved' ? '#107C10' : '#D13438' }} />
                        {u.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', color: '#a0aec0', fontSize: 12 }}>
                      {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleToggleStatus(u.id, u.status)}
                        style={{
                          background: u.status === 'Disabled' ? 'rgba(16,124,16,0.15)' : 'rgba(209,52,56,0.15)',
                          color: u.status === 'Disabled' ? '#7FE08B' : '#FF8F95',
                          border: `1px solid ${u.status === 'Disabled' ? 'rgba(16,124,16,0.3)' : 'rgba(209,52,56,0.3)'}`,
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {u.status === 'Disabled' ? 'Enable' : 'Disable'}
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#a0aec0' }}>
                      No matching user records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Recent Visitors */}
        <div style={{ background: '#16192b', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCheck size={16} color="#107C10" /> Recent Visitors
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recentVisitors.map(v => (
              <div key={v.id} style={{ background: '#0c0f1d', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ fontWeight: 600, fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{v.email}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#a0aec0' }}>
                  <span>{v.provider}</span>
                  <span>{new Date(v.last_login).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {recentVisitors.length === 0 && (
              <div style={{ color: '#a0aec0', fontSize: 12, textAlign: 'center', padding: 12 }}>
                No visitor data available.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Logs Log Table */}
      <div style={{ background: '#16192b', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={18} color="#FFB900" /> Admin Audit Ledger
        </h3>
        <div style={{ overflowX: 'auto', maxHeight: 300 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#a0aec0' }}>
                <th style={{ padding: '8px' }}>User Email</th>
                <th style={{ padding: '8px' }}>Action Logged</th>
                <th style={{ padding: '8px' }}>Client IP</th>
                <th style={{ padding: '8px' }}>Browser Info</th>
                <th style={{ padding: '8px' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{l.user_email}</td>
                  <td style={{ padding: '8px' }}>{l.action}</td>
                  <td style={{ padding: '8px', color: '#a0aec0', fontFamily: 'monospace' }}>{l.ip_address}</td>
                  <td style={{ padding: '8px', color: '#a0aec0' }}>{getBrowserName(l.user_agent)}</td>
                  <td style={{ padding: '8px', color: '#a0aec0' }}>{new Date(l.timestamp).toLocaleString()}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#a0aec0' }}>
                    No audit records logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diagnostics Panel Modal (For Unauthenticated Troubleshooting) */}
      {showDiagnostics && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 24
        }}>
          <div style={{
            background: '#16192b',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 32,
            maxWidth: 680,
            width: '100%',
            maxHeight: '95vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity color="#0078d4" /> Authentication Diagnostics
              </h2>
              <button
                onClick={fetchDiagnostics}
                disabled={diagLoading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#0078d4',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600
                }}
              >
                <RefreshCw size={14} className={diagLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              {/* Microsoft Status */}
              <div style={{ background: '#1d2038', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#0078d4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}>Microsoft Entra ID</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ color: '#a0aec0' }}>Current Client ID:</span>
                    <span style={{ fontFamily: 'monospace', color: isMicrosoftConfigured ? '#10B981' : '#EF4444', wordBreak: 'break-all' }}>
                      {import.meta.env.VITE_AZURE_CLIENT_ID || 'Missing'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ color: '#a0aec0' }}>Current Tenant ID:</span>
                    <span style={{ fontFamily: 'monospace', color: import.meta.env.VITE_AZURE_TENANT_ID ? '#10B981' : '#EF4444', wordBreak: 'break-all' }}>
                      {import.meta.env.VITE_AZURE_TENANT_ID || 'Missing'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ color: '#a0aec0' }}>Current Redirect URI:</span>
                    <span style={{ fontFamily: 'monospace', color: '#10B981', wordBreak: 'break-all' }}>
                      {window.location.origin}
                    </span>
                  </div>
                </div>
              </div>

              {/* Google Status */}
              <div style={{ background: '#1d2038', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#4285F4', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}>Google OAuth</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Client ID:</span>
                    <span style={{ color: isGoogleConfigured ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                      {isGoogleConfigured ? 'Configured' : 'Missing'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Redirect URI:</span>
                    <span style={{ color: '#10B981', fontWeight: 600 }}>
                      {window.location.origin}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Authorized Origin:</span>
                    <span style={{ color: '#10B981', fontWeight: 600 }}>
                      {window.location.origin}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Backend status panel */}
            <div style={{ background: '#1d2038', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 24 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#107C10', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}>System & Environment</h4>
              
              {diagLoading ? (
                <div style={{ textAlign: 'center', padding: 12, fontSize: 13, color: '#a0aec0' }}>Querying system status...</div>
              ) : diagError ? (
                <div style={{ color: '#EF4444', padding: 8, fontSize: 12 }}>
                  <strong>Error:</strong> {diagError}
                  <div style={{ marginTop: 4, color: '#cbd5e1' }}>Please verify that the backend api server is running at {API_BASE_URL}.</div>
                </div>
              ) : diagData ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Backend Status:</span>
                      <span style={{ color: diagData.backend === 'Healthy' ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                        {diagData.backend}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Database Connection:</span>
                      <span style={{ color: diagData.database === 'Healthy' ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                        {diagData.database}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>JWT Secret Configuration:</span>
                      <span style={{ color: diagData.jwtSecret ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                        {diagData.jwtSecret ? 'Configured' : 'Missing'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Active Sessions:</span>
                      <span style={{ color: '#10B981', fontWeight: 600 }}>
                        Active
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Current Environment:</span>
                      <span style={{ color: '#0078d4', fontWeight: 600 }}>
                        {CURRENT_ENV}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#a0aec0' }}>No diagnostic details retrieved. Click Refresh to probe.</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDiagnostics(false)}
                style={{
                  padding: '10px 24px',
                  background: '#0078d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
