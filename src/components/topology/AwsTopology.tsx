// ============================================================
// AWS Topology — Visualizes AWS resources grouped by Service / VPC
// ============================================================

import { useState, useMemo } from 'react';
import {
  ChevronRight, ChevronDown, Server, HardDrive, Database,
  Globe, Cloud, Layers, Shield, Activity, Cpu, Box,
} from 'lucide-react';

interface Resource {
  id: string;
  name: string;
  type?: string;
  resourceType?: string;
  status?: string;
  region?: string;
  provider?: string;
}

const AWS_SERVICE_ICONS: Record<string, any> = {
  'ec2': Cpu,
  'eks': Layers,
  'ecs': Box,
  'lambda': Activity,
  'rds': Database,
  'dynamodb': Database,
  's3': HardDrive,
  'vpc': Globe,
  'securityhub': Shield,
  'guardduty': Shield,
};

function getServiceIcon(type: string) {
  const lower = (type || '').toLowerCase();
  for (const [key, Icon] of Object.entries(AWS_SERVICE_ICONS)) {
    if (lower.includes(key)) return Icon;
  }
  return Server;
}

function getStatusColor(status?: string): string {
  if (!status) return 'var(--text-tertiary)';
  const s = status.toLowerCase();
  if (s === 'running' || s === 'available' || s === 'active' || s === 'in-use') return '#107C10';
  if (s === 'stopped' || s === 'pending') return '#FFB900';
  if (s === 'terminated' || s === 'error' || s === 'failed') return '#D13438';
  return 'var(--text-tertiary)';
}

export default function AwsTopology({ resources }: { resources: Resource[] }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map: Record<string, Resource[]> = {};
    resources.forEach(r => {
      const service = (r.type || r.resourceType || 'Other').split('/').pop() || 'Other';
      if (!map[service]) map[service] = [];
      map[service].push(r);
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
        <div className="empty-state-icon"><Cpu size={24} color="#FF9900" /></div>
        <div className="empty-state-title">No AWS resources to display</div>
        <div className="empty-state-desc">Connect an AWS account to see the resource topology</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Account root */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 8,
        background: 'rgba(255,153,0,0.06)', border: '1px solid rgba(255,153,0,0.15)',
        fontSize: 13, fontWeight: 700, color: '#FF9900',
      }}>
        <Cpu size={16} /> AWS Account — {resources.length} resources across {grouped.length} services
      </div>

      {/* Service Groups */}
      {grouped.map(([serviceName, items]) => {
        const isExpanded = expandedGroups.has(serviceName);
        const ServiceIcon = getServiceIcon(serviceName);
        return (
          <div key={serviceName} style={{ marginLeft: 16 }}>
            <button
              onClick={() => toggleGroup(serviceName)}
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
              <ServiceIcon size={14} color="#FF9900" />
              <span>{serviceName}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                {items.length}
              </span>
            </button>

            {isExpanded && (
              <div style={{ marginLeft: 28, borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12, marginTop: 2, marginBottom: 4 }}>
                {items.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 8px', fontSize: 12, color: 'var(--text-secondary)',
                  }}>
                    <Server size={13} color="var(--text-tertiary)" />
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.name}</span>
                    {r.region && <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{r.region}</span>}
                    {r.status && (
                      <span style={{
                        marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                        color: getStatusColor(r.status),
                        background: `${getStatusColor(r.status)}15`,
                        padding: '1px 6px', borderRadius: 10,
                      }}>{r.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
