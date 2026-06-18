import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { SecurityEvent } from '../../types/security';

interface Props {
  events: SecurityEvent[];
}

const COLORS = {
  CRITICAL: '#D13438',
  HIGH: '#FFB900',
  MEDIUM: '#0078D4',
  LOW: '#107C10'
};

export default React.memo(function SeverityChart({ events }: Props) {
  const data = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    events.forEach(e => {
      if (counts[e.severity] !== undefined) counts[e.severity]++;
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({ name, value }));
  }, [events]);

  return (
    <div className="chart-container" style={{ height: 250 }}>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || '#ccc'} />
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
