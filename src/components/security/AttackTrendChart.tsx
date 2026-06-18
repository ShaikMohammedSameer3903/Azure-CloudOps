import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { SecurityEvent } from '../../types/security';

interface Props {
  events: SecurityEvent[];
}

export default React.memo(function AttackTrendChart({ events }: Props) {
  const data = useMemo(() => {
    const hours: Record<string, { critical: number; other: number }> = {};
    const now = new Date();
    
    // Initialize last 12 hours
    for (let i = 0; i < 12; i++) {
      const h = new Date(now);
      h.setHours(h.getHours() - (11 - i));
      const label = `${h.getHours().toString().padStart(2, '0')}:00`;
      hours[label] = { critical: 0, other: 0 };
    }

    events.forEach(e => {
      const d = new Date(e.timestamp);
      if (now.getTime() - d.getTime() <= 12 * 3600000) {
        const label = `${d.getHours().toString().padStart(2, '0')}:00`;
        if (hours[label]) {
          if (e.severity === 'CRITICAL') hours[label].critical++;
          else hours[label].other++;
        }
      }
    });

    return Object.entries(hours).map(([time, counts]) => ({
      time,
      Critical: counts.critical,
      Other: counts.other
    }));
  }, [events]);

  return (
    <div className="chart-container" style={{ height: 250 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
          <XAxis dataKey="time" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} />
          <YAxis stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip 
            contentStyle={{ borderRadius: 8, border: 'none', boxShadow: 'var(--shadow-md)', background: 'var(--bg-surface)' }}
          />
          <Line type="monotone" dataKey="Critical" stroke="var(--danger-600)" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="Other" stroke="var(--azure-400)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
