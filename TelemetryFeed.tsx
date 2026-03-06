import React from 'react';
import { useQuery } from '@tanstack/react-query';

const apiFetch = (url: string) =>
  fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('jwt_token')}` } }).then(r => r.json());

const EVENT_STYLES: Record<string, string> = {
  entropy_calculated: 'text-cyan-400',
  kill_switch_activated: 'text-red-400',
  kill_switch_auto_triggered: 'text-red-500',
  kill_switch_reset: 'text-emerald-400',
};

export const TelemetryFeed: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['telemetry'],
    queryFn: () => apiFetch('/api/v1/telemetry?limit=20'),
    refetchInterval: 5000,
  });

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm text-gray-400 tracking-widest uppercase">Live Telemetry</h3>
        <span className="text-xs text-gray-600 font-mono">last 20 events · 5s refresh</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="animate-pulse h-8 bg-gray-800 rounded" />)}</div>
      ) : (
        <div className="space-y-1 font-mono text-xs overflow-y-auto max-h-64">
          {(data?.events || []).map((e: any) => (
            <div key={e.id} className="flex items-start gap-3 py-1.5 border-b border-gray-800/50 last:border-0">
              <span className="text-gray-600 whitespace-nowrap">
                {new Date(e.created_at).toLocaleTimeString()}
              </span>
              <span className={`whitespace-nowrap ${EVENT_STYLES[e.event_type] || 'text-gray-400'}`}>
                {e.event_type}
              </span>
              {e.event_data?.entropy_score != null && (
                <span className="text-gray-500">
                  score={((e.event_data.entropy_score) * 100).toFixed(1)}%
                </span>
              )}
              {e.event_data?.terminated_count != null && (
                <span className="text-gray-500">
                  terminated={e.event_data.terminated_count}
                </span>
              )}
            </div>
          ))}
          {!data?.events?.length && <p className="text-gray-600 py-4 text-center">No events yet</p>}
        </div>
      )}
    </div>
  );
};
