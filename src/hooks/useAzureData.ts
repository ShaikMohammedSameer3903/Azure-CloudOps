import { useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { api } from '../services/api';

export function useAzureData() {
  const {
    activeSubscriptionId,
    activeResourceGroupId,
    setResources,
    setResourceGroups,
    setLastResourceSync,
    setCostSummary,
    setSecurityScore,
    setAdvisorRecommendations,
    setRiskScore,
    setCloudHealthScore,
    setDefenderStatus,
    setServiceHealthAlerts,
    setLastUpdated,
    setIsRefreshing,
    addNotification
  } = useAppStore();

  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (isAutoRefresh = false) => {
    if (!activeSubscriptionId) return;

    if (!isAutoRefresh) {
      setIsRefreshing(true);
      setError(null);
    }

    try {
      // Build base params
      const params = new URLSearchParams({ subscriptionId: activeSubscriptionId });
      if (activeResourceGroupId) {
        params.append('resourceGroup', activeResourceGroupId);
      }
      const qs = `?${params.toString()}`;

      // Parallel data fetching for performance
      const [
        resourcesRes,
        groupsRes,
        costRes,
        riskRes,
        cloudHealthRes,
        defenderRes,
        advisorRes,
        healthRes
      ] = await Promise.allSettled([
        api.get<any>(`/api/resources${qs}`),
        api.get<any>(`/api/resources/groups/${activeSubscriptionId}`),
        api.get<any>(`/api/monitoring/cost${qs}`),
        api.get<any>(`/api/monitoring/risk${qs}`),
        api.get<any>(`/api/monitoring/cloud-health${qs}`),
        api.get<any>(`/api/monitoring/defender${qs}`),
        api.get<any>(`/api/monitoring/advisor${qs}`),
        api.get<any>(`/api/monitoring/health${qs}`)
      ]);

      // Handle Resources
      if (resourcesRes.status === 'fulfilled' && resourcesRes.value) {
        setResources(resourcesRes.value);
      }
      
      // Handle Resource Groups
      if (groupsRes.status === 'fulfilled' && groupsRes.value) {
        setResourceGroups(groupsRes.value);
      }

      // Handle Cost
      if (costRes.status === 'fulfilled' && costRes.value) {
        setCostSummary(costRes.value);
      }

      // Handle Risk
      if (riskRes.status === 'fulfilled' && riskRes.value) {
        setRiskScore(riskRes.value);
      }

      // Handle Cloud Health
      if (cloudHealthRes.status === 'fulfilled' && cloudHealthRes.value) {
        setCloudHealthScore(cloudHealthRes.value);
      }

      // Handle Defender
      if (defenderRes.status === 'fulfilled' && defenderRes.value) {
        const defenderData = defenderRes.value;
        setDefenderStatus(defenderData);
        if (defenderData.secureScore) setSecurityScore(defenderData.secureScore);
      }

      // Handle Advisor
      if (advisorRes.status === 'fulfilled' && advisorRes.value) {
        setAdvisorRecommendations(advisorRes.value?.recommendations || []);
      }

      // Handle Service Health
      if (healthRes.status === 'fulfilled' && healthRes.value) {
        setServiceHealthAlerts(healthRes.value);
      }

      setLastUpdated(new Date().toISOString());
      setLastResourceSync(new Date().toISOString());
      
    } catch (err: any) {
      console.error('Failed to fetch Azure dashboard data:', err);
      setError(err.message || 'Failed to sync Azure data');
      addNotification({
        id: Date.now().toString(),
        type: 'system',
        title: 'Data Sync Failed',
        message: 'Could not fetch latest Azure data. Check your connection.',
        severity: 'warning',
        timestamp: new Date().toISOString(),
        read: false
      });
    } finally {
      if (!isAutoRefresh) {
        setIsRefreshing(false);
      }
    }
  }, [
    activeSubscriptionId,
    activeResourceGroupId,
    setResources,
    setResourceGroups,
    setCostSummary,
    setRiskScore,
    setCloudHealthScore,
    setDefenderStatus,
    setSecurityScore,
    setAdvisorRecommendations,
    setServiceHealthAlerts,
    setLastUpdated,
    setLastResourceSync,
    setIsRefreshing,
    addNotification
  ]);

  return {
    fetchDashboardData,
    error,
    isLoading: useAppStore((state) => state.isRefreshing)
  };
}
