import { useState, useEffect } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/environment';

export interface SyncAccountStatus {
  account_id: string;
  provider: string;
  status: 'idle' | 'syncing' | 'completed' | 'error';
  phase: string;
  progress_current: number;
  progress_total: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  account_name?: string;
}

export function useSyncStatus() {
  const { isAuthenticated } = useAuth();
  const [accounts, setAccounts] = useState<SyncAccountStatus[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch initial status
    fetch(`${API_BASE_URL}/api/sync/status`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('cloudops-local-token')}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.accounts) {
          setAccounts(data.accounts);
          setIsSyncing(data.summary?.syncing > 0);
          const completed = data.accounts.filter((a: any) => a.completed_at);
          if (completed.length > 0) {
            completed.sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
            setLastSyncTime(completed[0].completed_at);
          }
        }
      })
      .catch(err => console.error('[useSyncStatus] Failed to fetch initial status:', err));

    let socket: Socket | null = null;
    try {
      socket = io(API_BASE_URL, {
        auth: { token: localStorage.getItem('cloudops-local-token') },
        transports: ['websocket', 'polling']
      });

      socket.on('SYNC_STATUS_CHANGED', (update) => {
        setAccounts(prev => {
          const newAccounts = [...prev];
          const idx = newAccounts.findIndex(a => a.account_id === update.accountId);
          if (idx >= 0) {
            newAccounts[idx] = { ...newAccounts[idx], ...update };
          } else {
            newAccounts.push({
              account_id: update.accountId,
              provider: update.provider,
              status: update.status,
              phase: update.phase,
              progress_current: update.progressCurrent,
              progress_total: update.progressTotal,
              last_error: update.lastError,
              started_at: null,
              completed_at: null
            });
          }
          setIsSyncing(newAccounts.some(a => a.status === 'syncing'));
          if (update.status === 'completed') {
            setLastSyncTime(new Date().toISOString());
          }
          return newAccounts;
        });
      });

    } catch (err) {
      console.error('[useSyncStatus] Socket connection failed:', err);
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [isAuthenticated]);

  return { accounts, isSyncing, lastSyncTime };
}
