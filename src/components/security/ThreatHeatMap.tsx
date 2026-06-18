import React, { useMemo } from 'react';
import type { SecurityEvent } from '../../types/security';

interface Props {
  events: SecurityEvent[];
}

export default React.memo(function ThreatHeatMap({ events }: Props) {
  // A simple grid-based heat map simulator for targeted services
  const data = useMemo(() => {
    const services = ['IAM', 'EC2', 'S3', 'Lambda', 'RDS', 'VPC', 'CloudTrail', 'GuardDuty'];
    const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
    
    const matrix = regions.map(region => {
      const row: Record<string, string | number> = { region };
      services.forEach(svc => {
        row[svc] = events.filter(e => 
          (e.region === region) && 
          (e.service.includes(svc) || e.eventName.includes(svc))
        ).length;
      });
      return row;
    });
    
    return { matrix, services, regions };
  }, [events]);

  const getHeatColor = (value: number) => {
    if (value === 0) return 'var(--bg-surface-secondary)';
    if (value < 2) return 'rgba(255,185,0,.2)';
    if (value < 5) return 'rgba(255,185,0,.6)';
    if (value < 10) return 'rgba(209,52,56,.6)';
    return 'var(--danger-600)';
  };

  return (
    <div style={{ overflowX: 'auto', padding: '10px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-tertiary)', padding: 4 }}>Region</th>
            {data.services.map(svc => (
              <th key={svc} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', padding: 4, width: '11%' }}>{svc}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.matrix.map(row => (
            <tr key={row.region as string}>
              <td style={{ fontSize: 11, fontWeight: 500, padding: 4 }}>{row.region as string}</td>
              {data.services.map(svc => {
                const val = row[svc] as number;
                return (
                  <td key={svc} title={`${val} incidents`}>
                    <div style={{ 
                      height: 24, borderRadius: 4, background: getHeatColor(val),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: val > 5 ? 'white' : 'transparent', transition: 'background 0.3s'
                    }}>
                      {val > 0 ? val : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
