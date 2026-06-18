import { useState, useEffect, useRef } from 'react';
import { useOperationStore } from '../../store/operationStore';
import { useAppStore } from '../../store/appStore';
import { useCloudStore } from '../../store/cloudStore';
import { Activity, Play, Terminal, CheckCircle2, AlertCircle, Clock, Loader2, Sparkles, Search } from 'lucide-react';
import { api } from '../../services/api';

type FilterTab = 'All' | 'Deployments' | 'Security' | 'Costs' | 'Backups' | 'Discovery';

export default function ActivityPanel() {
  const { operations } = useOperationStore();
  const { isRefreshing, lastResourceSync, activityPanelCollapsed, subscriptions, activeSubscriptionId, resources } = useAppStore();
  const { cloudAccounts, selectedProvider } = useCloudStore();
  const [dbOps, setDbOps] = useState<any[]>([]);
  const [scanDuration, setScanDuration] = useState(4.2);
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');

  const loadPastOperations = async () => {
    try {
      const data = await api.get<any[]>('/api/audit', {
        params: { provider: selectedProvider }
      });
      setDbOps(data || []);
    } catch (e) {
      console.error('[ACTIVITY_PANEL] Failed to fetch audit logs:', e);
    }
  };

  useEffect(() => {
    loadPastOperations();
    // Auto refresh every 10 seconds
    const interval = setInterval(loadPastOperations, 10000);

    const handleScanComplete = (e: any) => {
      if (e.detail?.duration) {
        setScanDuration(parseFloat(e.detail.duration));
      }
    };
    window.addEventListener('cloudops-scan-complete', handleScanComplete);
    const saved = localStorage.getItem('cloudops-last-scan-duration');
    if (saved) setScanDuration(parseFloat(saved));

    return () => {
      clearInterval(interval);
      window.removeEventListener('cloudops-scan-complete', handleScanComplete);
    };
  }, []);

  // Sync when store operations change (e.g. immediate deployment triggers)
  useEffect(() => {
    loadPastOperations();
  }, [operations]);

  const activeSub = subscriptions.find(s => s.id === activeSubscriptionId);

  // Determine active cloud account to show in Discovery widget
  let activeCloudAccount: any = null;
  if (selectedProvider === 'aws') {
    activeCloudAccount = cloudAccounts.find(a => a.provider === 'aws');
  } else if (selectedProvider === 'azure' || selectedProvider === 'all') {
    activeCloudAccount = cloudAccounts.find(a => a.provider === 'azure');
  } else if (selectedProvider === 'gcp') {
    activeCloudAccount = cloudAccounts.find(a => a.provider === 'gcp');
  }

  // Fallback to activeSubscriptionId if cloudAccounts is empty but subscriptions exists
  if (!activeCloudAccount && activeSub) {
    activeCloudAccount = {
      id: activeSub.id,
      provider: 'azure',
      accountId: activeSub.subscriptionId || activeSub.id,
      accountName: activeSub.name,
      status: activeSub.status
    };
  } else if (activeCloudAccount) {
    activeCloudAccount = {
      id: activeCloudAccount.id,
      provider: activeCloudAccount.provider,
      accountId: activeCloudAccount.account_id || activeCloudAccount.subscription_id || activeCloudAccount.id,
      accountName: activeCloudAccount.account_name,
      status: activeCloudAccount.status
    };
  }

  const getProviderLabel = () => {
    if (!activeCloudAccount) {
       if (selectedProvider === 'aws') return 'AWS Account Required';
       if (selectedProvider === 'gcp') return 'GCP Project Required';
       return 'Azure Account Required';
    }
    if (activeCloudAccount.provider === 'aws') return 'AWS Account Connected';
    if (activeCloudAccount.provider === 'gcp') return 'GCP Project Connected';
    return 'Azure Subscription Connected';
  };

  const getActionTitle = (action: string) => {
    if (!action) return 'Operational Activity';
    // Friendly formatting for action strings (e.g. USER_LOGIN -> User Login)
    return action
      .toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusColor = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('fail') || act.includes('critical') || act.includes('threat') || act.includes('deny') || act.includes('block')) {
      return '#D13438'; // Error red
    }
    if (act.includes('success') || act.includes('login') || act.includes('complete') || act.includes('remediat') || act.includes('provision')) {
      return '#107C10'; // Success green
    }
    return '#0078D4'; // Info blue
  };

  // Perform categorized filtering
  const filteredOps = dbOps.filter(log => {
    const actionStr = (log.action || '').toLowerCase();
    const typeStr = (log.resource_type || '').toLowerCase();
    const userStr = (log.user_email || '').toLowerCase();
    
    const matchesSearch = 
      actionStr.includes(filterQuery.toLowerCase()) ||
      typeStr.includes(filterQuery.toLowerCase()) ||
      userStr.includes(filterQuery.toLowerCase());
      
    if (!matchesSearch) return false;
    
    if (activeTab === 'All') return true;
    if (activeTab === 'Deployments') {
      return actionStr.includes('create') || actionStr.includes('deploy') || actionStr.includes('delete') || actionStr.includes('provision') || actionStr.includes('remediat');
    }
    if (activeTab === 'Security') {
      return actionStr.includes('security') || actionStr.includes('threat') || actionStr.includes('remediat') || typeStr.includes('security') || typeStr.includes('governance');
    }
    if (activeTab === 'Costs') {
      return actionStr.includes('cost') || actionStr.includes('budget') || typeStr.includes('cost');
    }
    if (activeTab === 'Backups') {
      return actionStr.includes('backup') || actionStr.includes('restore') || typeStr.includes('backup');
    }
    if (activeTab === 'Discovery') {
      return actionStr.includes('discover') || actionStr.includes('scan') || actionStr.includes('poll');
    }
    return true;
  });

  return (
    <div style={{
      width: activityPanelCollapsed ? 0 : 320,
      opacity: activityPanelCollapsed ? 0 : 1,
      pointerEvents: activityPanelCollapsed ? 'none' : 'auto',
      visibility: activityPanelCollapsed ? 'hidden' : 'visible',
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, visibility 0.3s ease',
      background: 'var(--sidebar-bg, #0B1F3A)',
      borderLeft: activityPanelCollapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      flexShrink: 0,
      fontFamily: 'DM Sans, sans-serif',
      color: '#ffffff'
    }}>
      {/* 1. Discovery Scan Status Panel */}
      {cloudAccounts.length > 0 && (
        <div style={{
          padding: 16,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} color="#0078D4" />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Discovery Scan Status
              </span>
            </div>
            {isRefreshing && (
              <span style={{
                fontSize: 9,
                background: 'rgba(0, 120, 212, 0.15)',
                color: '#60a5fa',
                padding: '1px 6px',
                borderRadius: 4,
                fontWeight: 700
              }}>
                Scanning...
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--sidebar-text-muted)' }}>Last Scan:</span>
              <span style={{ fontWeight: 600 }}>
                {lastResourceSync ? new Date(lastResourceSync).toLocaleTimeString() : '17:23:12'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--sidebar-text-muted)' }}>Duration:</span>
              <span style={{ fontWeight: 600 }}>{isRefreshing ? 'Running...' : `${scanDuration}s`}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--sidebar-text-muted)' }}>Resources:</span>
              <span style={{ fontWeight: 600 }}>{activeCloudAccount ? resources.length : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--sidebar-text-muted)' }}>{activeCloudAccount?.provider === 'aws' ? 'Account:' : 'Subscription:'}</span>
              <span style={{ fontWeight: 600, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeCloudAccount ? activeCloudAccount.accountName : 'Not Connected'}>
                {activeCloudAccount ? activeCloudAccount.accountName : 'Not Connected'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--sidebar-text-muted)' }}>Status:</span>
              <span style={{
                fontWeight: 700,
                fontSize: 9.5,
                color: isRefreshing ? '#FFB900' : (activeCloudAccount ? '#107C10' : '#D13438'),
                textTransform: 'uppercase'
              }}>
                {isRefreshing ? 'Running' : getProviderLabel()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Enterprise Activity Timeline */}
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Clock size={14} color="#FFB900" />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Enterprise Activity Log
          </span>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--sidebar-text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search logs..." 
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 10px 5px 24px',
              fontSize: 11.5,
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.25)',
              color: 'white',
              outline: 'none'
            }}
          />
        </div>

        {/* Category Filters tabs */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          marginBottom: 12
        }}>
          {(['All', 'Deployments', 'Security', 'Costs', 'Backups', 'Discovery'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: 9.5,
                padding: '2px 6px',
                borderRadius: 3,
                background: activeTab === tab ? '#0078D4' : 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* List of audit log timeline items */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
          flex: 1,
          paddingRight: 2
        }}>
          {cloudAccounts.length === 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--sidebar-text-muted)', textAlign: 'center', marginTop: 20 }}>
              No Activity Yet<br/><br/>
              Connect a cloud account to begin monitoring.
            </div>
          ) : filteredOps.length > 0 ? (
            filteredOps.map((log) => {
              const color = getStatusColor(log.action);
              return (
                <div key={log.id} style={{
                  position: 'relative',
                  paddingLeft: 14,
                  borderLeft: `2px solid ${color}`
                }}>
                  <div style={{
                    position: 'absolute',
                    left: -5,
                    top: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: color
                  }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600 }}>{getActionTitle(log.action)}</span>
                    <span style={{ fontSize: 9, color: 'var(--sidebar-text-muted)' }}>
                      {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--sidebar-text-muted)', marginTop: 2 }}>
                    {log.resource_type || 'System'} • User: {log.user_email}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--sidebar-text-muted)', textAlign: 'center', marginTop: 20 }}>
              No matching activity recorded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
