import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EntropyGauge } from './EntropyGauge';
import { AgentChart } from './AgentChart';
import { KillSwitchButton } from './KillSwitchButton';
import { TelemetryFeed } from './TelemetryFeed';

const TOKEN = () => localStorage.getItem('jwt_token') || '';

const apiFetch = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json', ...(opts?.headers || {}) },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
};

export const KineticIntegrityMonitor: React.FC = () => {
  const qc = useQueryClient();
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'success' | 'error' }[]>([]);

  const toast = (msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['telemetry-stats'],
    queryFn: () => apiFetch('/api/v1/telemetry/stats'),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiFetch('/api/v1/agents'),
    refetchInterval: 10000,
  });

  const killMutation = useMutation({
    mutationFn: (reason: string) =>
      apiFetch('/api/v1/kill-switch/activate', { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: data => {
      toast(`✅ Killed ${data.terminated_count} agent(s)`);
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['telemetry-stats'] });
    },
    onError: () => toast('❌ Kill switch failed', 'error'),
  });

  const stat = stats?.last_24_hours;
  const agents = agentsData?.agents || [];
  const sub = agentsData?.subscription;

  return (
    <div className="space-y-6 font-['DM_Mono',_monospace]">
      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg border transition-all
            ${t.type === 'success' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-red-950 border-red-500 text-red-300'}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header bar */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#34d399]" />
          <h2 className="text-xl font-bold tracking-tight">
            <span className="text-cyan-400">KINETIC</span>
            <span className="text-gray-500 mx-2">/</span>
            <span className="text-white">INTEGRITY MONITOR</span>
          </h2>
          <span className="text-xs text-gray-600 font-mono">LIVE · 5s</span>
        </div>

        {sub && !sub.tier.includes('pro') && (
          <button
            onClick={() => { window.location.href = 'https://fredericgeski.selar.com/727l48e1z1'; }}
            className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg transition-all hover:scale-105 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
          >
            ⚡ Upgrade to Pro — $299/mo
          </button>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="AVG ENTROPY"
          loading={statsLoading}
          value={<EntropyGauge value={stat?.average_entropy || 0} size="medium" />}
        />
        <StatCard
          label="ACTIVE SESSIONS"
          loading={statsLoading}
          value={<span className="text-4xl font-bold text-emerald-400 tabular-nums">{stat?.active_sessions ?? '—'}</span>}
          border="border-emerald-500/30"
        />
        <StatCard
          label="WASTE PREVENTED"
          loading={statsLoading}
          value={
            <span className="text-4xl font-bold text-yellow-400 tabular-nums">
              ${(stat?.total_waste_prevented_usd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          }
          border="border-yellow-500/30"
        />
        <StatCard
          label="KILL EVENTS"
          loading={statsLoading}
          value={<span className="text-4xl font-bold text-red-400 tabular-nums">{stat?.kill_switch_triggers ?? '—'}</span>}
          border="border-red-500/30"
        >
          <div className="mt-3">
            <KillSwitchButton onActivate={(reason) => killMutation.mutate(reason)} loading={killMutation.isPending} />
          </div>
        </StatCard>
      </div>

      {/* Agent chart + agent list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-900/60 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm text-gray-400 mb-4 tracking-widest uppercase">Per-Agent Entropy Trend</h3>
          {agentsLoading ? (
            <div className="animate-pulse h-48 bg-gray-800 rounded-lg" />
          ) : (
            <AgentChart agents={agents} />
          )}
        </div>

        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm text-gray-400 tracking-widest uppercase">Agents</h3>
            {sub && (
              <span className="text-xs text-gray-600">
                {sub.agent_count}/{sub.agent_limit === -1 ? '∞' : sub.agent_limit}
              </span>
            )}
          </div>

          {agentsLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="animate-pulse h-14 bg-gray-800 rounded-lg" />)}
            </div>
          ) : agents.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-8">No agents yet</p>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-72 pr-1">
              {agents.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{a.name}</p>
                    <p className="text-xs text-gray-500">{a.framework}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.entropy_score != null && (
                      <span className={`text-xs font-bold tabular-nums ${entropyColor(a.entropy_score)}`}>
                        {(a.entropy_score * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.status === 'active' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                    }`}>
                      {a.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Telemetry feed */}
      <TelemetryFeed />
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  loading?: boolean;
  value?: React.ReactNode;
  border?: string;
  children?: React.ReactNode;
}> = ({ label, loading, value, border = 'border-cyan-500/30', children }) => (
  <div className={`bg-gray-900/60 border ${border} rounded-xl p-5 flex flex-col gap-2`}>
    <p className="text-xs text-gray-500 tracking-widest uppercase">{label}</p>
    {loading ? (
      <div className="animate-pulse h-10 bg-gray-800 rounded" />
    ) : (
      <div className="flex items-center justify-center">{value}</div>
    )}
    {children}
  </div>
);

function entropyColor(e: number): string {
  if (e < 0.3) return 'text-emerald-400';
  if (e < 0.5) return 'text-yellow-400';
  if (e < 0.7) return 'text-orange-400';
  return 'text-red-400';
}

export default KineticIntegrityMonitor;
