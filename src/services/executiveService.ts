// ============================================================
// Executive Dashboard API Service
// ============================================================
import { api } from './api';
import type { ExecutiveMetrics } from '../store/cloudStore';

export const executiveApi = {
  getMetrics: (provider: string = 'all') =>
    api.get<ExecutiveMetrics>('/api/monitoring/executive', { params: { provider } }),
};
