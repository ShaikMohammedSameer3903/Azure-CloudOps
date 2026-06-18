import React from 'react';
import { Shield, AlertOctagon, CheckCircle, Activity } from 'lucide-react';
import type { SecurityStats } from '../../types/security';

interface Props {
  stats: SecurityStats | null;
}

export default function ThreatSummary({ stats }: Props) {
  if (!stats) return null;

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-card-accent" style={{ background: 'var(--danger-600)' }} />
        <div className="kpi-card-top">
          <div className="kpi-icon" style={{ background: 'rgba(209,52,56,.1)', color: 'var(--danger-600)' }}>
            <AlertOctagon size={20} />
          </div>
        </div>
        <div>
          <div className="kpi-label">Critical Threats</div>
          <div className="kpi-value">{stats.critical}</div>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-card-accent" style={{ background: 'var(--warning-500)' }} />
        <div className="kpi-card-top">
          <div className="kpi-icon" style={{ background: 'rgba(255,185,0,.1)', color: 'var(--warning-600)' }}>
            <Activity size={20} />
          </div>
        </div>
        <div>
          <div className="kpi-label">High Severity</div>
          <div className="kpi-value">{stats.high}</div>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-card-accent" style={{ background: 'var(--success-500)' }} />
        <div className="kpi-card-top">
          <div className="kpi-icon" style={{ background: 'rgba(34,197,94,.1)', color: 'var(--success-600)' }}>
            <CheckCircle size={20} />
          </div>
        </div>
        <div>
          <div className="kpi-label">Auto-Remediated</div>
          <div className="kpi-value">{stats.autoRemediated}</div>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-card-accent" style={{ background: stats.securityScore >= 80 ? 'var(--success-500)' : stats.securityScore >= 60 ? 'var(--warning-500)' : 'var(--danger-600)' }} />
        <div className="kpi-card-top">
          <div className="kpi-icon" style={{ background: 'rgba(0,120,212,.1)', color: 'var(--azure-600)' }}>
            <Shield size={20} />
          </div>
        </div>
        <div>
          <div className="kpi-label">Security Score</div>
          <div className="kpi-value">{stats.securityScore}%</div>
        </div>
      </div>
    </div>
  );
}
