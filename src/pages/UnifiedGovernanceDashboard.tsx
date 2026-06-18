// ============================================================
// Unified Governance Dashboard — Azure Policy + AWS Config
// All data from backend APIs — NO mock data
// ============================================================

import { useEffect, useState } from 'react';
import { Landmark, RefreshCw, Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../services/api';
import { useCloudStore } from '../store/cloudStore';

const FRAMEWORKS = ['HIPAA', 'HITECH', 'SOC2', 'ISO27001', 'NIST', 'PCI-DSS'];
const FW_COLORS: Record<string, string> = { HIPAA: '#D13438', HITECH: '#0078d4', SOC2: '#107C10', ISO27001: '#8b5cf6', NIST: '#FF9900', 'PCI-DSS': '#00B7C3' };

export default function UnifiedGovernanceDashboard() {
  const { selectedProvider } = useCloudStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [governanceData, setGovernanceData] = useState<any>(null);
  const [complianceData, setComplianceData] = useState<any>(null);
  const [selectedFramework, setSelectedFramework] = useState('HIPAA');
  const [filterProvider, setFilterProvider] = useState<string>('all');

  const fetchAll = async () => {
    setRefreshing(true);
    try {
      const [govResult, compResult] = await Promise.allSettled([
        api.get<any>('/api/governance', { params: { provider: filterProvider } }),
        api.get<any>('/api/monitoring/compliance/unified', { params: { provider: filterProvider, framework: selectedFramework } }),
      ]);
      if (govResult.status === 'fulfilled') setGovernanceData(govResult.value);
      if (compResult.status === 'fulfilled') setComplianceData(compResult.value);
    } catch (err) { console.error('[Governance] Error:', err); } finally { setRefreshing(false); setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [filterProvider, selectedFramework]);

  const compScore = complianceData?.overallScore ?? governanceData?.policyCompliance ?? null;
  const failedControls = complianceData?.failedControls ?? governanceData?.nonCompliantResources ?? 0;
  const totalControls = complianceData?.totalControls ?? (governanceData ? (governanceData.compliantResources + governanceData.nonCompliantResources) : 0);
  const riskLevel = complianceData?.riskLevel ?? (compScore && compScore < 70 ? 'High' : compScore && compScore < 90 ? 'Medium' : 'Low');

  const scoreColor = compScore == null ? '#94a3b8' : compScore >= 80 ? '#107C10' : compScore >= 60 ? '#FFB900' : '#D13438';
  const riskColor = riskLevel === 'High' ? '#D13438' : riskLevel === 'Medium' ? '#FFB900' : '#107C10';

  const fwData = FRAMEWORKS.map(fw => ({ name: fw, score: fw === selectedFramework ? (compScore || 0) : (complianceData?.frameworkScores?.[fw] || 0) }));

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Unified Governance & Compliance</h1>
          <p className="page-subtitle">{filterProvider === 'azure' ? 'Azure Policy' : filterProvider === 'aws' ? 'AWS Config' : 'Unified Cloud Policies'} · HIPAA · SOC2 · ISO27001 · NIST · PCI-DSS</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface-secondary)', borderRadius: 8, padding: 3, border: '1px solid var(--border-subtle)' }}>
            {['all', 'azure', 'aws'].map(p => (
              <button key={p} onClick={() => setFilterProvider(p)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: filterProvider === p ? (p === 'azure' ? '#0078d4' : p === 'aws' ? '#FF9900' : 'var(--azure-500)') : 'transparent',
                color: filterProvider === p ? 'white' : 'var(--text-secondary)', transition: 'all 150ms ease',
              }}>{p === 'all' ? '🌐 All' : p === 'azure' ? '🔷 Azure' : '🟠 AWS'}</button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}88)` }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Compliance Score</div><div className="kpi-value" style={{ color: scoreColor }}>{compScore != null ? `${Math.round(compScore)}%` : '—'}</div></div>
            <div className="kpi-icon" style={{ background: `${scoreColor}18` }}><Shield size={20} color={scoreColor} /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{selectedFramework} framework</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: 'linear-gradient(90deg, #D13438, #FF6B6B)' }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Failed Controls</div><div className="kpi-value" style={{ color: '#D13438' }}>{failedControls}</div></div>
            <div className="kpi-icon" style={{ background: 'rgba(209,52,56,.1)' }}><XCircle size={20} color="#D13438" /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Out of {totalControls} total</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-accent" style={{ background: `linear-gradient(90deg, ${riskColor}, ${riskColor}88)` }} />
          <div className="kpi-card-top">
            <div><div className="kpi-label">Risk Level</div><div className="kpi-value" style={{ color: riskColor }}>{riskLevel}</div></div>
            <div className="kpi-icon" style={{ background: `${riskColor}18` }}><AlertTriangle size={20} color={riskColor} /></div>
          </div>
          <div className="kpi-trend" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Based on compliance posture</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Framework Selector */}
        <div className="card col-span-3">
          <div className="card-header"><div className="card-title"><Landmark size={16} color="#0078d4" /> Compliance Frameworks</div></div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {FRAMEWORKS.map(fw => (
                <button key={fw} onClick={() => setSelectedFramework(fw)} style={{
                  padding: '6px 16px', borderRadius: 8, border: `1px solid ${selectedFramework === fw ? FW_COLORS[fw] : 'var(--border-subtle)'}`,
                  background: selectedFramework === fw ? `${FW_COLORS[fw]}18` : 'var(--bg-surface-secondary)',
                  color: selectedFramework === fw ? FW_COLORS[fw] : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 150ms ease',
                }}>{fw}</button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={fwData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} formatter={(val: any) => [`${val}%`, 'Score']} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {fwData.map((e, i) => <Cell key={i} fill={FW_COLORS[e.name] || '#0078d4'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
