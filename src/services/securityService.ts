// ============================================================
// Unified Security API Service
// ============================================================
import { api } from './api';
import type { UnifiedSecurityData } from '../store/cloudStore';

export const securityApi = {
  getUnifiedSecurity: (provider: string = 'all') =>
    api.get<UnifiedSecurityData>('/api/monitoring/security/unified', { params: { provider } }),
};
