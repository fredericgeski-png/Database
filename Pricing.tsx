import React, { useState } from 'react';

const ROI_TABLE = [
  { size: 'Startup',    agents: 5,   loops: 10,  waste: 1500,  savings: 1201 },
  { size: 'Scale-up',  agents: 20,  loops: 40,  waste: 6000,  savings: 5701 },
  { size: 'Enterprise',agents: 100, loops: 200, waste: 30000, savings: 29701 },
];

export default function Pricing() {
  const [agents, setAgents] = useState(10);
  const [frequency, setFrequency] = useState<'daily'|'weekly'|'monthly'>('daily');

  const loops = { daily: agents * 20, weekly: agents * 5, monthly: agents * 1 }[frequency];
  const waste = loops * 150;
  const savings = waste - 299;
  const roi = (savings / 299) * 100;

  return (
    <div className="min-h-screen bg-[#080b0f] text-white" style={{ fontFamily: "'DM Mono', monospace" }}>
      {/* Hero */}
      <div className="border-b border-gray-800/80">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <p className="text-xs text-cyan-500 tracking-[0.3em] uppercase mb-4">Pricing</p>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Stop burning money on<br/>
            <span className="text-cyan-400">runaway agents</span>
          </h1>
          <p className="text-gray-500 text-lg">
            Kinetic pays for itself in days — not months.
          </p>
        </div>
      </div>

      {/* Plans */}
      <div className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Free */}
        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-8">
          <p className="text-xs text-gray-500 tracking-widest uppercase mb-3">Free</p>
          <p className="text-5xl font-bold mb-1">$0</p>
          <p className="text-gray-600 text-sm mb-8">Forever free</p>
          <ul className="space-y-3 text-sm mb-8">
            {['5 agents', 'Basic dashboard', 'Entropy monitoring', 'Email support'].map(f => (
              <li key={f} className="flex items-center gap-2 text-gray-400"><span className="text-emerald-500">✓</span>{f}</li>
            ))}
            {['Advanced analytics', 'Webhook integrations', 'Auto kill-switch', 'Custom rules'].map(f => (
              <li key={f} className="flex items-center gap-2 text-gray-600"><span>✗</span>{f}</li>
            ))}
          </ul>
          <button className="w-full py-3 border border-gray-700 rounded-xl text-sm text-gray-400 hover:border-gray-600 transition-colors">
            Get Started Free
          </button>
        </div>

        {/* Pro */}
        <div className="bg-gradient-to-br from-cyan-950/40 to-blue-950/40 border-2 border-cyan-500/60 rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-cyan-500 text-xs font-bold px-3 py-1 rounded-bl-xl">
            MOST POPULAR
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />

          <p className="text-xs text-cyan-400 tracking-widest uppercase mb-3">Pro</p>
          <p className="text-5xl font-bold mb-1">$299</p>
          <p className="text-gray-500 text-sm mb-8">per month · billed monthly</p>
          <ul className="space-y-3 text-sm mb-8">
            {['Unlimited agents', 'Advanced analytics', 'Priority support', 'Webhook integrations', 'Custom rules', 'Auto kill-switch', 'Export & API access'].map(f => (
              <li key={f} className="flex items-center gap-2 text-gray-300"><span className="text-cyan-400">✓</span>{f}</li>
            ))}
          </ul>
          <button
            onClick={() => { window.location.href = 'https://fredericgeski.selar.com/727l48e1z1'; }}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500
              rounded-xl text-sm font-bold transition-all hover:scale-[1.02]
              shadow-[0_0_30px_rgba(6,182,212,0.25)] hover:shadow-[0_0_40px_rgba(6,182,212,0.4)]"
          >
            Upgrade to Pro →
          </button>
          <p className="text-xs text-gray-600 text-center mt-3">Even 5 agents pays for itself in 4 days</p>
        </div>
      </div>

      {/* ROI Calculator */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-8">
          <h2 className="text-xl font-bold mb-2 text-center">💰 ROI Calculator</h2>
          <p className="text-gray-600 text-sm text-center mb-8">See exactly how fast Kinetic pays for itself</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-xs text-gray-500 tracking-wider uppercase block mb-2">Agents</label>
              <input
                type="number" min={1} max={500} value={agents}
                onChange={e => setAgents(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white
                  focus:border-cyan-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 tracking-wider uppercase block mb-2">Loop Frequency</label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value as any)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white
                  focus:border-cyan-500 focus:outline-none transition-colors"
              >
                <option value="daily">Daily (20 loops/agent)</option>
                <option value="weekly">Weekly (5 loops/agent)</option>
                <option value="monthly">Monthly (1 loop/agent)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              { label: 'Loops/Mo', value: loops.toLocaleString(), color: 'text-white' },
              { label: 'Avg Waste', value: `$${waste.toLocaleString()}`, color: 'text-red-400' },
              { label: 'With Kinetic', value: '$299', color: 'text-cyan-400' },
              { label: 'You Save', value: `$${Math.max(0, savings).toLocaleString()}`, color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-800/50 rounded-xl p-3">
                <p className="text-xs text-gray-600 mb-1">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {savings > 0 && (
            <div className="mt-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">ROI: {roi.toFixed(0)}%</p>
              <p className="text-xs text-gray-600 mt-1">Kinetic pays for itself in {Math.max(1, Math.ceil(299 / (waste / 30))).toFixed(0)} day(s)</p>
            </div>
          )}
        </div>

        {/* ROI Table */}
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-gray-600 tracking-widest uppercase border-b border-gray-800">
                <th className="pb-3 pr-4">Size</th>
                <th className="pb-3 pr-4">Agents</th>
                <th className="pb-3 pr-4">Loops/Mo</th>
                <th className="pb-3 pr-4">Waste/Mo</th>
                <th className="pb-3">Savings/Mo</th>
              </tr>
            </thead>
            <tbody>
              {ROI_TABLE.map(r => (
                <tr key={r.size} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                  <td className="py-3 pr-4 text-gray-300 font-medium">{r.size}</td>
                  <td className="py-3 pr-4 text-gray-500">{r.agents}</td>
                  <td className="py-3 pr-4 text-gray-500">{r.loops}</td>
                  <td className="py-3 pr-4 text-red-400">${r.waste.toLocaleString()}</td>
                  <td className="py-3 text-emerald-400 font-bold">${r.savings.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
