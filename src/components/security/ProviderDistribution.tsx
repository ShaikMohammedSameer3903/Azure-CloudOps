import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { SecurityEvent } from '../../types/security';

interface Props {
  events: SecurityEvent[];
}

const COLORS = { aws: '#FF9900', azure: '#0078D4', gcp: '#4285F4' };

export default React.memo(function ProviderDistribution({ events }: Props) {
  const data = useMemo(() => {
    const counts = { aws: 0, azure: 0, gcp: 0 };
    events.forEach(e => {
      if (counts[e.provider] !== undefined) counts[e.provider]++;
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({ name: name.toUpperCase(), value, provider: name }));
  }, [events]);

  return (
    <div className="chart-container" style={{ height: 250 }}>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.provider as keyof typeof COLORS] || '#ccc'} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: 'var(--shadow-md)' }} />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
          No data available
        </div>
      )}
    </div>
  );
});
