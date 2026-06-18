export interface RemediationAction {
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  timestamp: string;
  executor?: string;
  error?: string;
}

export interface SecurityEvent {
  id: string;
  provider: 'aws' | 'azure' | 'gcp';
  source: 'CloudTrail' | 'Security Hub' | 'Defender' | 'GuardDuty';
  eventName: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'Open' | 'Resolved' | 'Acknowledged';
  resource: string;
  service: string;
  region: string;
  timestamp: string;
  user: string;
  ip: string;
  remediation?: RemediationAction[];
}

export interface SecurityStats {
  totalIncidents: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolved: number;
  open: number;
  autoRemediated: number;
  securityScore: number;
  threatScore: number;
}
