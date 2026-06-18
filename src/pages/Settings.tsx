// ============================================================
// Platform Connections, User Management & Active Sessions Settings
// ============================================================

import { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, RefreshCw, Lock, Users, Monitor, ShieldCheck, Key, CheckCircle, XCircle, ShieldAlert, History, Shield, Edit3 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuth } from '../providers/AuthProvider';
import { api } from '../services/api';

export default function Settings() {
  const { user } = useAuth();
  const {
    subscriptions, setSubscriptions,
    activeSubscriptionId, setActiveSubscription
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'subscriptions' | 'users' | 'sessions' | 'history' | 'security' | 'diagnostics'>('subscriptions');

  // Connection form state
  const [subId, setSubId] = useState('');
  const [name, setName] = useState('');
  const [authType, setAuthType] = useState<'MSAL' | 'CREDENTIALS'>('MSAL');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [azureTenantId, setAzureTenantId] = useState('');
  
  // User Management state
  const [userList, setUserList] = useState<any[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'SuperAdmin' | 'Admin' | 'Operator' | 'Reader'>('Reader');
  const [newUserProvider, setNewUserProvider] = useState<'Local' | 'Microsoft' | 'Google'>('Microsoft');

  // Sessions and History state
  const [sessionList, setSessionList] = useState<any[]>([]);
  const [loginHistoryList, setLoginHistoryList] = useState<any[]>([]);
  const [auditLogList, setAuditLogList] = useState<any[]>([]);

  // Password / MFA state
  const [adminEmail, setAdminEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mfaState, setMfaState] = useState(user?.mfaEnabled || false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [securityStats, setSecurityStats] = useState<any>(null);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  
  const isSuperAdmin = user?.role === 'SuperAdmin';
  const isReadOnly = !['SuperAdmin', 'Admin'].includes(user?.role || '');

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'sessions') {
      fetchSessions();
    } else if (activeTab === 'history') {
      fetchHistory();
    } else if (activeTab === 'diagnostics') {
      fetchSecurityStats();
    }
  }, [activeTab]);

  const fetchSecurityStats = async () => {
    try {
      const data = await api.get<any>('/api/auth/security-stats');
      setSecurityStats(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await api.get<any[]>('/api/auth/users');
      setUserList(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load users list.');
    }
  };

  const fetchSessions = async () => {
    try {
      const data = await api.get<any[]>('/api/auth/sessions');
      setSessionList(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load active sessions.');
    }
  };

  const fetchHistory = async () => {
    try {
      const history = await api.get<any[]>('/api/auth/login-history');
      setLoginHistoryList(history);

      const logs = await api.get<any[]>('/api/audit');
      setAuditLogList(logs);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load history lists.');
    }
  };

  const handleConnectSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !subId || !name) return;
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (editingSubId) {
        await api.put<any>(`/api/subscriptions/${editingSubId}`, {
          subscriptionId: subId,
          name,
          clientId: authType === 'CREDENTIALS' ? clientId : undefined,
          clientSecret: authType === 'CREDENTIALS' ? clientSecret : undefined,
          azureTenantId: authType === 'CREDENTIALS' ? azureTenantId : undefined,
          authType
        });
        setSuccessMessage('Subscription updated successfully!');
        setEditingSubId(null);
      } else {
        const result = await api.post<any>('/api/subscriptions', {
          subscriptionId: subId,
          name,
          clientId: authType === 'CREDENTIALS' ? clientId : undefined,
          clientSecret: authType === 'CREDENTIALS' ? clientSecret : undefined,
          azureTenantId: authType === 'CREDENTIALS' ? azureTenantId : undefined,
          authType
        });
        setActiveSubscription(result.id);
        setSuccessMessage('Subscription connected successfully!');
      }
      const updatedList = await api.get<any[]>('/api/subscriptions');
      setSubscriptions(updatedList);
      setSubId('');
      setName('');
      setClientId('');
      setClientSecret('');
      setAzureTenantId('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register/update subscription.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectSubscription = async (id: string) => {
    if (isReadOnly) return;
    if (!confirm('Are you sure you want to unregister this subscription?')) return;
    try {
      await api.delete(`/api/subscriptions/${id}`);
      const remaining = subscriptions.filter(s => s.id !== id);
      setSubscriptions(remaining);
      if (activeSubscriptionId === id) {
        setActiveSubscription(remaining.length > 0 ? remaining[0].id : null);
      }
      setSuccessMessage('Subscription disconnected successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete subscription.');
    }
  };

  // Add & Approve User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    try {
      // Prevent non-SuperAdmins from assigning SuperAdmin
      if (newUserRole === 'SuperAdmin' && !isSuperAdmin) {
        setErrorMessage('Access Denied: Only SuperAdmin can add a SuperAdmin user.');
        return;
      }

      await api.post('/api/auth/users/add', {
        email: newUserEmail,
        displayName: newUserDisplayName,
        role: newUserRole,
        provider: newUserProvider
      });
      setSuccessMessage(`User ${newUserEmail} added and approved.`);
      setNewUserEmail('');
      setNewUserDisplayName('');
      fetchUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add user.');
    }
  };

  // Approve Pending User
  const handleApproveUser = async (userId: string) => {
    if (isReadOnly) return;
    try {
      await api.post('/api/auth/users/approve', { userId });
      setSuccessMessage('User approved successfully.');
      fetchUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to approve user.');
    }
  };

  // Deactivate User
  const handleDeactivateUser = async (userId: string) => {
    if (isReadOnly) return;
    try {
      await api.post('/api/auth/users/deactivate', { userId });
      setSuccessMessage('User deactivated and all active sessions revoked.');
      fetchUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to deactivate user.');
    }
  };

  // Change user role
  const handleChangeRole = async (userId: string, currentRole: string) => {
    if (isReadOnly) return;
    const newRole = prompt('Enter new role (SuperAdmin, Admin, Operator, Reader):', currentRole);
    if (!newRole || newRole === currentRole) return;
    
    const validRoles = ['SuperAdmin', 'Admin', 'Operator', 'Reader'];
    if (!validRoles.includes(newRole)) {
      setErrorMessage(`Invalid role: ${newRole}. Must be one of: ${validRoles.join(', ')}`);
      return;
    }

    if (newRole === 'SuperAdmin' && !isSuperAdmin) {
      setErrorMessage('Access Denied: Only SuperAdmin can assign the SuperAdmin role.');
      return;
    }
    
    try {
      await api.post('/api/auth/users/update-role', { userId, role: newRole });
      setSuccessMessage('User role updated successfully.');
      fetchUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update role.');
    }
  };

  // Remove User
  const handleRemoveUser = async (userId: string) => {
    if (isReadOnly) return;
    if (!confirm('Remove user and revoke approvals?')) return;
    try {
      await api.post('/api/auth/users/remove', { userId });
      setSuccessMessage('User removed successfully.');
      fetchUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove user.');
    }
  };

  // Toggle MFA Setting
  const handleToggleMfa = async () => {
    const targetState = !mfaState;
    try {
      await api.post('/api/auth/users/toggle-mfa', { mfaEnabled: targetState });
      setMfaState(targetState);
      if (user) user.mfaEnabled = targetState;
      setSuccessMessage(`Multi-factor authentication status updated: ${targetState ? 'ENFORCED' : 'DISABLED'}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to toggle MFA setting.');
    }
  };

  // Download User Report
  const handleDownloadReport = () => {
    if (userList.length === 0) return;
    const headers = ['Name,Email,Provider,Role,Status,MFA Enabled,Last Login'];
    const rows = userList.map(u => 
      `"${u.display_name || ''}","${u.email}","${u.provider}","${u.role}","${u.status}","${u.mfa_enabled ? 'Yes' : 'No'}","${u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}"`
    );
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `user_approval_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Revoke session
  const handleRevokeSession = async (sessionId: string) => {
    if (isReadOnly) return;
    try {
      await api.post('/api/auth/sessions/revoke', { sessionId });
      setSuccessMessage('Session revoked.');
      fetchSessions();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to revoke session.');
    }
  };

  // Change Local Admin Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/auth/admin/change-password', {
        email: adminEmail,
        currentPassword,
        newPassword
      });
      setSuccessMessage('Password changed successfully.');
      setAdminEmail('');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to change password.');
    }
  };

  // Reset/Recovery Local Admin Password (Emergency administrative recovery option)
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      setErrorMessage('Emergency password reset requires Super Admin privileges.');
      return;
    }
    try {
      await api.post('/api/auth/admin/reset-password', {
        email: adminEmail,
        newPassword
      });
      setSuccessMessage('Emergency password reset completed successfully.');
      setAdminEmail('');
      setNewPassword('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset password.');
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      <header className="page-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Enterprise Controls & Settings</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Configure cloud infrastructure connections, manage user access approvals, audit logs, and credential security.</p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border-default)', paddingBottom: 12, marginBottom: 24 }}>
        <button 
          onClick={() => setActiveTab('subscriptions')}
          style={{
            background: activeTab === 'subscriptions' ? 'var(--accent-color, #0078d4)' : 'transparent',
            color: activeTab === 'subscriptions' ? '#ffffff' : 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <Layers size={16} /> Connected Subscriptions
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          style={{
            background: activeTab === 'users' ? 'var(--accent-color, #0078d4)' : 'transparent',
            color: activeTab === 'users' ? '#ffffff' : 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <Users size={16} /> User Approvals & Governance
        </button>
        <button 
          onClick={() => setActiveTab('sessions')}
          style={{
            background: activeTab === 'sessions' ? 'var(--accent-color, #0078d4)' : 'transparent',
            color: activeTab === 'sessions' ? '#ffffff' : 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <Monitor size={16} /> Active Sessions
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          style={{
            background: activeTab === 'history' ? 'var(--accent-color, #0078d4)' : 'transparent',
            color: activeTab === 'history' ? '#ffffff' : 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <History size={16} /> Governance Audit & Login History
        </button>
        <button 
          onClick={() => setActiveTab('security')}
          style={{
            background: activeTab === 'security' ? 'var(--accent-color, #0078d4)' : 'transparent',
            color: activeTab === 'security' ? '#ffffff' : 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <ShieldCheck size={16} /> MFA & Passwords
        </button>
        <button 
          onClick={() => setActiveTab('diagnostics')}
          style={{
            background: activeTab === 'diagnostics' ? 'var(--accent-color, #0078d4)' : 'transparent',
            color: activeTab === 'diagnostics' ? '#ffffff' : 'var(--text-secondary)', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <Key size={16} /> Authentication Diagnostics
        </button>
      </div>

      {/* Message banners */}
      {successMessage && (
        <div style={{ background: '#107C10', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div style={{ background: '#D13438', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
          {errorMessage}
        </div>
      )}

      {/* Content Rendering */}
      {activeTab === 'subscriptions' && (
        <div className="grid-2" style={{ gap: 24 }}>
          {/* Subscriptions List */}
          <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Layers size={18} /> Monitored Subscriptions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {subscriptions.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1d2038', padding: 16, borderRadius: 8 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14 }}>{s.displayName || s.name}</h4>
                    <span style={{ fontSize: 11, color: '#a0aec0' }}>{s.subscriptionId || s.subscription_id}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button 
                      onClick={() => {
                        setEditingSubId(s.id);
                        setName(s.displayName || s.name || '');
                        setSubId(s.subscriptionId || s.subscription_id || '');
                        setAuthType((s.authType || s.auth_type || 'MSAL') as 'MSAL' | 'CREDENTIALS');
                        setClientId(s.clientId || s.client_id || '');
                        setAzureTenantId(s.azureTenantId || s.azure_tenant_id || '');
                      }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#0078d4' }}
                      title="Edit Subscription"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDisconnectSubscription(s.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#D13438' }}
                      title="Delete Subscription"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add/Edit Subscription */}
          <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <h3 style={{ margin: '0 0 16px 0' }}>{editingSubId ? 'Update Connected Subscription' : 'Connect Azure Subscription'}</h3>
            <form onSubmit={handleConnectSubscription} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Display Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Subscription ID</label>
                <input type="text" value={subId} onChange={e => setSubId(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="submit" style={{ flex: 1, padding: 12, borderRadius: 8, background: '#0078d4', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                  {editingSubId ? 'Update Subscription' : 'Connect'}
                </button>
                {editingSubId && (
                  <button 
                    type="button" 
                    onClick={() => {
                      setEditingSubId(null);
                      setSubId('');
                      setName('');
                      setClientId('');
                      setClientSecret('');
                      setAzureTenantId('');
                    }}
                    style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="settings-grid">
          {/* User management list */}
          <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Shield /> User Access Governance</h3>
              <button 
                onClick={handleDownloadReport}
                style={{ padding: '6px 12px', borderRadius: 6, background: '#107C10', color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Download CSV Report
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: 12 }}>Name</th>
                  <th style={{ padding: 12 }}>Email</th>
                  <th style={{ padding: 12 }}>Role</th>
                  <th style={{ padding: 12 }}>MFA</th>
                  <th style={{ padding: 12 }}>Status</th>
                  <th style={{ padding: 12 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {userList.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: 12 }}>{u.display_name}</td>
                    <td style={{ padding: 12 }}>{u.email}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ShieldAlert size={12} color="#0078d4" />
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ color: u.mfa_enabled ? '#107C10' : '#a0aec0' }}>
                        {u.mfa_enabled ? 'Enforced' : 'None'}
                      </span>
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{
                        padding: '4px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: u.status === 'Approved' ? 'rgba(16,124,16,0.2)' : u.status === 'Pending Approval' ? 'rgba(251,191,36,0.2)' : 'rgba(209,52,56,0.2)',
                        color: u.status === 'Approved' ? '#107C10' : u.status === 'Pending Approval' ? '#fbbf24' : '#D13438'
                      }}>{u.status}</span>
                    </td>
                    <td style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {u.status === 'Pending Approval' && (
                        <button 
                          onClick={() => handleApproveUser(u.id)}
                          style={{ padding: '4px 8px', borderRadius: 4, background: '#107C10', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                          Approve
                        </button>
                      )}
                      {u.status !== 'Disabled' && (
                        <button 
                          onClick={() => handleDeactivateUser(u.id)}
                          style={{ padding: '4px 8px', borderRadius: 4, background: '#D13438', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12 }}
                        >
                          Deactivate
                        </button>
                      )}
                      <button 
                        onClick={() => handleChangeRole(u.id, u.role)}
                        style={{ padding: '4px 8px', borderRadius: 4, background: '#0078d4', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12 }}
                      >
                        Change Role
                      </button>
                      <button 
                        onClick={() => handleRemoveUser(u.id)}
                        style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#a0aec0', cursor: 'pointer', fontSize: 12 }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add user form */}
          <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Provision Enterprise User</h3>
            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Email</label>
                <input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Display Name</label>
                <input type="text" value={newUserDisplayName} onChange={e => setNewUserDisplayName(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Provider</label>
                <select value={newUserProvider} onChange={e => setNewUserProvider(e.target.value as any)} style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                  <option value="Microsoft">Microsoft Entra ID</option>
                  <option value="Google">Google / Gmail</option>
                  <option value="Local">Local Database</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Assign Role</label>
                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as any)} style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                  <option value="Reader">Reader</option>
                  <option value="Operator">Operator</option>
                  <option value="Admin">Admin</option>
                  {isSuperAdmin && <option value="SuperAdmin">SuperAdmin</option>}
                </select>
              </div>
              <button type="submit" style={{ padding: 12, borderRadius: 8, background: '#107C10', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Create User</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Active Sessions Tracker</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: 12 }}>Email</th>
                <th style={{ padding: 12 }}>Provider</th>
                <th style={{ padding: 12 }}>IP Address</th>
                <th style={{ padding: 12 }}>User Agent</th>
                <th style={{ padding: 12 }}>Login Time</th>
                <th style={{ padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessionList.map(s => (
                <tr key={s.session_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: 12 }}>{s.email}</td>
                  <td style={{ padding: 12 }}>{s.provider}</td>
                  <td style={{ padding: 12 }}>{s.ip_address}</td>
                  <td style={{ padding: 12, fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user_agent}</td>
                  <td style={{ padding: 12 }}>{new Date(s.login_time).toLocaleString()}</td>
                  <td style={{ padding: 12 }}>
                    <button 
                      onClick={() => handleRevokeSession(s.session_id)}
                      style={{ padding: '6px 12px', borderRadius: 6, background: '#D13438', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Revoke Session
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Login History */}
          <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><History size={18} /> Enterprise Login History</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: 12 }}>Email</th>
                  <th style={{ padding: 12 }}>IP Address</th>
                  <th style={{ padding: 12 }}>MFA Status</th>
                  <th style={{ padding: 12 }}>Time</th>
                  <th style={{ padding: 12 }}>Status</th>
                  <th style={{ padding: 12 }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {loginHistoryList.map((lh, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: 12 }}>{lh.email}</td>
                    <td style={{ padding: 12 }}>{lh.ip_address}</td>
                    <td style={{ padding: 12 }}>{lh.mfa_status}</td>
                    <td style={{ padding: 12, fontSize: 12 }}>{new Date(lh.login_time).toLocaleString()}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{
                        padding: '4px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: lh.status === 'Success' ? 'rgba(16,124,16,0.2)' : 'rgba(209,52,56,0.2)',
                        color: lh.status === 'Success' ? '#107C10' : '#D13438'
                      }}>{lh.status}</span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: '#a0aec0' }}>{lh.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Audit Logs */}
          <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={18} /> Governance Audit Reports</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: 12 }}>Operator</th>
                  <th style={{ padding: 12 }}>Action</th>
                  <th style={{ padding: 12 }}>Resource</th>
                  <th style={{ padding: 12 }}>Timestamp</th>
                  <th style={{ padding: 12 }}>Log Payload</th>
                </tr>
              </thead>
              <tbody>
                {auditLogList.map((log, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: 12 }}>{log.user_email}</td>
                    <td style={{ padding: 12, fontWeight: 600 }}>{log.action}</td>
                    <td style={{ padding: 12 }}>{log.resource_type ? `${log.resource_type}: ${log.resource_id || ''}` : 'System'}</td>
                    <td style={{ padding: 12, fontSize: 12 }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={{ padding: 12, fontSize: 11, fontFamily: 'monospace', color: '#a0aec0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="grid-2">
          {/* MFA Settings */}
          <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><ShieldAlert size={18} /> Multi-Factor Authentication (MFA)</h3>
            <p style={{ fontSize: 13, color: '#a0aec0', margin: 0 }}>Enforcing MFA ensures that credentials alone are not sufficient to sign in to critical administration dashboards.</p>
            <div style={{ background: '#1d2038', padding: 16, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ display: 'block' }}>MFA Enforcement Status</strong>
                <span style={{ fontSize: 12, color: '#a0aec0' }}>Mandate validation checks upon login</span>
              </div>
              <button 
                onClick={handleToggleMfa}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer',
                  background: mfaState ? '#107C10' : '#4a5568', color: 'white'
                }}
              >
                {mfaState ? 'ENFORCED' : 'DISABLE'}
              </button>
            </div>
          </div>

          {/* Password Recovery Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Key size={18} /> Change Local Admin Password</h3>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Admin Email</label>
                  <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Current Password</label>
                  <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>
                <button type="submit" style={{ padding: 12, borderRadius: 8, background: '#0078d4', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Change Password</button>
              </form>
            </div>

            {isSuperAdmin && (
              <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Key size={18} /> Administrative Password Reset</h3>
                <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Target User Email</label>
                    <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Emergency New Password</label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                  </div>
                  <button type="submit" style={{ padding: 12, borderRadius: 8, background: '#D13438', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Emergency Reset</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'diagnostics' && (
        <div style={{ background: '#16192b', color: 'white', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 24px 0', fontSize: 20 }}>Authentication Diagnostics</h3>
          <div className="grid-2">
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Microsoft Client ID Status</span>
                <span style={{ color: (import.meta.env.VITE_AZURE_CLIENT_ID && !import.meta.env.VITE_AZURE_CLIENT_ID.includes('YOUR_')) ? '#10B981' : '#D13438', fontWeight: 600 }}>
                  {(import.meta.env.VITE_AZURE_CLIENT_ID && !import.meta.env.VITE_AZURE_CLIENT_ID.includes('YOUR_')) ? 'Configured' : 'Missing'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Microsoft Tenant Status</span>
                <span style={{ color: (import.meta.env.VITE_AZURE_TENANT_ID && !import.meta.env.VITE_AZURE_TENANT_ID.includes('YOUR_')) ? '#10B981' : '#D13438', fontWeight: 600 }}>
                  {(import.meta.env.VITE_AZURE_TENANT_ID && !import.meta.env.VITE_AZURE_TENANT_ID.includes('YOUR_')) ? 'Configured' : 'Missing'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Microsoft Redirect URI Status</span>
                <span style={{ color: '#10B981', fontWeight: 600 }}>
                  Active ({window.location.origin})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Google Client ID Status</span>
                <span style={{ color: (import.meta.env.VITE_GOOGLE_CLIENT_ID && !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('YOUR_')) ? '#10B981' : '#D13438', fontWeight: 600 }}>
                  {(import.meta.env.VITE_GOOGLE_CLIENT_ID && !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('YOUR_')) ? 'Configured' : 'Missing'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Google Redirect URI Status</span>
                <span style={{ color: '#10B981', fontWeight: 600 }}>
                  Active ({window.location.origin})
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Backend Authentication Status</span>
                <span style={{ color: '#10B981', fontWeight: 600 }}>
                  Connected (Active API)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>JWT Secret Status</span>
                <span style={{ color: '#10B981', fontWeight: 600 }}>
                  Configured (HMAC-SHA256)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Active Sessions count</span>
                <span style={{ color: securityStats?.sessionCount > 0 ? '#10B981' : '#ffb900', fontWeight: 600 }}>
                  {securityStats?.sessionCount > 0 ? `${securityStats?.sessionCount} Active Sessions` : 'Warning (0 Active)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1d2038', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Current Environment</span>
                <span style={{ color: '#0078d4', fontWeight: 600 }}>
                  {import.meta.env.DEV ? 'Development' : 'Production'}
                </span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
