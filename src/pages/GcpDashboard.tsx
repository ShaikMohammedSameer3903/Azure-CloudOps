// ============================================================
// GCP Dashboard — Placeholder for future GCP integration
// ============================================================

import { Cloud } from 'lucide-react';

export default function GcpDashboard() {
  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(66,133,244,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔴</span>
            Google Cloud Platform
          </h1>
          <p className="page-subtitle">GCP integration is coming soon</p>
        </div>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', textAlign: 'center',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20, background: 'rgba(66,133,244,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        }}>
          <Cloud size={36} color="#4285F4" />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          GCP Support Coming Soon
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 500, lineHeight: 1.6, fontSize: 14 }}>
          The Multi-Cloud architecture is designed to support Google Cloud Platform.
          When ready, simply implement the <strong>GcpProvider</strong> class in <code>server/providers/gcp/</code>
          to enable GCP resource discovery, monitoring, security, and cost management.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['Compute Engine', 'GKE', 'Cloud SQL', 'Cloud Storage', 'BigQuery', 'Cloud Functions'].map(svc => (
            <span key={svc} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
              background: 'rgba(66,133,244,0.08)', color: '#4285F4', border: '1px solid rgba(66,133,244,0.2)',
            }}>{svc}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
