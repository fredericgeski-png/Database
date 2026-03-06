import React from 'react';
import { KineticIntegrityMonitor } from '../components/KineticIntegrityMonitor';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-[#080b0f] text-white" style={{ fontFamily: "'DM Mono', monospace" }}>
      {/* Nav */}
      <header className="border-b border-gray-800/80 backdrop-blur sticky top-0 z-40 bg-[#080b0f]/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="#06b6d4" strokeWidth="1.5" />
              <path d="M8 14 L12 10 L16 16 L20 12" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="20" cy="12" r="2" fill="#f87171"/>
            </svg>
            <span className="text-base font-bold tracking-tight">
              <span className="text-cyan-400">KINETIC</span>
            </span>
            <span className="text-xs text-gray-600 border border-gray-700 px-1.5 py-0.5 rounded">v1.0</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs text-gray-500">
            <a href="/dashboard" className="text-white">Dashboard</a>
            <a href="/pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="/docs" className="hover:text-white transition-colors">Docs</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { window.location.href = 'https://fredericgeski.selar.com/727l48e1z1'; }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold
                bg-gradient-to-r from-cyan-600/20 to-blue-600/20
                hover:from-cyan-600/30 hover:to-blue-600/30
                border border-cyan-500/40 rounded-lg transition-all text-cyan-400"
            >
              ⚡ Pro
            </button>
            <button
              onClick={() => { localStorage.removeItem('jwt_token'); window.location.href = '/login'; }}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <KineticIntegrityMonitor />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 mt-16 py-6 text-center text-xs text-gray-700">
        KINETIC INTEGRITY MONITOR · Self-hosted AI observability ·{' '}
        <a href="https://fredericgeski.selar.com/727l48e1z1" className="text-cyan-700 hover:text-cyan-500 transition-colors">
          Upgrade to Pro
        </a>
      </footer>
    </div>
  );
}
