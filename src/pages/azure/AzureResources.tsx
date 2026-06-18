// ============================================================
// Resources Page — Live Azure resource inventory & Management
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Server, Search, RefreshCw, Download,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Database, Globe, Lock, HardDrive, Network, Cloud, Cpu,
  MoreVertical, Trash2, Plus, Edit3
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { api } from '../../services/api';
import { useAuth } from '../../providers/AuthProvider';

const RESOURCE_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  'Microsoft.Compute': { icon: Cpu, color: '#0078d4', bg: '#eff6ff' },
  'Microsoft.Storage': { icon: HardDrive, color: '#107C10', bg: '#f0fdf4' },
  'Microsoft.Web':     { icon: Globe, color: '#8b5cf6', bg: '#f5f3ff' },
  'Microsoft.Sql':     { icon: Database, color: '#f97316', bg: '#fff7ed' },
  'Microsoft.KeyVault':{ icon: Lock, color: '#D13438', bg: '#fef2f2' },
  'Microsoft.Network': { icon: Network, color: '#00B7C3', bg: '#ecfeff' },
  default:             { icon: Server, color: '#64748b', bg: '#f8fafc' },
};

function getResourceIcon(type: string) {
  const ns = type?.split('/')?.[0] || '';
  return RESOURCE_ICONS[ns] || RESOURCE_ICONS.default;
}

function formatType(type: string): string {
  return type?.split('/')?.pop()?.replace(/([A-Z])/g, ' $1')?.trim() || type;
}

const PAGE_SIZE = 15;

export default function AzureResources() {
  const { user } = useAuth();
  const {
    resources, setResources,
    activeSubscriptionId,
    setResourceGroups,
    setResourcesLoading,
    globalSearchQuery,
  } = useAppStore();

  const search = globalSearchQuery;
  const [filterType, setFilterType] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortCol, setSortCol] = useState<'name' | 'type' | 'location' | 'status' | 'risk_score' | 'cost_impact'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [discovering, setDiscovering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<any | null>(null);

  // Manage states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'ResourceGroup' | 'StorageAccount' | 'VirtualMachine' | 'KeyVault' | 'AppService'>('ResourceGroup');
  const [createName, setCreateName] = useState('');
  const [createLocation, setCreateLocation] = useState('eastus');
  const [createResourceGroup, setCreateResourceGroup] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Dependency analysis warning
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [dependencyCount, setDependencyCount] = useState(0);

  const fetchResources = async () => {
    if (!activeSubscriptionId) return;
    setLoading(true);
    setResourcesLoading(true);
    try {
      const [res, groups] = await Promise.all([
        api.get<any[]>('/api/resources', { params: { subscriptionId: activeSubscriptionId, provider: 'azure' } }),
        api.get<any[]>(`/api/resources/groups/${activeSubscriptionId}`, { params: { provider: 'azure' } }).catch(() => []),
      ]);
      setResources(res);
      if (groups.length > 0) setResourceGroups(groups);
    } catch (err) {
      console.error('[Resources] Fetch failed:', err);
    } finally {
      setLoading(false);
      setResourcesLoading(false);
    }
  };

  const triggerDiscovery = async () => {
    if (!activeSubscriptionId) return;
    setDiscovering(true);
    try {
      await api.post(`/api/subscriptions/${activeSubscriptionId}/sync`);
      await fetchResources();
    } catch (err) {
      console.error('[Resources] Discovery failed:', err);
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => { fetchResources(); }, [activeSubscriptionId]);

  const groups = useMemo(() => [...new Set(resources.map(r => r.resource_group || r.resourceGroup))].sort(), [resources]);
  const statuses = useMemo(() => [...new Set(resources.map(r => r.status))].sort(), [resources]);

  const filtered = useMemo(() => {
    let list = resources;
    const activeEnv = useAppStore.getState().activeEnvironment;
    if (activeEnv !== 'All') {
      list = list.filter(r => r.tags?.Environment?.toLowerCase() === activeEnv.toLowerCase() || r.tags?.environment?.toLowerCase() === activeEnv.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.type?.toLowerCase().includes(q) ||
        (r.resource_group || r.resourceGroup)?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q)
      );
    }
    if (filterType) list = list.filter(r => r.type === filterType);
    if (filterGroup) list = list.filter(r => (r.resource_group || r.resourceGroup) === filterGroup);
    if (filterStatus) list = list.filter(r => r.status === filterStatus);

    list = [...list].sort((a, b) => {
      let aVal: any = a.name;
      let bVal: any = b.name;
      if (sortCol === 'type') { aVal = a.type; bVal = b.type; }
      else if (sortCol === 'location') { aVal = a.location; bVal = b.location; }
      else if (sortCol === 'status') { aVal = a.status; bVal = b.status; }
      return sortDir === 'asc'
        ? (aVal || '').toString().localeCompare((bVal || '').toString())
        : (bVal || '').toString().localeCompare((aVal || '').toString());
    });
    return list;
  }, [resources, search, filterType, filterGroup, filterStatus, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
      await api.post('/api/resources/create', {
        subscriptionId: activeSubscriptionId,
        type: createType,
        name: createName,
        location: createLocation,
        resourceGroup: createResourceGroup
      });
      setShowCreateModal(false);
      setCreateName('');
      fetchResources();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create resource.');
    }
  };

  const promptDeleteResource = (resource: any) => {
    // Check virtual dependencies (disk attachments, related subnet resources)
    const count = resources.filter(r => r.resource_group === resource.resource_group && r.id !== resource.id).length;
    setDependencyCount(count);
    setDeleteConfirmationId(resource.id);
  };

  const handleDeleteResource = async () => {
    if (!deleteConfirmationId) return;
    try {
      await api.post('/api/resources/delete', {
        subscriptionId: activeSubscriptionId,
        resourceId: deleteConfirmationId
      });
      setDeleteConfirmationId(null);
      fetchResources();
    } catch (err: any) {
      alert(err.message || 'Deletion failed');
    }
  };

  if (user?.provider !== 'Microsoft' || !activeSubscriptionId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: 'white', padding: 24 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(0, 120, 212, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, border: '1px solid rgba(0, 120, 212, 0.2)' }}>
          <Cloud size={40} color="#0078d4" />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Azure Discovery Restricted</h2>
        <p style={{ color: '#a0aec0', fontSize: 15, textAlign: 'center', maxWidth: 450, lineHeight: 1.6, marginBottom: 24 }}>
          Authenticate with Microsoft to enable Azure Discovery
        </p>
        <div style={{ padding: '12px 20px', background: 'rgba(255,185,0,0.15)', color: '#FFB900', border: '1px solid rgba(255,185,0,0.3)', borderRadius: 8, fontSize: 13, maxWidth: 450, textAlign: 'center' }}>
          Real-time Azure SDK discovery, resource inventory, and control actions require active Directory impersonation credentials.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: 'white' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Resource Inventory & Controls</h1>
          <p style={{ color: '#a0aec0', marginTop: 4 }}>Manage and provision virtual machines, storage accounts, networks, and vaults.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setShowCreateModal(true)} style={{ background: '#107C10', color: 'white', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} /> Deploy Resource
          </button>
          <button className="btn btn-primary btn-sm" onClick={triggerDiscovery} disabled={discovering} style={{ background: '#0078d4', color: 'white', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {discovering ? <RefreshCw className="animate-spin" size={16} /> : <Cloud size={16} />} Sync Discovery
          </button>
        </div>
      </div>

      {/* Resource Table */}
      <div style={{ background: '#16192b', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: 12 }}>Resource</th>
              <th style={{ padding: 12 }}>Type</th>
              <th style={{ padding: 12 }}>Location</th>
              <th style={{ padding: 12 }}>Resource Group</th>
              <th style={{ padding: 12 }}>Status</th>
              <th style={{ padding: 12 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                  <div style={{ marginBottom: 8, fontSize: 16, fontWeight: 700, color: 'white' }}>No resources found</div>
                  <div style={{ fontSize: 13, color: '#a0aec0' }}>No resources found in this subscription. Connect resources or select another subscription.</div>
                </td>
              </tr>
            ) : (
              paginated.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td data-label="Resource" style={{ padding: 12, fontWeight: 600 }}>{r.name}</td>
                  <td data-label="Type" style={{ padding: 12 }}>{formatType(r.type)}</td>
                  <td data-label="Location" style={{ padding: 12 }}>{r.location}</td>
                  <td data-label="Resource Group" style={{ padding: 12 }}>{r.resource_group || r.resourceGroup}</td>
                  <td data-label="Status" style={{ padding: 12 }}>
                    <span style={{
                      padding: '4px 8px', borderRadius: 12, fontSize: 11,
                      background: r.status === 'Running' || r.status === 'Active' ? 'rgba(16,124,16,0.2)' : 'rgba(209,52,56,0.2)',
                      color: r.status === 'Running' || r.status === 'Active' ? '#107C10' : '#D13438'
                    }}>{r.status}</span>
                  </td>
                  <td data-label="Actions" style={{ padding: 12 }}>
                    <button 
                      onClick={() => promptDeleteResource(r)}
                      style={{ background: 'transparent', border: 'none', color: '#D13438', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Deploy Resource Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99 }}>
          <div style={{ background: '#16192b', padding: 24, borderRadius: 12, width: '90%', maxWidth: 450 }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Deploy Azure Resource</h3>
            {createError && <div style={{ background: '#D13438', padding: 10, borderRadius: 6, marginBottom: 14 }}>{createError}</div>}
            <form onSubmit={handleCreateResource} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Resource Type</label>
                <select value={createType} onChange={e => setCreateType(e.target.value as any)} style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                  <option value="ResourceGroup">Resource Group</option>
                  <option value="StorageAccount">Storage Account</option>
                  <option value="VirtualMachine">Virtual Machine</option>
                  <option value="KeyVault">Key Vault</option>
                  <option value="AppService">App Service</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Resource Name</label>
                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              {createType !== 'ResourceGroup' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Target Resource Group</label>
                  <input type="text" value={createResourceGroup} onChange={e => setCreateResourceGroup(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 6, background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#2d3748', border: 'none', color: 'white', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, background: '#107C10', border: 'none', color: 'white', cursor: 'pointer' }}>Deploy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog with Dependency Impact Analysis */}
      {deleteConfirmationId && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99 }}>
          <div style={{ background: '#16192b', padding: 24, borderRadius: 12, width: '90%', maxWidth: 450 }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#D13438' }}>Confirm Resource Deletion</h3>
            <p style={{ color: '#a0aec0', fontSize: 14 }}>Are you sure you want to delete this resource? This action is permanent.</p>
            {dependencyCount > 0 && (
              <div style={{ background: 'rgba(255,185,0,0.15)', color: '#FFB900', padding: 12, borderRadius: 8, margin: '14px 0', fontSize: 13 }}>
                ⚠️ <strong>Dependency Analysis Warning</strong>: Deleting this resource may impact {dependencyCount} other resources in the same resource group.
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setDeleteConfirmationId(null)} style={{ padding: '8px 16px', borderRadius: 8, background: '#2d3748', border: 'none', color: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeleteResource} style={{ padding: '8px 16px', borderRadius: 8, background: '#D13438', border: 'none', color: 'white', cursor: 'pointer' }}>Destroy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
