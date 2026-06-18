// ============================================================
// Unified Compliance API Service
// ============================================================
import { api } from './api';
import type { UnifiedComplianceData } from '../store/cloudStore';

export const complianceApi = {
  getUnifiedCompliance: (provider: string = 'all', framework: string = 'HIPAA') =>
    api.get<UnifiedComplianceData>('/api/monitoring/compliance/unified', { params: { provider, framework } }),
};
