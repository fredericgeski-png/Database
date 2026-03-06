import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Agent {
  id: string;
  name: string;
  entropy_score: number | null;
  status: string;
}

interface Props {
  agents: Agent[];
}

const riskColor = (e: number) => {
  if (e < 0.3) return '#34d399';
  if (e < 0.5) return '#fbbf24';
  if (e < 0.7) return '#f97316';
  return '#f87171';
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-white font-semibold">{d.name}</p>
      <p className="text-gray-400">Entropy: <span style={{ color: riskColor(d.entropy) }}>{(d.entropy * 100).toFixed(1)}%</span></p>
      <p className={`${d.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>{d.status}</p>
    </div>
  );
};

export const AgentChart: React.FC<Props> = ({ agents }) => {
  const data = agents
    .filter(a => a.entropy_score != null)
    .map(a => ({ name: a.name.length > 12 ? a.name.slice(0, 12) + '…' : a.name, entropy: a.entropy_score!, status: a.status }))
    .slice(0, 20);

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
        No entropy data yet — run your first calculation
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} barSize={28} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="entropy" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={riskColor(entry.entropy)} style={{ filter: `drop-shadow(0 0 4px ${riskColor(entry.entropy)})` }} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
