// ============================================================
// Risk Management Page — Azure Risk Engine and Compliance findings
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import {
  ShieldCheck, CheckCircle,
  RefreshCw, Lock, ArrowUpRight, Search, Filter,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';
import { api } from '../services/api';

function RiskGauge({ pct, size = 120, strokeWidth = 10, color = 'var(--azure-600)', label }: { pct: number; size?: number; strokeWidth?: number; color?: string; label?: string }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-surface-tertiary)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 800ms ease' }} />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{Math.round(pct)}</div>
        {label && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, marginTop: 4 }}>{label}</div>}
      </div>
    </div>
  );
}

export default function RiskManagement() {
  const {
    activeSubscriptionId,
    riskScore, setRiskScore,
    globalSearchQuery,
    setGlobalSearchQuery,
  } = useAppStore();
  const { selectedProvider } = useCloudStore();

  const [loading, setLoading] = useState(true);
  const searchQuery = globalSearchQuery;
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');

  const fetchRiskData = async () => {
    if (!activeSubscriptionId) return;
    setLoading(true);
    try {
      const data = await api.get<any>('/api/monitoring/risk', {
        params: { subscriptionId: activeSubscriptionId }
      });
      setRiskScore(data);
    } catch (err) {
      console.error('[RiskManagement] Failed to fetch risk data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
  }, [activeSubscriptionId]);

  const safetyScore = riskScore?.safetyScore ?? 100;
  const riskColor = safetyScore >= 80 ? '#107C10' : safetyScore >= 60 ? '#FFB900' : '#D13438';
  const findings = riskScore?.findings || [];

  const filteredFindings = useMemo(() => {
    return findings.filter(f => {
      const matchesSearch = f.finding.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity = severityFilter === 'ALL' || f.severity.toUpperCase() === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [findings, searchQuery, severityFilter]);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Risk Management</h1>
          <p className="page-subtitle">Real-time risk scoring, compliance vulnerabilities, and mitigation actions.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchRiskData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Dashboard Cards */}
      <div className="grid-3 mb-6">
        {/* Safety Score Card */}
        <div className="card p-5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {loading ? (
              <div className="skeleton skeleton-circle" style={{ width: 120, height: 120 }} />
            ) : (
              <RiskGauge pct={safetyScore} color={riskColor} label="Safety Score" />
            )}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Tenant Safety Index
              </h2>
              <div style={{ fontSize: 32, fontWeight: 800, color: riskColor, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {safetyScore}%
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                {safetyScore >= 80 ? 'Low operational risk level' : safetyScore >= 60 ? 'Medium operational risk level' : 'Critical security & operational risks'}
              </p>
            </div>
          </div>
        </div>

        {/* Severity Summary Card */}
        <div className="card p-5">
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            Risk Distribution
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Critical', val: riskScore?.breakdown?.critical ?? 0, color: '#D13438' },
              { label: 'High', val: riskScore?.breakdown?.high ?? 0, color: '#c05500' },
              { label: 'Medium', val: riskScore?.breakdown?.medium ?? 0, color: '#FFB900' },
              { label: 'Low', val: riskScore?.breakdown?.low ?? 0, color: '#0078d4' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: item.val > 0 ? item.color : 'var(--text-tertiary)' }}>{item.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Banner Card */}
        <div className="card p-5" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Continuous Audit Status
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success-600)', fontWeight: 600, fontSize: 14 }}>
              <ShieldCheck size={18} />
              <span>Real-Time Scanning Active</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
              All resources evaluated hourly against {selectedProvider === 'aws' ? 'AWS Security Hub' : selectedProvider === 'all' ? 'Unified Cloud Security Benchmarks' : 'Azure Cloud Security Benchmark'} and custom organization policies.
            </p>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 10 }}>
            Last scan: {riskScore?.calculatedAt ? new Date(riskScore.calculatedAt).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      </div>

      {/* Risk Findings Table Area */}
      <div className="card">
        <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', gap: 12, flex: 1, maxWidth: 600 }}>
            <div className="table-search-wrapper" style={{ flex: 1 }}>
              <Search size={14} className="table-search-icon" />
              <input
                type="text"
                className="table-search"
                placeholder="Search findings, resources..."
                value={searchQuery}
                onChange={e => setGlobalSearchQuery(e.target.value)}
              />
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Filter size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-secondary)' }} />
              <select
                style={{
                  padding: '6px 10px 6px 30px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface-secondary)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredFindings.length}</strong> findings
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Finding / Recommendation</th>
                <th>Resource</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Risk Points</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6}><div className="skeleton skeleton-row" style={{ height: 40 }} /></td>
                  </tr>
                ))
              ) : filteredFindings.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-state-icon"><CheckCircle size={28} color="var(--success-600)" /></div>
                      <div className="empty-state-title">No risk findings detected</div>
                      <div className="empty-state-desc">Your environment is running within safe compliance parameters.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFindings.map((f, idx) => {
                  const sevColor: Record<string, string> = { Critical: '#D13438', High: '#c05500', Medium: '#FFB900', Low: '#0078d4' };
                  const color = sevColor[f.severity] || '#64748b';
                  return (
                    <tr key={idx}>
                      <td data-label="Finding / Recommendation">
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                            <Lock size={14} color={color} />
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.finding}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{f.recommendation}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Resource">
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{f.resourceName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
                          {f.resourceId.split('/').pop()}
                        </div>
                      </td>
                      <td data-label="Category">
                        <span style={{ fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-surface-secondary)', color: 'var(--text-secondary)' }}>
                          {f.category}
                        </span>
                      </td>
                      <td data-label="Severity">
                        <span className={`severity-badge ${f.severity.toLowerCase()}`}>
                          {f.severity}
                        </span>
                      </td>
                      <td data-label="Risk Points" style={{ fontWeight: 700, color: color }}>
                        +{f.riskPoints} pts
                      </td>
                      <td data-label="Action">
                        <a
                          href={selectedProvider === 'aws' ? `https://console.aws.amazon.com/resource/${f.resourceId}` : `https://portal.azure.com/#@/resource${f.resourceId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: selectedProvider === 'aws' ? '#FF9900' : 'var(--azure-600)', padding: '4px 8px' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = selectedProvider === 'aws' ? 'rgba(255,153,0,0.1)' : 'rgba(0,120,212,0.1)')}
                        >
                          Remediate <ArrowUpRight size={12} />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
