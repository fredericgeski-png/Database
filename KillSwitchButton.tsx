import React, { useState } from 'react';

interface Props {
  onActivate: (reason: string) => void;
  loading?: boolean;
}

export const KillSwitchButton: React.FC<Props> = ({ onActivate, loading }) => {
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('confirm')}
        className="w-full py-2.5 px-3 text-sm font-bold rounded-lg
          bg-gradient-to-r from-red-700 to-red-600
          hover:from-red-600 hover:to-red-500
          border border-red-500/50
          shadow-[0_0_20px_rgba(239,68,68,0.3)]
          hover:shadow-[0_0_30px_rgba(239,68,68,0.5)]
          transition-all duration-200 active:scale-95"
      >
        🛑 KILL ALL AGENTS
      </button>
    );
  }

  return (
    <div className="bg-red-950/50 border border-red-500/70 rounded-lg p-3 space-y-2">
      <p className="text-red-400 text-xs font-bold tracking-wider uppercase">⚠ Confirm Termination</p>
      <p className="text-gray-500 text-xs">All active agents will be terminated immediately.</p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={() => setStep('idle')}
          className="py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={loading}
          onClick={() => { onActivate('Emergency shutdown'); setStep('idle'); }}
          className="py-2 text-xs bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg font-bold transition-colors"
        >
          {loading ? '…' : 'CONFIRM'}
        </button>
      </div>
    </div>
  );
};
