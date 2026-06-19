// ============================================================
// LiveBadge — Indicates real-time data status
// 🟢 Live | 🟡 Syncing | 🔴 Permission Required | ⚫ Not Configured
// ============================================================

import { useEffect, useState } from 'react';

type BadgeStatus = 'live' | 'syncing' | 'error' | 'unconfigured' | 'stale';

interface LiveBadgeProps {
  status?: BadgeStatus;
  lastUpdated?: string | null;
  provider?: string;
  compact?: boolean;
  showTimestamp?: boolean;
}

const STATUS_CONFIG: Record<BadgeStatus, { emoji: string; label: string; color: string; bg: string }> = {
  live:         { emoji: '🟢', label: 'Live',                color: '#107C10', bg: 'rgba(16,124,16,.1)' },
  syncing:      { emoji: '🟡', label: 'Syncing',             color: '#FFB900', bg: 'rgba(255,185,0,.1)' },
  error:        { emoji: '🔴', label: 'Permission Required', color: '#D13438', bg: 'rgba(209,52,56,.1)' },
  unconfigured: { emoji: '⚫', label: 'Not Configured',      color: '#6B7280', bg: 'rgba(107,114,128,.1)' },
  stale:        { emoji: '🟠', label: 'Stale',               color: '#f97316', bg: 'rgba(249,115,22,.1)' },
};

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function deriveStatus(lastUpdated?: string | null, isSyncing?: boolean, hasError?: boolean, isConfigured?: boolean): BadgeStatus {
  if (isConfigured === false) return 'unconfigured';
  if (hasError) return 'error';
  if (isSyncing) return 'syncing';
  if (!lastUpdated) return 'unconfigured';
  const diff = Date.now() - new Date(lastUpdated).getTime();
  if (diff < 5 * 60000) return 'live';   // < 5 minutes
  if (diff < 30 * 60000) return 'stale'; // < 30 minutes
  return 'stale';
}

export default function LiveBadge({ status = 'unconfigured', lastUpdated, compact, showTimestamp = true }: LiveBadgeProps) {
  const [, setTick] = useState(0);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unconfigured;

  // Re-render every 30s to update relative time
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '2px 6px' : '3px 10px',
        borderRadius: 20,
        background: cfg.bg,
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
        color: cfg.color,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: compact ? 8 : 10 }}>{cfg.emoji}</span>
      {!compact && cfg.label}
      {showTimestamp && lastUpdated && (
        <span style={{ fontWeight: 400, opacity: 0.8, fontSize: compact ? 9 : 10 }}>
          {getTimeAgo(lastUpdated)}
        </span>
      )}
    </span>
  );
}

export { LiveBadge };
