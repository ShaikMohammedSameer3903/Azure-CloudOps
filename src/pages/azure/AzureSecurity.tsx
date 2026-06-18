// ============================================================
// Security Center — Defender + Risk + Sentinel + User Security Stats
// ============================================================

import { useEffect, useState } from 'react';
import {
  Shield, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Lock, AlertCircle, Users, Key, MonitorPlay
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { api } from '../../services/api';

interface SecurityStats {
  totalUsers: number;
  activeUsers: number;
  failedLogins: number;
  lockedAccounts: number;
  sessionCount: number;
}

function GaugeMeter({ value, color, size = 110 }: { value: number | null; color: string; size?: number }) {
  if (value == null) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>N/A</div>;
  const pct = Math.min(100, Math.max(0, value));
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-surface-tertiary)" strokeWidth={10} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 800ms ease' }} />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{Math.round(pct)}</div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>/ 100</div>
      </div>
    </div>
  );
}

export default function AzureSecurity() {
  const {
    activeSubscriptionId,
    securityScore, setSecurityScore,
    defenderStatus, setDefenderStatus,
    riskScore, setRiskScore,
    advisorRecommendations, setAdvisorRecommendations,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'recommendations' | 'alerts' | 'risk' | 'users'>('overview');
  const [userSecurityStats, setUserSecurityStats] = useState<SecurityStats | null>(null);

  const fetchData = async () => {
    if (!activeSubscriptionId) return;
    setLoading(true);
    const q = { params: { subscriptionId: activeSubscriptionId } };
    try {
      const [defenderRes, riskRes, advisorRes, statsRes] = await Promise.allSettled([
        api.get<any>('/api/monitoring/defender', { ...q, params: { ...q.params, provider: 'azure' } }),
        api.get<any>('/api/monitoring/risk', { ...q, params: { ...q.params, provider: 'azure' } }),
        api.get<any>('/api/monitoring/advisor', { ...q, params: { ...q.params, provider: 'azure' } }),
        api.get<SecurityStats>('/api/auth/security-stats')
      ]);
      if (defenderRes.status === 'fulfilled') {
        setDefenderStatus(defenderRes.value);
        if (defenderRes.value?.secureScore) setSecurityScore(defenderRes.value.secureScore);
      }
      if (riskRes.status === 'fulfilled') setRiskScore(riskRes.value);
      if (advisorRes.status === 'fulfilled') {
        setAdvisorRecommendations(advisorRes.value?.recommendations || []);
      }
      if (statsRes.status === 'fulfilled') {
        setUserSecurityStats(statsRes.value);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeSubscriptionId]);

  const secPct = securityScore?.percentage ?? null;
  const secColor = secPct == null ? '#94a3b8' : secPct >= 80 ? '#107C10' : secPct >= 60 ? '#FFB900' : '#D13438';

  const riskSafe = riskScore?.safetyScore ?? null;
  const riskColor = riskSafe == null ? '#94a3b8' : riskSafe >= 80 ? '#107C10' : riskSafe >= 60 ? '#FFB900' : '#D13438';

  const alerts = defenderStatus?.alerts || [];
  const recs = (advisorRecommendations || []).filter(r => r.category === 'Security');
  const findings = riskScore?.findings || [];

  const allRecs = [
    ...(defenderStatus?.recommendations || []),
    ...recs,
  ];

  return (
    <div style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: 'white', padding: 24 }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-header-content">
          <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Security Center</h1>
          <p className="page-subtitle" style={{ color: '#a0aec0', marginTop: 4 }}>
            Microsoft Defender for Cloud · User Access Controls · Risk Policy Compliance
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading} style={{ background: '#1d2038', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Enterprise Security Metrics Dashboard Bar */}
      {userSecurityStats && (
        <div className="grid-5 mb-6">
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <Users size={16} color="#0078d4" /> TOTAL USERS
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{userSecurityStats.totalUsers}</div>
          </div>
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <MonitorPlay size={16} color="#107C10" /> ACTIVE USERS (24H)
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{userSecurityStats.activeUsers}</div>
          </div>
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <Lock size={16} color="#FFB900" /> ACTIVE SESSIONS
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{userSecurityStats.sessionCount}</div>
          </div>
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <AlertTriangle size={16} color="#D13438" /> FAILED LOGINS
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8, color: userSecurityStats.failedLogins > 0 ? '#D13438' : 'white' }}>{userSecurityStats.failedLogins}</div>
          </div>
          <div style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#a0aec0', fontSize: 12, fontWeight: 600 }}>
              <Key size={16} color="#D13438" /> LOCKED ACCOUNTS
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8, color: userSecurityStats.lockedAccounts > 0 ? '#D13438' : 'white' }}>{userSecurityStats.lockedAccounts}</div>
          </div>
        </div>
      )}

      {/* Score Cards */}
      <div className="grid-3 mb-6">
        <div className="card p-5" style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {loading
              ? <div className="skeleton skeleton-circle" style={{ width: 110, height: 110 }} />
              : <GaugeMeter value={secPct} color={secColor} />
            }
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Defender Secure Score
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: secColor, letterSpacing: '-0.02em' }}>
                {secPct != null ? `${Math.round(secPct)}%` : '—'}
              </div>
              <div style={{ fontSize: 12.5, color: '#a0aec0', marginTop: 4 }}>
                {secPct == null ? 'Not configured' : secPct >= 80 ? '✓ Good security posture' : secPct >= 60 ? '⚠ Needs attention' : '✗ Critical — act now'}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5" style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {loading
              ? <div className="skeleton skeleton-circle" style={{ width: 110, height: 110 }} />
              : <GaugeMeter value={riskSafe} color={riskColor} />
            }
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Risk Safety Score
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: riskColor, letterSpacing: '-0.02em' }}>
                {riskSafe != null ? `${Math.round(riskSafe)}%` : '—'}
              </div>
              <div style={{ fontSize: 12.5, color: '#a0aec0', marginTop: 4 }}>
                {riskScore ? `${riskScore.findingsCount} active findings` : 'Calculating…'}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5" style={{ background: '#16192b', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Threat Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Active Alerts', val: alerts.length, color: '#D13438', icon: AlertTriangle },
              { label: 'Security Recs', val: recs.length, color: '#FFB900', icon: AlertCircle },
              { label: 'Critical Findings', val: riskScore?.breakdown?.critical ?? 0, color: '#D13438', icon: XCircle },
              { label: 'High Findings', val: riskScore?.breakdown?.high ?? 0, color: '#c05500', icon: AlertTriangle },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${item.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <item.icon size={15} color={item.color} />
                </div>
                <span style={{ flex: 1, fontSize: 13, color: '#a0aec0' }}>{item.label}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: item.val > 0 ? item.color : '#107C10' }}>
                  {loading ? '…' : item.val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12, marginBottom: 24 }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'recommendations', label: 'Recommendations', count: allRecs.length },
          { id: 'alerts', label: 'Active Alerts', count: alerts.length },
          { id: 'risk', label: 'Risk Findings', count: findings.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: activeTab === tab.id ? 'var(--accent-color, #0078d4)' : 'transparent',
              border: 'none', color: 'white', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600
            }}
          >
            {tab.label} {tab.count !== undefined && `(${tab.count})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div style={{ background: '#16192b', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Shield size={18} /> Compliance & Policy Categories</h3>
          {secPct != null && securityScore?.categories && (securityScore?.categories || []).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(securityScore.categories || []).map(cat => {
                const pct = cat.maxScore > 0 ? (cat.score / cat.maxScore) * 100 : 0;
                return (
                  <div key={cat.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{cat.name}</span>
                      <span style={{ fontSize: 13.5, color: '#a0aec0' }}>{cat.score}/{cat.maxScore}</span>
                    </div>
                    <div style={{ height: 8, background: '#1d2038', borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: pct >= 80 ? '#107C10' : pct >= 60 ? '#FFB900' : '#D13438',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#a0aec0', fontSize: 14 }}>Defender configuration detail mapping not loaded. Refresh to initialize.</div>
          )}
        </div>
      )}

      {activeTab === 'recommendations' && (
        <div style={{ background: '#16192b', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Security Recommendations</h3>
          {allRecs.map((rec: any, idx: number) => (
            <div key={idx} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 14 }}>{rec.title || rec.displayName}</h4>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#a0aec0' }}>{rec.description}</p>
              </div>
              <span style={{
                background: rec.impact === 'High' ? 'rgba(209,52,56,0.2)' : 'rgba(255,185,0,0.2)',
                color: rec.impact === 'High' ? '#D13438' : '#FFB900',
                padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600
              }}>{rec.impact}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div style={{ background: '#16192b', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Defender Alerts</h3>
          {alerts.length === 0 ? (
            <p style={{ color: '#a0aec0' }}>No threats detected.</p>
          ) : (
            alerts.map((al: any, idx: number) => (
              <div key={idx} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ margin: 0, fontSize: 14 }}>{al.name || al.displayName}</h4>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#a0aec0' }}>{al.description}</p>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'risk' && (
        <div style={{ background: '#16192b', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Calculated Risks</h3>
          {findings.map((f: any, idx: number) => (
            <div key={idx} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 14 }}>{f.finding}</h4>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#a0aec0' }}>{f.recommendation}</p>
              </div>
              <span style={{
                color: f.severity === 'Critical' ? '#D13438' : '#FFB900',
                fontWeight: 600, fontSize: 12
              }}>{f.severity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
