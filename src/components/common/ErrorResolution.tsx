import { AlertCircle, RefreshCw, HelpCircle } from 'lucide-react';

interface ErrorResolutionProps {
  operation: string;
  errorMsg: string;
  onRetry: () => void;
  onClose?: () => void;
}

export default function ErrorResolution({ operation, errorMsg, onRetry, onClose }: ErrorResolutionProps) {
  
  // Resolve standard Azure/Credential errors to professional suggested fixes
  const getFixRecommendation = (msg: string) => {
    const lower = msg.toLowerCase();
    if (lower.includes('quota') || lower.includes('limit') || lower.includes('exceeded')) {
      return 'Choose a smaller SKU size (e.g. Standard_B1s) or submit an Azure portal support request to increase resource quota limits.';
    }
    if (lower.includes('authorization') || lower.includes('permission') || lower.includes('unauthorized') || lower.includes('forbidden')) {
      return 'Verify that the registered Service Principal / App Registration has the appropriate Azure RBAC roles (Contributor, Owner) assigned on this Subscription or Resource Group scope.';
    }
    if (lower.includes('credential') || lower.includes('authenticate') || lower.includes('auth')) {
      return 'Validate your AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET environment variables. Ensure the client secret has not expired.';
    }
    if (lower.includes('not found') || lower.includes('notfound')) {
      return 'Verify that the target resource exists in Azure and has not been deleted or moved to a different resource group.';
    }
    return 'Check your internet connection, verify the Azure health status page for outages, or review the API logs for deep tracing.';
  };

  const fixTip = getFixRecommendation(errorMsg);

  return (
    <div style={{
      background: 'rgba(239, 68, 68, 0.08)',
      border: '1px solid rgba(239, 68, 68, 0.25)',
      borderRadius: 12,
      padding: '20px',
      margin: '20px 0',
      fontFamily: 'Outfit, sans-serif'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          padding: 8,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <AlertCircle size={18} color="#ef4444" />
        </div>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Operation Failed: {operation}
          </h4>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>Reason:</strong> {errorMsg || 'An unknown network error occurred.'}
        </div>
        <div style={{
          display: 'flex',
          gap: 6,
          background: 'rgba(0, 0, 0, 0.15)',
          padding: '10px 12px',
          borderRadius: 6,
          marginTop: 4
        }}>
          <HelpCircle size={14} style={{ flexShrink: 0, marginTop: 2, color: '#38bdf8' }} />
          <div>
            <strong style={{ color: '#38bdf8' }}>Recommended Fix:</strong> {fixTip}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 12px'
            }}
          >
            Dismiss
          </button>
        )}
        <button
          onClick={onRetry}
          style={{
            background: '#ef4444',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <RefreshCw size={13} />
          <span>Retry Operation</span>
        </button>
      </div>
    </div>
  );
}
