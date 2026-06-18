import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { SecurityEvent } from '../../types/security';

interface Props {
  events: SecurityEvent[];
}

export default React.memo(function TopAttackTypes({ events }: Props) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      counts[e.eventName] = (counts[e.eventName] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [events]);

  return (
    <div className="chart-container" style={{ height: 250 }}>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-subtle)" />
            <XAxis type="number" stroke="var(--text-tertiary)" fontSize={12} />
            <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={11} width={100} />
            <Tooltip 
              contentStyle={{ borderRadius: 8, border: 'none', boxShadow: 'var(--shadow-md)', background: 'var(--bg-surface)' }}
              itemStyle={{ color: 'var(--text-primary)' }}
            />
            <Bar dataKey="value" fill="var(--danger-500)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
          No data available
        </div>
      )}
    </div>
  );
});
