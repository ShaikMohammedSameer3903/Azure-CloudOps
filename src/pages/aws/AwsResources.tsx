import { useEffect, useState, useMemo } from 'react';
import {
  Server, RefreshCw, Database, Cloud, Cpu, Box, CloudRain
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { api } from '../../services/api';

const AWS_RESOURCE_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  'AWS::EC2::Instance': { icon: Cpu, color: '#FF9900', bg: '#fff7ed' },
  'AWS::S3::Bucket': { icon: Database, color: '#107C10', bg: '#f0fdf4' },
  'AWS::RDS::DBInstance': { icon: Database, color: '#0078d4', bg: '#eff6ff' },
  'AWS::Lambda::Function': { icon: Box, color: '#8b5cf6', bg: '#f5f3ff' },
  'AWS::EKS::Cluster': { icon: CloudRain, color: '#D13438', bg: '#fef2f2' },
  default: { icon: Server, color: '#64748b', bg: '#f8fafc' },
};

function getResourceIcon(type: string) {
  return AWS_RESOURCE_ICONS[type] || AWS_RESOURCE_ICONS.default;
}

const PAGE_SIZE = 15;

export default function AwsResources() {
  const {
    resources, setResources,
    setResourcesLoading,
    globalSearchQuery,
  } = useAppStore();

  const search = globalSearchQuery;
  const [filterType, setFilterType] = useState('');
  const [sortCol, setSortCol] = useState<'name' | 'type' | 'location' | 'status'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [discovering, setDiscovering] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchResources = async () => {
    setLoading(true);
    setResourcesLoading(true);
    try {
      const data = await api.get<any[]>('/api/resources', { params: { provider: 'aws' } });
      setResources(data);
    } catch (err) {
      console.error('[AwsResources] Fetch failed:', err);
    } finally {
      setLoading(false);
      setResourcesLoading(false);
    }
  };

  const triggerDiscovery = async () => {
    setDiscovering(true);
    try {
      await api.post(`/api/cloud-accounts/sync`, { provider: 'aws' });
      await fetchResources();
    } catch (err) {
      console.error('[AwsResources] Discovery failed:', err);
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => { fetchResources(); }, []);

  const awsResources = useMemo(() => resources.filter(r => r.provider === 'aws'), [resources]);
  const types = useMemo(() => [...new Set(awsResources.map(r => r.type))].sort(), [awsResources]);

  const filtered = useMemo(() => {
    let list = awsResources;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.type?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q)
      );
    }
    if (filterType) list = list.filter(r => r.type === filterType);

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
  }, [awsResources, search, filterType, sortCol, sortDir]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: 'white' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>AWS Resources</h1>
          <p style={{ color: '#a0aec0', marginTop: 4 }}>Manage EC2 instances, S3 buckets, RDS databases, and more.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={triggerDiscovery} disabled={discovering} style={{ background: '#FF9900', color: '#16192b', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {discovering ? <RefreshCw className="animate-spin" size={16} /> : <Cloud size={16} />} Sync AWS Resources
          </button>
        </div>
      </div>

      <div style={{ background: '#16192b', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: 12 }}>Resource Name</th>
              <th style={{ padding: 12 }}>Type</th>
              <th style={{ padding: 12 }}>Region</th>
              <th style={{ padding: 12 }}>Account</th>
              <th style={{ padding: 12 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                  <div style={{ marginBottom: 8, fontSize: 16, fontWeight: 700, color: 'white' }}>No AWS resources found</div>
                  <div style={{ fontSize: 13, color: '#a0aec0' }}>Ensure your AWS accounts are linked and discovered.</div>
                </td>
              </tr>
            ) : (
              paginated.map(r => {
                const iconConf = getResourceIcon(r.type);
                const IconComp = iconConf.icon;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td data-label="Resource Name" style={{ padding: 12, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ background: iconConf.bg, padding: 4, borderRadius: 6 }}><IconComp size={16} color={iconConf.color} /></div>
                        {r.name}
                      </div>
                    </td>
                    <td data-label="Type" style={{ padding: 12 }}>{r.type}</td>
                    <td data-label="Region" style={{ padding: 12 }}>{(r as any).location || (r as any).region}</td>
                    <td data-label="Account" style={{ padding: 12 }}>{(r as any).accountName || (r as any).accountId || '—'}</td>
                    <td data-label="Status" style={{ padding: 12 }}>
                      <span style={{
                        padding: '4px 8px', borderRadius: 12, fontSize: 11,
                        background: r.status === 'Running' || r.status === 'Available' || r.status === 'Active' ? 'rgba(16,124,16,0.2)' : 'rgba(209,52,56,0.2)',
                        color: r.status === 'Running' || r.status === 'Available' || r.status === 'Active' ? '#107C10' : '#D13438'
                      }}>{r.status || 'Unknown'}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
