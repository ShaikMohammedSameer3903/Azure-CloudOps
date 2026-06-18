import { api } from './api';
import type { SecurityEvent, SecurityStats } from '../types/security';

export const securityApi = {
  getDashboardStats: async (): Promise<SecurityStats> => {
    const response = await api.get<SecurityStats>('/api/security/dashboard');
    return response as any;
  },

  getEvents: async (): Promise<SecurityEvent[]> => {
    const response = await api.get<SecurityEvent[]>('/api/security/events');
    return response as any;
  },

  getThreats: async (): Promise<SecurityEvent[]> => {
    const response = await api.get<SecurityEvent[]>('/api/security/threats');
    return response as any;
  },

  remediateEvent: async (id: string): Promise<SecurityEvent> => {
    const response = await api.post<SecurityEvent>('/api/security/remediate', { id });
    return response as any;
  },

  acknowledgeEvent: async (id: string): Promise<SecurityEvent> => {
    const response = await api.post<SecurityEvent>('/api/security/acknowledge', { id });
    return response as any;
  }
};
