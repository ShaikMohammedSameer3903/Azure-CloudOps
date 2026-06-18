// ============================================================
// Cloud Accounts API Service
// ============================================================
import { api } from './api';
import type { CloudAccount } from '../store/cloudStore';

export const cloudAccountsApi = {
  getAll: () => api.get<CloudAccount[]>('/api/cloud-accounts'),

  addAzure: (data: { subscriptionId: string; accountName: string; azureTenantId?: string }) =>
    api.post<CloudAccount>('/api/cloud-accounts/azure', data),

  addAws: (data: { accountId: string; accountName: string; region: string; roleArn?: string }) =>
    api.post<CloudAccount>('/api/cloud-accounts/aws', data),

  remove: (id: string) => api.delete(`/api/cloud-accounts/${id}`),

  sync: (id: string) => api.post(`/api/cloud-accounts/${id}/sync`),
};
