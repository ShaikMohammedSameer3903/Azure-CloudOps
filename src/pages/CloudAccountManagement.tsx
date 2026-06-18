import React, { useEffect, useState } from 'react';
import { Cloud, Server, Plus, RefreshCw, Trash2, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { useCloudStore } from '../store/cloudStore';

export default function CloudAccountManagement() {
  const { cloudAccounts, setCloudAccounts } = useCloudStore();
  const [loading, setLoading] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const accounts = await api.get<any[]>('/api/cloud-accounts');
      setCloudAccounts(accounts);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleDisconnect = async (id: string) => {
    if (!window.confirm('Are you sure you want to disconnect this cloud account? All associated dashboards will lose access.')) return;
    try {
      await api.delete(`/api/cloud-accounts/${id}`);
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to disconnect account:', err);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="page-header-content">
          <h1 className="page-title">Cloud Accounts</h1>
          <p className="page-subtitle">Manage connected Azure, AWS, and GCP environments</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={fetchAccounts} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => window.dispatchEvent(new Event('cloudops-show-onboarding'))}>
            <Plus size={16} /> Connect Account
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {cloudAccounts.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Cloud size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>No Accounts Connected</h3>
            <p>Connect your first cloud account to start analyzing resources.</p>
          </div>
        ) : (
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-secondary)', textAlign: 'left', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Provider</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Account Name</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Identifier</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '16px 24px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cloudAccounts.map(account => (
                <tr key={account.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: account.provider === 'azure' ? 'rgba(0,120,212,0.1)' : account.provider === 'aws' ? 'rgba(255,153,0,0.1)' : 'rgba(66,133,244,0.1)', color: account.provider === 'azure' ? '#0078d4' : account.provider === 'aws' ? '#FF9900' : '#4285F4', padding: '4px 10px', borderRadius: 16, fontSize: 13, fontWeight: 600, textTransform: 'uppercase' }}>
                      <Server size={14} /> {account.provider}
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {account.account_name}
                  </td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: 13 }}>
                    {account.subscription_id || account.account_id || (account as any).project_id || 'Unknown ID'}
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#107C10', fontSize: 13, fontWeight: 600 }}>
                      <CheckCircle size={14} /> Connected
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" title="Test Connection">
                        <ShieldCheck size={14} />
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleDisconnect(account.id)} style={{ color: '#D13438' }} title="Disconnect">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}



