import React, { useState } from 'react';
import { Cloud, Lock, Plus, Save, Server, Shield, CheckSquare, Square, ArrowRight } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { api } from '../../services/api';
import { useCloudStore } from '../../store/cloudStore';

export default function CloudOnboarding() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setCloudAccounts } = useCloudStore();
  const { instance } = useMsal();

  // Shared form state
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [discoveredAzure, setDiscoveredAzure] = useState<any[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);

  const fetchAccounts = async () => {
    try {
      const accounts = await api.get<any[]>('/api/cloud-accounts');
      setCloudAccounts(accounts);
      if (accounts.length > 0) {
        window.dispatchEvent(new Event('cloudops-hide-onboarding'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDiscoverAzure = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await instance.loginPopup({ scopes: ['https://management.azure.com/user_impersonation'] });
      const token = res.accessToken;
      
      const subRes = await fetch('https://management.azure.com/subscriptions?api-version=2020-01-01', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const subData = await subRes.json();
      
      if (subData.value && subData.value.length > 0) {
        setDiscoveredAzure(subData.value);
        setSelectedSubs(subData.value.map((s: any) => s.subscriptionId)); // Select all by default
        setActiveModal('azure_discovery');
      } else {
        setError('No Azure Subscriptions found for this account.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate with Azure.');
    } finally {
      setLoading(false);
    }
  };

  const submitAzureDiscovery = async () => {
    setLoading(true);
    try {
      const payloads = selectedSubs.map(subId => {
        const sub = discoveredAzure.find(s => s.subscriptionId === subId);
        return {
          subscriptionId: sub.subscriptionId,
          tenantId: sub.tenantId,
          accountName: sub.displayName,
          // Since we are doing smart discovery and the backend may just use the frontend token or dummy data for now
          // we pass dummy client secret or flag that it's discovered.
          isDiscovered: true
        };
      });

      // Submit all selected
      await Promise.all(payloads.map(p => api.post('/api/cloud-accounts/azure', p)));
      
      await fetchAccounts();
      setActiveModal(null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider: string) => {
    setLoading(true);
    setError('');
    try {
      await api.post(`/api/cloud-accounts/${provider}`, formData);
      await fetchAccounts();
      setActiveModal(null);
      setFormData({});
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'var(--bg-base)', overflowY: 'auto' }}>
      <div style={{ padding: '60px 40px', maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -20 }}>
        <button className="btn btn-secondary" onClick={() => window.dispatchEvent(new Event('cloudops-hide-onboarding'))}>
          Skip for now <ArrowRight size={16} />
        </button>
      </div>

      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'inline-flex', padding: 16, background: 'rgba(0, 120, 212, 0.1)', borderRadius: '50%', marginBottom: 20 }}>
          <Cloud size={48} color="var(--azure-500)" />
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>No Cloud Accounts Connected</h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto' }}>
          Connect your cloud environments to start monitoring resources, security, and costs.
        </p>
        {error && !activeModal && <div className="alert alert-error" style={{ marginTop: 16, maxWidth: 600, margin: '16px auto 0' }}>{error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, textAlign: 'left' }}>
        
        {/* Azure Card */}
        <div className="card" style={{ padding: 24, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 8, background: 'rgba(0,120,212,0.1)', borderRadius: 8 }}><Server color="#0078d4" size={24} /></div>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Microsoft Azure</h3>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, minHeight: 42 }}>
            Auto-discover Tenants and Subscriptions using your Microsoft account.
          </p>
          <button className="btn btn-primary w-full" onClick={handleDiscoverAzure} disabled={loading}>
            <Plus size={16} /> {loading ? 'Discovering...' : 'Connect Azure'}
          </button>
        </div>

        {/* AWS Card */}
        <div className="card" style={{ padding: 24, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 8, background: 'rgba(255,153,0,0.1)', borderRadius: 8 }}><Server color="#FF9900" size={24} /></div>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Amazon Web Services</h3>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, minHeight: 42 }}>
            Connect via IAM Role ARN.
          </p>
          <button className="btn w-full" style={{ background: '#FF9900', color: '#fff', border: 'none' }} onClick={() => setActiveModal('aws')}>
            <Plus size={16} /> Connect AWS
          </button>
        </div>

        {/* GCP Card */}
        <div className="card" style={{ padding: 24, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 8, background: 'rgba(66,133,244,0.1)', borderRadius: 8 }}><Server color="#4285F4" size={24} /></div>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Google Cloud</h3>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, minHeight: 42 }}>
            Connect via Service Account JSON.
          </p>
          <button className="btn w-full" style={{ background: '#4285F4', color: '#fff', border: 'none' }} onClick={() => setActiveModal('gcp')}>
            <Plus size={16} /> Connect GCP
          </button>
        </div>
      </div>

      {/* Azure Discovery Modal */}
      {activeModal === 'azure_discovery' && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3 className="modal-title">Discovered Azure Subscriptions</h3>
            </div>
            <div className="modal-body" style={{ textAlign: 'left', maxHeight: '60vh', overflowY: 'auto' }}>
              <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>We found the following subscriptions. Select the ones you want to connect.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {discoveredAzure.map(sub => (
                  <div key={sub.subscriptionId} 
                       style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer', background: selectedSubs.includes(sub.subscriptionId) ? 'rgba(0,120,212,0.05)' : 'transparent' }}
                       onClick={() => {
                         if (selectedSubs.includes(sub.subscriptionId)) {
                           setSelectedSubs(selectedSubs.filter(id => id !== sub.subscriptionId));
                         } else {
                           setSelectedSubs([...selectedSubs, sub.subscriptionId]);
                         }
                       }}>
                    {selectedSubs.includes(sub.subscriptionId) ? <CheckSquare color="#0078d4" size={20} /> : <Square color="var(--text-tertiary)" size={20} />}
                    <div>
                      <div style={{ fontWeight: 600 }}>{sub.displayName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sub.subscriptionId}</div>
                    </div>
                  </div>
                ))}
              </div>

              {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" onClick={submitAzureDiscovery} disabled={loading || selectedSubs.length === 0}>
                {loading ? 'Connecting...' : `Connect ${selectedSubs.length} Subscriptions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AWS Modal */}
      {activeModal === 'aws' && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">Connect AWS Account</h3>
            </div>
            <div className="modal-body" style={{ textAlign: 'left' }}>
              <div className="form-group">
                <label>Account Alias</label>
                <input type="text" className="form-control" placeholder="e.g. AWS Security" onChange={e => setFormData({ ...formData, accountName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Account ID</label>
                <input type="text" className="form-control" placeholder="123456789012" onChange={e => setFormData({ ...formData, accountId: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Default Region</label>
                <input type="text" className="form-control" placeholder="us-east-1" defaultValue="us-east-1" onChange={e => setFormData({ ...formData, region: e.target.value || 'us-east-1' })} />
              </div>
              <div className="form-group">
                <label>IAM Role ARN (Recommended)</label>
                <input type="text" className="form-control" placeholder="arn:aws:iam::123456789012:role/CloudOpsRole" onChange={e => setFormData({ ...formData, roleArn: e.target.value })} />
              </div>
              <div className="form-group">
                <label>External ID</label>
                <input type="text" className="form-control" placeholder="Optional" onChange={e => setFormData({ ...formData, externalId: e.target.value })} />
              </div>
              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" style={{ background: '#FF9900', border: 'none' }} onClick={() => handleConnect('aws')} disabled={loading}>{loading ? 'Connecting...' : 'Connect Account'}</button>
            </div>
          </div>
        </div>
      )}

      {/* GCP Modal */}
      {activeModal === 'gcp' && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">Connect GCP Project</h3>
            </div>
            <div className="modal-body" style={{ textAlign: 'left' }}>
              <div className="form-group">
                <label>Account Alias</label>
                <input type="text" className="form-control" placeholder="e.g. GCP Analytics" onChange={e => setFormData({ ...formData, accountName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Project ID</label>
                <input type="text" className="form-control" placeholder="my-gcp-project-123" onChange={e => setFormData({ ...formData, projectId: e.target.value })} />
              </div>
              <div className="form-group">
                <label><Lock size={12} style={{ display: 'inline', marginRight: 4 }} />Service Account JSON</label>
                <textarea className="form-control" rows={5} placeholder="{...}" onChange={e => setFormData({ ...formData, serviceAccountJson: e.target.value })} />
              </div>
              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" style={{ background: '#4285F4', border: 'none' }} onClick={() => handleConnect('gcp')} disabled={loading}>{loading ? 'Connecting...' : 'Connect Account'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
