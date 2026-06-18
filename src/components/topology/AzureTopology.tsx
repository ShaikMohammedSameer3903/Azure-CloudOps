// ============================================================
// Azure Topology — Visualizes Azure resources grouped by Resource Group
// ============================================================

import { useState, useMemo } from 'react';
import {
  ChevronRight, ChevronDown, Server, HardDrive, Database,
  Globe, Cloud, Layers, Shield, Activity, Cpu, Box,
} from 'lucide-react';

interface Resource {
  id: string;
  name: string;
  type: string;
  resourceGroup?: string;
  status?: string;
  location?: string;
}

const TYPE_ICONS: Record<string, any> = {
  'virtualmachines': Cpu,
  'storageaccounts': HardDrive,
  'virtualnetworks': Globe,
  'managedclusters': Layers,
  'sqldatabases': Database,
  'sqlelasticpools': Database,
  'sqlservers': Database,
  'containerservice': Box,
  'networkinterfaces': Globe,
  'publicipaddresses': Globe,
  'disks': HardDrive,
  'networksecuritygroups': Shield,
};

function getIcon(type: string) {
  const lower = (type || '').toLowerCase();
  for (const [key, Icon] of Object.entries(TYPE_ICONS)) {
    if (lower.includes(key)) return Icon;
  }
  return Server;
}

function getStatusColor(status?: string): string {
  if (!status) return 'var(--text-tertiary)';
  const s = status.toLowerCase();
  if (s === 'running' || s === 'succeeded' || s === 'available' || s === 'active') return '#107C10';
  if (s === 'stopped' || s === 'deallocated') return '#FFB900';
  if (s === 'failed' || s === 'error') return '#D13438';
  return 'var(--text-tertiary)';
}

export default function AzureTopology({ resources }: { resources: Resource[] }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map: Record<string, Resource[]> = {};
    resources.forEach(r => {
      const group = r.resourceGroup || 'Unknown';
      if (!map[group]) map[group] = [];
      map[group].push(r);
    });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [resources]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (resources.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 0' }}>
        <div className="empty-state-icon"><Cloud size={24} /></div>
        <div className="empty-state-title">No Azure resources to display</div>
        <div className="empty-state-desc">Connect an Azure subscription to see the resource topology</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Subscription root */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 8,
        background: 'rgba(0,120,212,0.06)', border: '1px solid rgba(0,120,212,0.15)',
        fontSize: 13, fontWeight: 700, color: '#0078d4',
      }}>
        <Cloud size={16} /> Azure Subscription — {resources.length} resources in {grouped.length} groups
      </div>

      {/* Resource Groups */}
      {grouped.map(([groupName, items]) => {
        const isExpanded = expandedGroups.has(groupName);
        return (
          <div key={groupName} style={{ marginLeft: 16 }}>
            <button
              onClick={() => toggleGroup(groupName)}
              style={{
                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                color: 'var(--text-primary)', width: '100%',
                background: isExpanded ? 'var(--bg-surface-secondary)' : 'transparent',
                transition: 'background 150ms ease',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--bg-surface-secondary)'; }}
              onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Layers size={14} color="var(--text-tertiary)" />
              <span>{groupName}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                {items.length} {items.length === 1 ? 'resource' : 'resources'}
              </span>
            </button>

            {isExpanded && (
              <div style={{ marginLeft: 28, borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12, marginTop: 2, marginBottom: 4 }}>
                {items.map(r => {
                  const Icon = getIcon(r.type);
                  const typeName = (r.type || '').split('/').pop() || 'Resource';
                  return (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '4px 8px', fontSize: 12, color: 'var(--text-secondary)',
                    }}>
                      <Icon size={13} color="var(--text-tertiary)" />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.name}</span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{typeName}</span>
                      {r.status && (
                        <span style={{
                          marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                          color: getStatusColor(r.status),
                          background: `${getStatusColor(r.status)}15`,
                          padding: '1px 6px', borderRadius: 10,
                        }}>{r.status}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
