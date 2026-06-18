import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { useAzureData } from './useAzureData';

export function useAutoRefresh() {
  const { autoRefreshEnabled, refreshInterval } = useAppStore();
  const { fetchDashboardData } = useAzureData();
  const timerRef = useRef<any>(null);

  useEffect(() => {
    // Clear existing timer if any
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Set up new interval if enabled
    if (autoRefreshEnabled && refreshInterval > 0) {
      timerRef.current = setInterval(() => {
        console.log(`[AutoRefresh] Firing background refresh (Interval: ${refreshInterval}s)`);
        fetchDashboardData(true); // pass true for isAutoRefresh to skip loading states
      }, refreshInterval * 1000);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [autoRefreshEnabled, refreshInterval, fetchDashboardData]);

  // Provide manual refresh trigger
  const forceRefresh = () => {
    fetchDashboardData(false);
  };

  return { forceRefresh };
}
