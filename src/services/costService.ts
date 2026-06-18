// ============================================================
// Unified Cost API Service
// ============================================================
import { api } from './api';
import type { UnifiedCostData } from '../store/cloudStore';

export const costApi = {
  getUnifiedCost: (provider: string = 'all') =>
    api.get<UnifiedCostData>('/api/monitoring/cost/unified', { params: { provider } }),
};
