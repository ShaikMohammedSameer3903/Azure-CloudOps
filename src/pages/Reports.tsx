// ============================================================
// Operational Reports and Export Center Component
// ============================================================

import { useEffect, useState } from 'react';
import { FileBarChart, Download, FileText, Table, RefreshCw, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { useAppStore } from '../store/appStore';
import { useCloudStore } from '../store/cloudStore';

export default function Reports() {
  const { activeSubscriptionId, isRefreshing, setIsRefreshing } = useAppStore();
  const { selectedProvider } = useCloudStore();
  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReportData = async () => {
    setIsRefreshing(true);
    try {
      const activeEnv = useAppStore.getState().activeEnvironment;
      const data = await api.get<any>('/api/reports/executive', { params: { environment: activeEnv } });
      setReportData(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeEnvironment = useAppStore(s => s.activeEnvironment);

  useEffect(() => {
    fetchReportData();
  }, [activeSubscriptionId, activeEnvironment]);

  // 1. Export Excel Spreadsheet using 'xlsx' library
  const handleExportExcel = async () => {
    if (!reportData || !reportData.data) {
      console.warn('No report data available to export');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const isAws = selectedProvider === 'aws';
      // Sheet 1: Executive Summary
      const summaryRows = [
        { Metric: 'Generated Timestamp', Value: new Date(reportData.generatedAt).toLocaleString() },
        { Metric: isAws ? 'Connected Cloud Accounts' : 'Connected Subscriptions', Value: reportData.subscriptionsCount },
        { Metric: 'Total Discovered Resources', Value: reportData.resourcesCount },
        { Metric: 'Total Active Incidents', Value: reportData.incidentsCount },
        { Metric: 'Total Monthly Budget', Value: `$${reportData.totalBudget}` },
        { Metric: 'Total Monthly Spend', Value: `$${reportData.totalSpend}` },
        { Metric: isAws ? 'Average Security Score (Security Hub)' : 'Average Security Score', Value: `${reportData.averageSecurityScore}%` },
        { Metric: isAws ? 'Average Backup Health' : 'Average Backup Health (Recovery Vaults)', Value: `${reportData.averageBackupHealth}%` }
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

      // Sheet 2: Account/Subscription Breakdowns
      const subRows = reportData.data.map((sub: any) => ({
        [isAws ? 'Account Name' : 'Subscription Name']: sub.subscriptionName,
        [isAws ? 'Account ID' : 'Subscription ID']: sub.subscriptionId,
        'Resources Count': sub.resourceCount,
        'Active Incidents': sub.activeIncidents,
        'Current Spend ($)': sub.currentSpend,
        'Budget ($)': sub.budget,
        'Security Score (%)': sub.securityScore,
        'Backup Health (%)': sub.backupHealth
      }));
      const wsSubs = XLSX.utils.json_to_sheet(subRows);

      // Assemble workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');
      XLSX.utils.book_append_sheet(wb, wsSubs, isAws ? 'Account Breakdowns' : 'Subscription Breakdowns');

      // Write and Download
      XLSX.writeFile(wb, `CloudOps_Operational_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Excel export failed:', err);
    }
  };

  // 2. Export PDF Document using 'jspdf' library
  const handleExportPdf = async () => {
    if (!reportData || !reportData.data) {
      console.warn('No report data available to export');
      return;
    }

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const margin = 15;
      let y = 20;
      const isAws = selectedProvider === 'aws';

      // Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(20);
      if (isAws) {
        doc.setTextColor(255, 153, 0); // AWS Orange
      } else {
        doc.setTextColor(0, 120, 212); // Azure Blue
      }
      doc.text('CLOUDOPS ENTERPRISE', margin, y);
      y += 8;

      doc.setFontSize(14);
      doc.setTextColor(100, 116, 139);
      doc.text(isAws ? 'Executive AWS Cloud Management Report' : 'Executive Cloud Management Report', margin, y);
      y += 10;

      // Divider Line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(margin, y, 210 - margin, y);
      y += 10;

      // Summary Details
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, margin, y);
      y += 12;

      // KPI Grid blocks (as text rows)
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      if (isAws) {
        doc.setTextColor(255, 153, 0);
      } else {
        doc.setTextColor(0, 120, 212);
      }
      doc.text('Operational Key Indicators', margin, y);
      y += 8;

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);

      const kpis = [
        `${isAws ? 'Cloud Accounts' : 'Subscriptions'} Connected: ${reportData.subscriptionsCount}`,
        `Discovered Infrastructure Resources: ${reportData.resourcesCount}`,
        `Active Operational Tickets: ${reportData.incidentsCount}`,
        `Monthly Cost Burn Rate: $${reportData.totalSpend} / Budget: $${reportData.totalBudget}`,
        `${isAws ? 'Security Hub Compliance average' : selectedProvider === 'all' ? 'Unified Security Compliance average' : 'Defender Security Compliance average'}: ${reportData.averageSecurityScore}%`,
        `${isAws ? 'AWS Backup Health' : selectedProvider === 'all' ? 'Unified Backup Health' : 'Recovery Services Vault Health'}: ${reportData.averageBackupHealth}%`
      ];

      kpis.forEach(kpi => {
        doc.text(`- ${kpi}`, margin + 5, y);
        y += 6;
      });
      y += 8;

      // Import jspdf-autotable dynamically or assume it modifies jsPDF prototype
      import('jspdf-autotable').then(() => {
        // @ts-expect-error - autotable extends jsPDF instance dynamically
        doc.autoTable({
          startY: y,
          head: [[isAws ? 'Account Name' : 'Subscription Name', 'Resources', 'Spend', 'Budget', 'Security', 'Backup']],
          body: reportData.data.map((sub: any) => [
            sub.subscriptionName,
            `${sub.resourceCount} units`,
            `$${sub.currentSpend}`,
            `$${sub.budget}`,
            `${sub.securityScore}%`,
            `${sub.backupHealth}%`
          ]),
          headStyles: { fillColor: isAws ? [255, 153, 0] : [0, 120, 212], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
          margin: { left: margin, right: margin }
        });

        // @ts-expect-error - autotable extends jsPDF instance dynamically
        const finalY = doc.lastAutoTable.finalY || y + 20;
        
        // Footer notice
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('This document was dynamically compiled via CloudOps SaaS API under SOC2 boundary constraints.', margin, doc.internal.pageSize.getHeight() - 15);

        doc.save(`CloudOps_Executive_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      }).catch(err => {
        console.error('Failed to load jspdf-autotable', err);
        // Fallback or handle error
        doc.save(`CloudOps_Executive_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      });
    } catch (err) {
      console.error('PDF export failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="empty-state" style={{ height: '50vh' }}>
        <div className="spinner mb-2" />
        <p>Compiling report matrices...</p>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Executive Reporting Center</h1>
          <p className="page-subtitle">
            Compile operational performance averages and download PDF audits or Excel sheets.
          </p>
        </div>

        <button 
          className="btn btn-secondary btn-sm"
          onClick={fetchReportData}
          disabled={isRefreshing}
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {/* Grid: Overview cards + Exporters */}
      <div className="grid-3">
        {/* Statistics panel */}
        <div className="card col-span-2">
          <div className="card-header">
            <h2 className="card-title">
              <FileBarChart size={16} color={selectedProvider === 'aws' ? '#FF9900' : "var(--azure-600)"} />
              Executive Operational Metrics
            </h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div className="card p-4" style={{ background: 'var(--bg-surface-secondary)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Monthly Spend</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: selectedProvider === 'aws' ? '#FF9900' : 'var(--azure-600)', margin: '4px 0' }}>${reportData?.totalSpend}</div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Target budget: ${reportData?.totalBudget}</span>
              </div>

              <div className="card p-4" style={{ background: 'var(--bg-surface-secondary)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Discovered Resources</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: selectedProvider === 'aws' ? '#FF9900' : 'var(--azure-600)', margin: '4px 0' }}>{reportData?.resourcesCount}</div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Across {reportData?.subscriptionsCount} {selectedProvider === 'aws' ? 'Accounts' : 'Subs'}</span>
              </div>

              <div className="card p-4" style={{ background: 'var(--bg-surface-secondary)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Security Compliance</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#107C10', margin: '4px 0' }}>{reportData?.averageSecurityScore}%</div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{selectedProvider === 'aws' ? 'Security Hub Average' : selectedProvider === 'all' ? 'Unified Sec Average' : 'Defender Average'}</span>
              </div>

              <div className="card p-4" style={{ background: 'var(--bg-surface-secondary)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Backup Vault Health</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: selectedProvider === 'aws' ? '#FF9900' : 'var(--azure-600)', margin: '4px 0' }}>{reportData?.averageBackupHealth}%</div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Vault Jobs Average</span>
              </div>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 10px' }}>Registered {selectedProvider === 'aws' ? 'Cloud Accounts' : 'Subscriptions'} Summary</h3>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>{selectedProvider === 'aws' ? 'Account Name' : 'Subscription Name'}</th>
                    <th>Resources</th>
                    <th>Spend / Budget</th>
                    <th>Security Score</th>
                    <th>Backup Health</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData?.data?.map((sub: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{sub.subscriptionName}</td>
                      <td>{sub.resourceCount} resources</td>
                      <td>${sub.currentSpend} / ${sub.budget}</td>
                      <td style={{ color: '#107C10', fontWeight: 700 }}>{sub.securityScore}%</td>
                      <td style={{ color: selectedProvider === 'aws' ? '#FF9900' : 'var(--azure-600)', fontWeight: 700 }}>{sub.backupHealth}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Exporters trigger cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* PDF Card */}
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: 24 }}>
              <FileText size={38} color="#D13438" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Download PDF Report</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
                Generate a formatted, single-page executive PDF summarizing resource counts, budgets, and compliance.
              </p>
              <button className="btn btn-primary" onClick={handleExportPdf} style={{ width: '100%' }}>
                <Download size={14} /> Download PDF
              </button>
            </div>
          </div>

          {/* Excel Card */}
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: 24 }}>
              <Table size={38} color="#107C10" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Export Excel Data</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
                Download raw telemetry details (resource inventories, cost metrics) in a multi-sheet spreadsheet.
              </p>
              <button className="btn btn-secondary" onClick={handleExportExcel} style={{ width: '100%' }}>
                <Download size={14} /> Download Excel
              </button>
            </div>
          </div>

          {/* SOC Report Card */}
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: 24 }}>
              <ShieldAlert size={38} color="#FFB900" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Download SOC Audit</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
                Generate a compliance and threat intelligence report containing active critical incidents, threat distribution, and remediation status.
              </p>
              <button className="btn btn-secondary" onClick={() => window.location.href = '/security-soc'} style={{ width: '100%' }}>
                View Live SOC
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
