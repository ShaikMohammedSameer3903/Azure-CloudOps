import { useState, useEffect, useCallback } from 'react';
import type { SecurityEvent, SecurityStats } from '../types/security';
import { securityApi } from '../services/securityApi';

export function useSecurityEvents(pollingIntervalMs = 60000) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSecurityData = useCallback(async () => {
    try {
      const [eventsData, statsData] = await Promise.all([
        securityApi.getEvents(),
        securityApi.getDashboardStats()
      ]);
      
      setEvents(eventsData);
      setStats(statsData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch security data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityData();
    
    // Polling is aligned with the global app optimization (60s)
    const intervalId = setInterval(fetchSecurityData, pollingIntervalMs);
    return () => clearInterval(intervalId);
  }, [fetchSecurityData, pollingIntervalMs]);

  const triggerRemediation = async (id: string) => {
    try {
      const updatedEvent = await securityApi.remediateEvent(id);
      setEvents(prev => prev.map(e => e.id === id ? updatedEvent : e));
      await fetchSecurityData(); // Refresh stats
      return true;
    } catch (err) {
      console.error('Remediation failed', err);
      return false;
    }
  };

  const acknowledgeEvent = async (id: string) => {
    try {
      const updatedEvent = await securityApi.acknowledgeEvent(id);
      setEvents(prev => prev.map(e => e.id === id ? updatedEvent : e));
      return true;
    } catch (err) {
      console.error('Acknowledge failed', err);
      return false;
    }
  };

  return {
    events,
    stats,
    loading,
    error,
    refresh: fetchSecurityData,
    triggerRemediation,
    acknowledgeEvent
  };
}
