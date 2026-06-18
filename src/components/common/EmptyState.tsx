import { ShieldAlert, RefreshCw, Key, Terminal } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

interface EmptyStateProps {
  onRefresh?: () => void;
  onOpenLogs?: () => void;
}

export default function EmptyState({ onRefresh, onOpenLogs }: EmptyStateProps) {
  const { isRefreshing } = useAppStore();

  const handleManualRefresh = () => {
    if (onRefresh) onRefresh();
    else window.dispatchEvent(new CustomEvent('azure-manual-refresh'));
  };

  const handleOpenLogs = () => {
    if (onOpenLogs) onOpenLogs();
    else console.log('[LOGS] Opening diagnostic log files.');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      background: 'rgba(22, 27, 48, 0.4)',
      border: '1px dashed var(--border-default, rgba(255, 255, 255, 0.08))',
      borderRadius: 12,
      maxWidth: 550,
      margin: '40px auto',
      textAlign: 'center',
      fontFamily: 'Outfit, sans-serif'
    }}>
      <div style={{
        background: 'rgba(245, 158, 11, 0.12)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        color: '#f59e0b',
        width: 48,
        height: 48,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20
      }}>
        <ShieldAlert size={24} />
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-primary)' }}>
        No resources discovered
      </h3>

      <div style={{
        textAlign: 'left',
        background: 'rgba(0, 0, 0, 0.2)',
        padding: '16px 20px',
        borderRadius: 8,
        marginBottom: 24,
        width: '100%'
      }}>
        <h4 style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Possible Causes
        </h4>
        <ul style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
          <li>Azure credentials not configured in <code style={{ color: '#38bdf8' }}>.env</code> or database</li>
          <li>Discovery scan is still running in the background</li>
          <li>The active subscription contains no resources</li>
          <li>Access permissions/IAM roles missing on Azure tenant</li>
        </ul>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          style={{
            background: 'var(--accent-color, #0078d4)',
            color: 'white',
            border: 'none',
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          <span>Run Discovery Scan</span>
        </button>

        <button
          onClick={() => window.location.reload()}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-default, rgba(255, 255, 255, 0.08))',
            color: 'var(--text-primary)',
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Key size={14} />
          <span>Validate Azure Credentials</span>
        </button>

        <button
          onClick={handleOpenLogs}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-default, rgba(255, 255, 255, 0.08))',
            color: 'var(--text-primary)',
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Terminal size={14} />
          <span>Open Logs</span>
        </button>
      </div>
    </div>
  );
}
