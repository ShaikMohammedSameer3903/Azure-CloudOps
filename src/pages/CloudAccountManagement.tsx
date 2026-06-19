import React, { useEffect, useState, useMemo } from 'react';
import { 
  Cloud, Server, Plus, RefreshCw, Trash2, CheckCircle, AlertTriangle, 
  ShieldCheck, X, Key, Info, Cpu, Play, Terminal, HelpCircle, HardDrive, Loader
} from 'lucide-react';
import { api } from '../services/api';
import { useCloudStore } from '../store/cloudStore';
import { useMsal } from '@azure/msal-react';
import { useAppStore } from '../store/appStore';

export default function CloudAccountManagement() {
  const { cloudAccounts, setCloudAccounts } = useCloudStore();
  const { setSubscriptions } = useAppStore();
  const [loading, setLoading] = useState(false);
  const { instance } = useMsal();

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'azure' | 'aws' | 'gcp' | null>(null);
  const [awsTab, setAwsTab] = useState<'role' | 'keys'>('role');
  const [azureTab, setAzureTab] = useState<'msal' | 'manual'>('msal');

  // Form States
  const [formData, setFormData] = useState<Record<string, string>>({
    region: 'us-east-1',
    authType: 'MSAL'
  });
  const [discoveredAzure, setDiscoveredAzure] = useState<any[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  
  // Connection Test States
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Status Alerts
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Edit Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  
  // Details Modal States
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsAccount, setDetailsAccount] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const handleEditClick = async (id: string) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const acc = await api.get<any>(`/api/cloud-accounts/${id}`);
      setEditingAccountId(id);
      setEditFormData({
        accountName: acc.accountName || '',
        region: acc.region || '',
        roleArn: acc.roleArn || '',
        externalId: '', 
        accessKeyId: acc.provider === 'azure' ? (acc.accessKeyId || '') : '', 
        secretAccessKey: '', 
        azureTenantId: acc.azureTenantId || '',
        subscriptionId: acc.subscriptionId || '',
        accountId: acc.accountId || '',
        projectId: acc.accountId || '', 
        serviceAccountJson: '', 
        provider: acc.provider,
      });
      setShowEditModal(true);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to load cloud account config.');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccountId) return;
    setLoading(true);
    setErrorMessage('');

    try {
      const payload: Record<string, any> = {
        accountName: editFormData.accountName,
        region: editFormData.region,
      };

      if (editFormData.provider === 'azure') {
        payload.subscriptionId = editFormData.subscriptionId;
        payload.azureTenantId = editFormData.azureTenantId;
        payload.clientId = editFormData.accessKeyId;
        if (editFormData.secretAccessKey) {
          payload.clientSecret = editFormData.secretAccessKey;
        }
      } else if (editFormData.provider === 'aws') {
        payload.accountId = editFormData.accountId;
        payload.roleArn = editFormData.roleArn;
        if (editFormData.externalId) payload.externalId = editFormData.externalId;
        if (editFormData.accessKeyId) payload.accessKeyId = editFormData.accessKeyId;
        if (editFormData.secretAccessKey) payload.secretAccessKey = editFormData.secretAccessKey;
      } else if (editFormData.provider === 'gcp') {
        payload.projectId = editFormData.projectId;
        if (editFormData.serviceAccountJson) {
          payload.serviceAccountJson = editFormData.serviceAccountJson;
        }
      }

      await api.put(`/api/cloud-accounts/${editingAccountId}`, payload);
      setSuccessMessage(`Account "${editFormData.accountName}" updated successfully!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      
      setShowEditModal(false);
      setEditingAccountId(null);
      setEditFormData({});
      await fetchAccounts();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to update account.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (id: string, name: string) => {
    setLoadingDetails(true);
    setDetailsAccount(null);
    setShowDetailsModal(true);
    try {
      const acc = await api.get<any>(`/api/cloud-accounts/${id}`);
      const fullAcc = cloudAccounts.find(a => a.id === id);
      setDetailsAccount({
        ...acc,
        account_name: name,
        created_at: fullAcc?.created_at,
        last_sync: (fullAcc as any)?.last_sync,
        status: fullAcc?.status,
        resource_count: (fullAcc as any)?.resource_count,
        connected_by_email: (fullAcc as any)?.connected_by_email,
        connected_by_name: (fullAcc as any)?.connected_by_name,
      });
    } catch (err: any) {
      console.error(err);
      setShowDetailsModal(false);
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to fetch account details.');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const accounts = await api.get<any[]>('/api/cloud-accounts');
      setCloudAccounts(accounts);
      
      // Also sync azure subscriptions in AppStore
      const subs = await api.get<any[]>('/api/subscriptions');
      setSubscriptions(subs);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleDisconnect = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to disconnect cloud account "${name}"? This will remove all associated resource metrics, backups, and dashboards.`)) {
      return;
    }
    setLoading(true);
    try {
      await api.delete(`/api/cloud-accounts/${id}`);
      setSuccessMessage(`Account "${name}" disconnected successfully.`);
      setTimeout(() => setSuccessMessage(''), 4000);
      await fetchAccounts();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to disconnect account.');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (id: string, name: string) => {
    setTestingId(id);
    setTestResult(null);
    setShowTestModal(true);
    try {
      const res = await api.post<any>(`/api/cloud-accounts/${id}/test`);
      setTestResult({
        accountName: name,
        ...res
      });
    } catch (err: any) {
      setTestResult({
        accountName: name,
        connected: false,
        error: err.response?.data?.message || err.response?.data?.error || err.message || 'Connection timeout.'
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleSyncAccount = async (id: string, name: string) => {
    setSyncingId(id);
    try {
      await api.post(`/api/cloud-accounts/${id}/sync`);
      setSuccessMessage(`Sync job triggered in background for "${name}". Monitor status in activities panel.`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || err.message || 'Sync trigger failed.');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setSyncingId(null);
    }
  };

  // Azure MSAL auto discovery
  const handleAzureMsalDiscover = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await instance.loginPopup({ scopes: ['https://management.azure.com/user_impersonation'] });
      const token = res.accessToken;
      
      const subRes = await fetch('https://management.azure.com/subscriptions?api-version=2020-01-01', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const subData = await subRes.json();
      
      if (subData.value && subData.value.length > 0) {
        setDiscoveredAzure(subData.value);
        setSelectedSubs(subData.value.map((s: any) => s.subscriptionId)); // default select all
      } else {
        setErrorMessage('No Azure subscriptions found associated with this Microsoft identity.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to authenticate via Microsoft popup.');
    } finally {
      setLoading(false);
    }
  };

  const submitAzureMsalDiscovery = async () => {
    setLoading(true);
    try {
      const payloads = selectedSubs.map(subId => {
        const sub = discoveredAzure.find(s => s.subscriptionId === subId);
        return {
          subscriptionId: sub.subscriptionId,
          azureTenantId: sub.tenantId,
          accountName: sub.displayName,
          authType: 'MSAL'
        };
      });

      await Promise.all(payloads.map(payload => api.post('/api/cloud-accounts/azure', payload)));
      setSuccessMessage(`Connected ${payloads.length} Azure subscriptions successfully!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      
      setShowAddModal(false);
      resetModalState();
      await fetchAccounts();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to connect subscription(s).');
    } finally {
      setLoading(false);
    }
  };

  // Generic Manual Addition
  const handleManualConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProvider) return;
    setLoading(true);
    setErrorMessage('');

    try {
      const payload: Record<string, any> = { ...formData };
      if (activeProvider === 'aws') {
        payload.authMethod = awsTab;
      }
      
      await api.post(`/api/cloud-accounts/${activeProvider}`, payload);
      setSuccessMessage(`${activeProvider.toUpperCase()} account "${formData.accountName || formData.projectId}" connected successfully!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      
      setShowAddModal(false);
      resetModalState();
      await fetchAccounts();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.response?.data?.error || err.message || 'Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const resetModalState = () => {
    setActiveProvider(null);
    setAwsTab('role');
    setAzureTab('msal');
    setFormData({ region: 'us-east-1', authType: 'MSAL' });
    setDiscoveredAzure([]);
    setSelectedSubs([]);
    setErrorMessage('');
  };

  return (
    <div className="page-container" style={{ animation: 'pageFadeIn 0.3s ease both' }}>
      {/* Notifications */}
      {successMessage && (
        <div className="alert alert-success" style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-error" style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-header-content">
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cloud size={28} color="var(--azure-600)" />
            Cloud Accounts
          </h1>
          <p className="page-subtitle" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Establish credentials, verify APIs, and configure target cloud settings.
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={fetchAccounts} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38 }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Reload
          </button>
          <button className="btn btn-primary" onClick={() => { resetModalState(); setShowAddModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38 }}>
            <Plus size={16} />
            Connect Account
          </button>
        </div>
      </div>

      {/* Warning if any account has failed discovery */}
      {cloudAccounts.some(acc => acc.status === 'Failed') && (
        <div style={{ padding: '12px 18px', background: 'rgba(209, 52, 56, 0.08)', border: '1px solid rgba(209, 52, 56, 0.15)', borderRadius: 8, color: '#D13438', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, fontSize: 13.5 }}>
          <AlertTriangle size={18} />
          <span>
            <strong>Attention required:</strong> One or more cloud accounts failed latest resource discovery cycle. Click the connection check icon (<ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />) to audit permissions.
          </span>
        </div>
      )}

      {/* Cloud Accounts List Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {cloudAccounts.length === 0 ? (
          <div style={{ padding: '80px 40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Cloud size={64} style={{ margin: '0 auto 20px', opacity: 0.2 }} />
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: 16, fontWeight: 600 }}>No accounts configured</h3>
            <p style={{ maxWidth: 450, margin: '0 auto 24px', fontSize: 13.5 }}>
              Connect Azure subscriptions, AWS cross-account IAM Roles, or GCP Service accounts to initiate automatic scans and activate multi-cloud telemetry.
            </p>
            <button className="btn btn-primary" onClick={() => { resetModalState(); setShowAddModal(true); }}>
              Connect cloud environment
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Provider</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Account Name</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Tenant / Organization</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Subscription / ID</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Connected By</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Last Sync</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Resources</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>Created Date</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cloudAccounts.map((account) => (
                  <tr key={account.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background var(--transition-fast)' }} className="table-row-hover">
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 6, 
                        background: account.provider === 'azure' ? 'rgba(0,120,212,0.08)' : account.provider === 'aws' ? 'rgba(255,153,0,0.08)' : 'rgba(66,133,244,0.08)', 
                        color: account.provider === 'azure' ? '#0078d4' : account.provider === 'aws' ? '#FF9900' : '#4285F4', 
                        padding: '4px 10px', 
                        borderRadius: 20, 
                        fontSize: 11, 
                        fontWeight: 700, 
                        textTransform: 'uppercase' 
                      }}>
                        <Server size={11} />
                        {account.provider}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {account.account_name}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {account.provider === 'azure' ? ((account as any).azure_tenant_id || 'Interactive Sign-in') : 'N/A'}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {account.subscription_id || account.account_id || (account as any).project_id || 'Global Account'}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 12.5 }}>
                      {(account as any).connected_by_email ? (
                        <div title={(account as any).connected_by_email}>
                          <div style={{ fontWeight: 500 }}>{(account as any).connected_by_name || 'User'}</div>
                          <div style={{ fontSize: 11, opacity: 0.7 }}>{(account as any).connected_by_email}</div>
                        </div>
                      ) : (
                        <span style={{ fontStyle: 'italic', opacity: 0.6 }}>System</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {account.status === 'Failed' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#D13438', fontWeight: 600 }}>
                          <AlertTriangle size={13} /> Failed
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#107C10', fontWeight: 600 }}>
                          <CheckCircle size={13} /> Active
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {(account as any).last_sync ? (
                        new Date((account as any).last_sync).toLocaleString()
                      ) : (
                        <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Never</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, background: 'var(--bg-surface-secondary)', color: 'var(--text-primary)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border-default)' }}>
                        {(account as any).resource_count || 0}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {account.created_at ? new Date(account.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleViewDetails(account.id, account.account_name)} 
                          title="View Details"
                          style={{ padding: '4px 8px', fontSize: 11.5 }}
                        >
                          Details
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleTestConnection(account.id, account.account_name)} 
                          title="Validate API Connectivity"
                          style={{ padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                        >
                          <ShieldCheck size={13} />
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleSyncAccount(account.id, account.account_name)} 
                          disabled={syncingId === account.id}
                          title="Sync Now"
                          style={{ padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                        >
                          <Play size={11} className={syncingId === account.id ? 'animate-spin' : ''} />
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleEditClick(account.id)} 
                          title="Edit Credentials"
                          style={{ padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                        >
                          <Key size={13} />
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleDisconnect(account.id, account.account_name)} 
                          style={{ color: '#D13438', borderColor: 'rgba(209,52,56,0.1)', padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                          title="Disconnect Account"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD ACCOUNT DIALOG MODAL */}
      {showAddModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ width: '100%', maxWidth: activeProvider ? 560 : 780, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 16 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 className="modal-title" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                {activeProvider ? `Connect ${activeProvider.toUpperCase()} Environment` : 'Select Cloud Provider'}
              </h3>
              <button onClick={() => { setShowAddModal(false); resetModalState(); }} style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Step 1: Provider selection card layout */}
            {!activeProvider ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '10px 0' }}>
                {/* Azure Selector */}
                <div 
                  onClick={() => setActiveProvider('azure')}
                  style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-surface-secondary)', transition: 'transform 0.2s' }}
                  className="provider-hover-card"
                >
                  <div style={{ width: 48, height: 48, background: 'rgba(0,120,212,0.1)', color: '#0078d4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Server size={24} />
                  </div>
                  <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Microsoft Azure</h4>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Auto-discover tenants or link via client secrets.</p>
                </div>

                {/* AWS Selector */}
                <div 
                  onClick={() => setActiveProvider('aws')}
                  style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-surface-secondary)', transition: 'transform 0.2s' }}
                  className="provider-hover-card"
                >
                  <div style={{ width: 48, height: 48, background: 'rgba(255,153,0,0.1)', color: '#FF9900', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Cpu size={24} />
                  </div>
                  <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>AWS Account</h4>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Link via AssumeRole policies or IAM credentials.</p>
                </div>

                {/* GCP Selector */}
                <div 
                  onClick={() => setActiveProvider('gcp')}
                  style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-surface-secondary)', transition: 'transform 0.2s' }}
                  className="provider-hover-card"
                >
                  <div style={{ width: 48, height: 48, background: 'rgba(66,133,244,0.1)', color: '#4285F4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Key size={24} />
                  </div>
                  <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Google Cloud</h4>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Connect target projects using Service Account keys.</p>
                </div>
              </div>
            ) : (
              <div>
                {/* Provider-specific Form content */}

                {/* Microsoft Azure forms */}
                {activeProvider === 'azure' && (
                  <div>
                    {/* Azure Tab selection */}
                    <div style={{ display: 'flex', background: 'var(--bg-surface-secondary)', padding: 4, borderRadius: 8, marginBottom: 20 }}>
                      <button 
                        onClick={() => setAzureTab('msal')} 
                        style={{ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 600, borderRadius: 6, background: azureTab === 'msal' ? 'var(--bg-surface)' : 'transparent', color: azureTab === 'msal' ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: azureTab === 'msal' ? 'var(--shadow-xs)' : 'none' }}
                      >
                        Microsoft Sign-In
                      </button>
                      <button 
                        onClick={() => setAzureTab('manual')} 
                        style={{ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 600, borderRadius: 6, background: azureTab === 'manual' ? 'var(--bg-surface)' : 'transparent', color: azureTab === 'manual' ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: azureTab === 'manual' ? 'var(--shadow-xs)' : 'none' }}
                      >
                        Service Principal Secret
                      </button>
                    </div>

                    {azureTab === 'msal' ? (
                      <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        {discoveredAzure.length === 0 ? (
                          <>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
                              Authenticate with Azure Active Directory. We will list all accessible subscriptions.
                            </p>
                            <button className="btn btn-primary" onClick={handleAzureMsalDiscover} disabled={loading} style={{ background: '#0078d4', borderColor: '#0078d4' }}>
                              {loading ? 'Opening Microsoft Auth...' : 'Sign In with Microsoft'}
                            </button>
                          </>
                        ) : (
                          <div style={{ textAlign: 'left' }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>Check target subscriptions to sync:</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', marginBottom: 20 }}>
                              {discoveredAzure.map((sub) => (
                                <label key={sub.subscriptionId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer', background: selectedSubs.includes(sub.subscriptionId) ? 'rgba(0,120,212,0.03)' : 'transparent' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={selectedSubs.includes(sub.subscriptionId)} 
                                    onChange={() => {
                                      if (selectedSubs.includes(sub.subscriptionId)) {
                                        setSelectedSubs(selectedSubs.filter(id => id !== sub.subscriptionId));
                                      } else {
                                        setSelectedSubs([...selectedSubs, sub.subscriptionId]);
                                      }
                                    }} 
                                  />
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{sub.displayName}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sub.subscriptionId}</div>
                                  </div>
                                </label>
                              ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                              <button className="btn btn-secondary" onClick={() => setDiscoveredAzure([])}>Back</button>
                              <button className="btn btn-primary" onClick={submitAzureMsalDiscovery} disabled={selectedSubs.length === 0 || loading}>
                                {loading ? 'Registering...' : `Connect ${selectedSubs.length} Subscription(s)`}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <form onSubmit={handleManualConnectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="form-group">
                          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Subscription Name</label>
                          <input required type="text" className="form-control" placeholder="e.g. Azure Production" onChange={e => setFormData({ ...formData, accountName: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Subscription ID</label>
                          <input required type="text" className="form-control" placeholder="f47ac10b-58cc-4372-a567-0e02b2c3d479" onChange={e => setFormData({ ...formData, subscriptionId: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Directory (Tenant) ID</label>
                          <input required type="text" className="form-control" placeholder="72f988bf-86f1-41af-91ab-2d7cd011db47" onChange={e => setFormData({ ...formData, azureTenantId: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Application (Client) ID</label>
                          <input required type="text" className="form-control" placeholder="12345678-abcd-1234-abcd-1234567890ab" onChange={e => setFormData({ ...formData, clientId: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Application Client Secret</label>
                          <input required type="password" className="form-control" placeholder="••••••••••••••••" onChange={e => setFormData({ ...formData, clientSecret: e.target.value })} />
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                          <button type="button" className="btn btn-secondary" onClick={() => setActiveProvider(null)}>Back</button>
                          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Validating...' : 'Connect Subscription'}</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* AWS Forms */}
                {activeProvider === 'aws' && (
                  <div>
                    {/* AWS Tab selection */}
                    <div style={{ display: 'flex', background: 'var(--bg-surface-secondary)', padding: 4, borderRadius: 8, marginBottom: 20 }}>
                      <button 
                        onClick={() => setAwsTab('role')} 
                        style={{ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 600, borderRadius: 6, background: awsTab === 'role' ? 'var(--bg-surface)' : 'transparent', color: awsTab === 'role' ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: awsTab === 'role' ? 'var(--shadow-xs)' : 'none' }}
                      >
                        IAM Role ARN (STS)
                      </button>
                      <button 
                        onClick={() => setAwsTab('keys')} 
                        style={{ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 600, borderRadius: 6, background: awsTab === 'keys' ? 'var(--bg-surface)' : 'transparent', color: awsTab === 'keys' ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: awsTab === 'keys' ? 'var(--shadow-xs)' : 'none' }}
                      >
                        IAM Access Keys
                      </button>
                    </div>

                    <form onSubmit={handleManualConnectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div className="form-group">
                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Account Alias Name</label>
                        <input required type="text" className="form-control" placeholder="e.g. AWS Production" onChange={e => setFormData({ ...formData, accountName: e.target.value })} />
                      </div>
                      
                      <div className="form-group">
                        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Target Default Region</label>
                        <input required type="text" className="form-control" defaultValue="us-east-1" onChange={e => setFormData({ ...formData, region: e.target.value || 'us-east-1' })} />
                      </div>

                      {awsTab === 'role' ? (
                        <>
                          <div className="form-group">
                            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>AWS Account ID</label>
                            <input type="text" className="form-control" placeholder="123456789012 (12-digit number)" onChange={e => setFormData({ ...formData, accountId: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>IAM Cross-Account Role ARN</label>
                            <input required type="text" className="form-control" placeholder="arn:aws:iam::123456789012:role/CloudOpsRole" onChange={e => setFormData({ ...formData, roleArn: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>External ID</label>
                            <input type="text" className="form-control" placeholder="Unique token matching role trust policy" onChange={e => setFormData({ ...formData, externalId: e.target.value })} />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="form-group">
                            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Access Key ID</label>
                            <input required type="text" className="form-control" placeholder="AKIAIOSFODNN7EXAMPLE" onChange={e => setFormData({ ...formData, accessKeyId: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Secret Access Key</label>
                            <input required type="password" className="form-control" placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" onChange={e => setFormData({ ...formData, secretAccessKey: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Session Token (Optional)</label>
                            <input type="password" className="form-control" placeholder="For temporary credentials" onChange={e => setFormData({ ...formData, sessionToken: e.target.value })} />
                          </div>
                        </>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setActiveProvider(null)}>Back</button>
                        <button type="submit" className="btn" style={{ background: '#FF9900', color: '#fff', border: 'none' }} disabled={loading}>
                          {loading ? 'Validating...' : 'Connect AWS Account'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* GCP Forms */}
                {activeProvider === 'gcp' && (
                  <form onSubmit={handleManualConnectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="form-group">
                      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>GCP Project Account Alias</label>
                      <input required type="text" className="form-control" placeholder="e.g. GCP Analytics" onChange={e => setFormData({ ...formData, accountName: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>GCP Project ID</label>
                      <input required type="text" className="form-control" placeholder="my-gcp-project-123" onChange={e => setFormData({ ...formData, projectId: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Service Account JSON key contents</label>
                      <textarea required className="form-control" rows={6} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} placeholder='{"type": "service_account", "project_id": "...", ...}' onChange={e => setFormData({ ...formData, serviceAccountJson: e.target.value })} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setActiveProvider(null)}>Back</button>
                      <button type="submit" className="btn" style={{ background: '#4285F4', color: '#fff', border: 'none' }} disabled={loading}>
                        {loading ? 'Validating...' : 'Connect GCP Project'}
                      </button>
                    </div>
                  </form>
                )}

                {errorMessage && (
                  <div className="alert alert-error" style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ wordBreak: 'break-word' }}>{errorMessage}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONNECTION TEST RESULTS MODAL */}
      {showTestModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div className="modal-content" style={{ width: '100%', maxWidth: 480, padding: 24, borderRadius: 16 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="modal-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Connectivity Check Diagnostic
              </h3>
              <button onClick={() => { setShowTestModal(false); setTestResult(null); }} style={{ color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body" style={{ minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {!testResult ? (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <div className="animate-spin" style={{ margin: '0 auto 16px', width: 36, height: 36, border: '3px solid var(--border-default)', borderTopColor: 'var(--azure-600)', borderRadius: '50%' }} />
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>Probing endpoint API interfaces and token validity status...</p>
                </div>
              ) : (
                <div style={{ animation: 'scaleIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.15) both' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div style={{ 
                      width: 44, 
                      height: 44, 
                      borderRadius: '50%', 
                      background: testResult.connected ? 'rgba(16,124,16,0.1)' : 'rgba(209,52,56,0.1)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: testResult.connected ? '#107C10' : '#D13438'
                    }}>
                      {testResult.connected ? <CheckCircle size={22} /> : <AlertTriangle size={22} />}
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>
                        {testResult.connected ? 'Connection Success' : 'Connection Failed'}
                      </h4>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Target Account: {testResult.accountName}</p>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 16, fontSize: 13, marginBottom: 20 }}>
                    {testResult.connected ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Resolved Account ID</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{testResult.accountId || 'n/a'}</span>
                        </div>
                        {testResult.arn && (
                          <div>
                            <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Validated Identity ARN</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{testResult.arn}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#107C10', fontWeight: 600, fontSize: 12, marginTop: 4 }}>
                          <CheckCircle size={14} /> Full Read/Write operations authorized.
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ color: '#D13438', fontWeight: 600, fontSize: 13 }}>
                          Diagnostic Code: {testResult.error?.code || 'VALIDATION_FAILED'}
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.4, margin: 0 }}>
                          {testResult.error || 'The connection probe failed. The cloud provider rejected the credentials or API requests timed out.'}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {!testResult.connected && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(251,185,0,0.06)', border: '1px solid rgba(251,185,0,0.15)', borderRadius: 8, padding: 12, fontSize: 12, color: '#7a5a00' }}>
                      <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ margin: 0, lineHeight: 1.4 }}>
                        Verify that trust policies allow AssumeRole actions, or verify key credentials validity and region parameters.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => { setShowTestModal(false); setTestResult(null); }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    {/* EDIT CREDENTIALS DIALOG MODAL */}
      {showEditModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 16 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 className="modal-title" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                Edit {editFormData.provider?.toUpperCase()} Credentials
              </h3>
              <button onClick={() => { setShowEditModal(false); setEditingAccountId(null); setEditFormData({}); }} style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Account Alias Name</label>
                <input required type="text" className="form-control" value={editFormData.accountName || ''} onChange={e => setEditFormData({ ...editFormData, accountName: e.target.value })} />
              </div>

              {editFormData.provider === 'azure' && (
                <>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Subscription ID</label>
                    <input required type="text" className="form-control" value={editFormData.subscriptionId || ''} onChange={e => setEditFormData({ ...editFormData, subscriptionId: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Directory (Tenant) ID</label>
                    <input required type="text" className="form-control" value={editFormData.azureTenantId || ''} onChange={e => setEditFormData({ ...editFormData, azureTenantId: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Application (Client) ID</label>
                    <input type="text" className="form-control" value={editFormData.accessKeyId || ''} onChange={e => setEditFormData({ ...editFormData, accessKeyId: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>
                      Application Client Secret <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(Leave empty to keep existing)</span>
                    </label>
                    <input type="password" className="form-control" placeholder="••••••••••••••••" value={editFormData.secretAccessKey || ''} onChange={e => setEditFormData({ ...editFormData, secretAccessKey: e.target.value })} />
                  </div>
                </>
              )}

              {editFormData.provider === 'aws' && (
                <>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>Target Default Region</label>
                    <input required type="text" className="form-control" value={editFormData.region || ''} onChange={e => setEditFormData({ ...editFormData, region: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>AWS Account ID</label>
                    <input type="text" className="form-control" value={editFormData.accountId || ''} onChange={e => setEditFormData({ ...editFormData, accountId: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>IAM Cross-Account Role ARN</label>
                    <input type="text" className="form-control" value={editFormData.roleArn || ''} onChange={e => setEditFormData({ ...editFormData, roleArn: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>
                      External ID <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(Leave empty to keep existing)</span>
                    </label>
                    <input type="password" className="form-control" placeholder="••••••••" value={editFormData.externalId || ''} onChange={e => setEditFormData({ ...editFormData, externalId: e.target.value })} />
                  </div>
                  <hr style={{ border: '0', borderTop: '1px solid var(--border-subtle)', margin: '10px 0' }} />
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Alternative IAM Key Access:</p>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>
                      Access Key ID <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(Leave empty to keep existing)</span>
                    </label>
                    <input type="text" className="form-control" placeholder="AKIAIOSFODNN7EXAMPLE" value={editFormData.accessKeyId || ''} onChange={e => setEditFormData({ ...editFormData, accessKeyId: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>
                      Secret Access Key <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(Leave empty to keep existing)</span>
                    </label>
                    <input type="password" className="form-control" placeholder="••••••••••••••••" value={editFormData.secretAccessKey || ''} onChange={e => setEditFormData({ ...editFormData, secretAccessKey: e.target.value })} />
                  </div>
                </>
              )}

              {editFormData.provider === 'gcp' && (
                <>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>GCP Project ID</label>
                    <input required type="text" className="form-control" value={editFormData.projectId || ''} onChange={e => setEditFormData({ ...editFormData, projectId: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, display: 'block' }}>
                      Service Account JSON key contents <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(Leave empty to keep existing)</span>
                    </label>
                    <textarea className="form-control" rows={6} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} placeholder='{"type": "service_account", ...}' value={editFormData.serviceAccountJson || ''} onChange={e => setEditFormData({ ...editFormData, serviceAccountJson: e.target.value })} />
                  </div>
                </>
              )}

              {errorMessage && (
                <div className="alert alert-error" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ wordBreak: 'break-word' }}>{errorMessage}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); setEditingAccountId(null); setEditFormData({}); }} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Validating...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS DIALOG MODAL */}
      {showDetailsModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ width: '100%', maxWidth: 580, padding: 24, borderRadius: 16 }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="modal-title" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={20} color="var(--azure-600)" />
                Cloud Account Specifications
              </h3>
              <button onClick={() => { setShowDetailsModal(false); setDetailsAccount(null); }} style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            {loadingDetails ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Loader className="animate-spin" style={{ margin: '0 auto 16px', width: 36, height: 36, color: 'var(--azure-600)' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>Fetching configuration specifications...</p>
              </div>
            ) : detailsAccount ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header overview */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-secondary)', padding: 14, borderRadius: 10, border: '1px solid var(--border-default)' }}>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: 15, margin: 0, color: 'var(--text-primary)' }}>{detailsAccount.account_name}</h4>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>ID: {detailsAccount.id}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: 4, 
                      fontSize: 11, 
                      fontWeight: 700, 
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: 12,
                      background: detailsAccount.provider === 'azure' ? 'rgba(0,120,212,0.08)' : detailsAccount.provider === 'aws' ? 'rgba(255,153,0,0.08)' : 'rgba(66,133,244,0.08)', 
                      color: detailsAccount.provider === 'azure' ? '#0078d4' : detailsAccount.provider === 'aws' ? '#FF9900' : '#4285F4'
                    }}>
                      {detailsAccount.provider}
                    </span>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: 4, 
                      fontSize: 11, 
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 12,
                      background: detailsAccount.status === 'Failed' ? 'rgba(209,52,56,0.08)' : 'rgba(16,124,16,0.08)',
                      color: detailsAccount.status === 'Failed' ? '#D13438' : '#107C10'
                    }}>
                      {detailsAccount.status === 'Failed' ? 'Failed' : 'Active'}
                    </span>
                  </div>
                </div>

                {/* Main metadata properties */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5 }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Subscription / ID</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{detailsAccount.subscriptionId || detailsAccount.accountId || 'n/a'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Target Default Region</span>
                    <span style={{ color: 'var(--text-primary)' }}>{detailsAccount.region || 'global'}</span>
                  </div>

                  {detailsAccount.provider === 'azure' && (
                    <>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Directory (Tenant) ID</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{detailsAccount.azureTenantId || 'n/a'}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Application (Client) ID</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{detailsAccount.accessKeyId || 'n/a'}</span>
                      </div>
                    </>
                  )}

                  {detailsAccount.provider === 'aws' && (
                    <>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>IAM Cross-Account Role ARN</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{detailsAccount.roleArn || 'n/a'}</span>
                      </div>
                      {detailsAccount.externalId && (
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>External ID</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{detailsAccount.externalId}</span>
                        </div>
                      )}
                      {detailsAccount.accessKeyId && (
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>IAM Access Key ID</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{detailsAccount.accessKeyId}</span>
                        </div>
                      )}
                    </>
                  )}

                  {detailsAccount.provider === 'gcp' && (
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Project ID</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{detailsAccount.accountId || 'n/a'}</span>
                    </div>
                  )}

                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Connected By</span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {detailsAccount.connected_by_email ? `${detailsAccount.connected_by_name || 'User'} (${detailsAccount.connected_by_email})` : 'System Account'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Created Date</span>
                    <span style={{ color: 'var(--text-primary)' }}>{detailsAccount.created_at ? new Date(detailsAccount.created_at).toLocaleString() : 'n/a'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Last Scan / Discovery Sync</span>
                    <span style={{ color: 'var(--text-primary)' }}>{detailsAccount.last_sync ? new Date(detailsAccount.last_sync).toLocaleString() : 'Never'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Total Discovered Resources</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{detailsAccount.resource_count || 0}</span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <ShieldCheck size={18} color="#107C10" />
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Enterprise credentials are encrypted at rest using AES-256-GCM. Active scan cycles execute background policy audit validation audits.
                  </p>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>Specifications load failure.</p>
            )}

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => { setShowDetailsModal(false); setDetailsAccount(null); }}>
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
