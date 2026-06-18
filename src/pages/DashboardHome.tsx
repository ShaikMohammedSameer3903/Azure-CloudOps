// ============================================================
// Dashboard Home — Cloud Selector Hub
// After login, shows available cloud dashboards with live stats
// ============================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cloud, Cpu, Layers, Server, Shield, DollarSign,
  AlertTriangle, ArrowRight, Activity, Globe, RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { useCloudStore } from '../store/cloudStore';
import { useAuth } from '../providers/AuthProvider';

interface CloudStats {
  resources: number;
  alerts: number;
  spend: number;
  securityScore: number | null;
  accounts: number;
}

const EMPTY_STATS: CloudStats = { resources: 0, alerts: 0, spend: 0, securityScore: null, accounts: 0 };

import {fmtNumber, fmtCurrency} from '../utils/formatters';

export default function DashboardHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cloudAccounts } = useCloudStore();
  const [loading, setLoading] = useState(true);
  const [azureStats, setAzureStats] = useState<CloudStats>(EMPTY_STATS);
  const [awsStats, setAwsStats] = useState<CloudStats>(EMPTY_STATS);

  const azureAccounts = cloudAccounts.filter(a => a.provider === 'azure');
  const awsAccounts = cloudAccounts.filter(a => a.provider === 'aws');
  const hasAzure = azureAccounts.length > 0;
  const hasAws = awsAccounts.length > 0;
  const hasMultiCloud = hasAzure && hasAws;

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [resResult, costResult, secResult] = await Promise.allSettled([
          api.get<any[]>('/api/resources'),
          api.get<any>('/api/monitoring/cost/unified?provider=azure'),
          api.get<any>('/api/monitoring/security/unified?provider=azure'),
        ]);

        const allResources = resResult.status === 'fulfilled' ? resResult.value : [];
        const costData = costResult.status === 'fulfilled' ? costResult.value : null;
        const secData = secResult.status === 'fulfilled' ? secResult.value : null;

        const azureRes = allResources.filter(r => (r.provider || 'azure').toLowerCase() === 'azure');
        const awsRes = allResources.filter(r => r.provider === 'aws');

        setAzureStats({
          resources: azureRes.length,
          alerts: 0,
          spend: costData?.totalCost || 0,
          securityScore: secData?.overallScore ?? null,
          accounts: azureAccounts.length,
        });

        setAwsStats({
          resources: awsRes.length,
          alerts: 0,
          spend: 0,
          securityScore: null,
          accounts: awsAccounts.length,
        });
      } catch (err) {
        console.error('[DashboardHome] Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    if (cloudAccounts.length > 0) {
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [cloudAccounts.length]);

  // If no cloud accounts, redirect to onboarding
  if (!loading && !user?.onboardingComplete && cloudAccounts.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', minHeight: '80vh', textAlign: 'center'
      }}>
        <div style={{
          width: 80, height: 80, margin: '0 auto 24px', background: 'rgba(255,255,255,0.05)',
          borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <Cloud size={40} color="#0078d4" />
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'white' }}>Welcome to CloudOps Enterprise</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 500, lineHeight: 1.5, marginBottom: 40, fontSize: 16 }}>
          Connect your cloud environments to begin monitoring resources, security posture, and compliance.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/discovery?cloud=Azure')} className="btn" style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <Cloud size={18} /> Connect Azure
          </button>
          <button onClick={() => navigate('/discovery?cloud=AWS')} className="btn" style={{ background: 'rgba(255,153,0,0.1)', color: '#FF9900', border: '1px solid rgba(255,153,0,0.2)', padding: '12px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
            <Layers size={18} /> Connect AWS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Dashboard Home</h1>
          <p className="page-subtitle">
            Welcome back, <strong>{user?.displayName || 'Admin'}</strong> — select a cloud platform to manage
          </p>
        </div>
      </div>

      {/* Cloud Selector Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 24,
        padding: '0 0 32px',
      }}>
        {/* Azure Card */}
        {hasAzure && (
          <button
            id="cloud-card-azure"
            onClick={() => navigate('/azure')}
            style={{
              all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
              borderRadius: 16, overflow: 'hidden',
              transition: 'all 250ms cubic-bezier(.4,0,.2,1)',
              position: 'relative',
            }}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,120,212,0.15)';
              e.currentTarget.style.borderColor = '#0078d4';
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            <div style={{ height: 4, background: 'linear-gradient(90deg, #0078d4, #00B7C3)' }} />
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,120,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Cloud size={24} color="#0078d4" />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Azure</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{azureStats.accounts} subscription(s) connected</div>
                </div>
                <ArrowRight size={18} color="var(--text-tertiary)" style={{ marginLeft: 'auto' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <StatChip icon={Server} label="Resources" value={String(azureStats.resources)} color="#0078d4" />
                <StatChip icon={Shield} label="Security" value={azureStats.securityScore != null ? `${Math.round(azureStats.securityScore)}%` : '—'} color="#107C10" />
                <StatChip icon={DollarSign} label="Spend" value={fmtCurrency(azureStats.spend)} color="#00B7C3" />
                <StatChip icon={Activity} label="Status" value="Connected" color="#107C10" />
              </div>
            </div>
          </button>
        )}

        {/* AWS Card */}
        {hasAws && (
          <button
            id="cloud-card-aws"
            onClick={() => navigate('/aws')}
            style={{
              all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
              borderRadius: 16, overflow: 'hidden',
              transition: 'all 250ms cubic-bezier(.4,0,.2,1)',
              position: 'relative',
            }}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(255,153,0,0.15)';
              e.currentTarget.style.borderColor = '#FF9900';
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            <div style={{ height: 4, background: 'linear-gradient(90deg, #FF9900, #FF6600)' }} />
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,153,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Cpu size={24} color="#FF9900" />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>AWS</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{awsStats.accounts} account(s) connected</div>
                </div>
                <ArrowRight size={18} color="var(--text-tertiary)" style={{ marginLeft: 'auto' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <StatChip icon={Server} label="Resources" value={String(awsStats.resources)} color="#FF9900" />
                <StatChip icon={Shield} label="Security" value={awsStats.securityScore != null ? `${Math.round(awsStats.securityScore)}%` : '—'} color="#107C10" />
                <StatChip icon={DollarSign} label="Spend" value={fmtCurrency(awsStats.spend)} color="#FF6600" />
                <StatChip icon={Activity} label="Status" value="Connected" color="#107C10" />
              </div>
            </div>
          </button>
        )}

        {/* Multi-Cloud Overview Card */}
        {hasMultiCloud && (
          <button
            id="cloud-card-multicloud"
            onClick={() => navigate('/multicloud')}
            style={{
              all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
              borderRadius: 16, overflow: 'hidden',
              transition: 'all 250ms cubic-bezier(.4,0,.2,1)',
              position: 'relative',
            }}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(139,92,246,0.15)';
              e.currentTarget.style.borderColor = '#8b5cf6';
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            <div style={{ height: 4, background: 'linear-gradient(90deg, #0078d4, #FF9900, #8b5cf6)' }} />
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Globe size={24} color="#8b5cf6" />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Multi-Cloud Overview</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Executive cross-cloud intelligence</div>
                </div>
                <ArrowRight size={18} color="var(--text-tertiary)" style={{ marginLeft: 'auto' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <StatChip icon={Server} label="Total Resources" value={String(azureStats.resources + awsStats.resources)} color="#8b5cf6" />
                <StatChip icon={DollarSign} label="Total Spend" value={fmtCurrency(azureStats.spend + awsStats.spend)} color="#0078d4" />
                <StatChip icon={Cloud} label="Azure" value={`${azureStats.resources} res`} color="#0078d4" />
                <StatChip icon={Cpu} label="AWS" value={`${awsStats.resources} res`} color="#FF9900" />
              </div>
            </div>
          </button>
        )}

        {/* Show single-cloud multi-cloud card as "Executive View" even with one provider */}
        {!hasMultiCloud && (hasAzure || hasAws) && (
          <button
            id="cloud-card-executive"
            onClick={() => navigate('/multicloud')}
            style={{
              all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
              borderRadius: 16, overflow: 'hidden',
              transition: 'all 250ms cubic-bezier(.4,0,.2,1)',
            }}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(139,92,246,0.15)';
              e.currentTarget.style.borderColor = '#8b5cf6';
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            <div style={{ height: 4, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }} />
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={24} color="#8b5cf6" />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Executive View</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Unified operations dashboard</div>
                </div>
                <ArrowRight size={18} color="var(--text-tertiary)" style={{ marginLeft: 'auto' }} />
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Stat Chip Component ──
function StatChip({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string; color: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--bg-surface-secondary)', borderRadius: 8,
      padding: '8px 10px', border: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: `${color}15`, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={14} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  );
}
