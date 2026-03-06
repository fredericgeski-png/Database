import React from 'react';

interface Props {
  value: number; // 0-1
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  showBreakdown?: boolean;
  breakdown?: { shannonEntropy: number; loopPenalty: number; toolVariance: number; driftScore: number };
}

const CONFIGS = {
  small:  { r: 28, cx: 36, cy: 36, stroke: 4,  size: 72,  text: 'text-lg'  },
  medium: { r: 42, cx: 54, cy: 54, stroke: 5,  size: 108, text: 'text-2xl' },
  large:  { r: 60, cx: 72, cy: 72, stroke: 7,  size: 144, text: 'text-4xl' },
};

function riskColor(e: number): { stroke: string; text: string; bg: string } {
  if (e < 0.3) return { stroke: '#34d399', text: 'text-emerald-400', bg: 'rgba(52,211,153,0.15)' };
  if (e < 0.5) return { stroke: '#fbbf24', text: 'text-yellow-400',  bg: 'rgba(251,191,36,0.15)'  };
  if (e < 0.7) return { stroke: '#f97316', text: 'text-orange-400',  bg: 'rgba(249,115,22,0.15)'  };
  return              { stroke: '#f87171', text: 'text-red-400',     bg: 'rgba(248,113,113,0.15)'  };
}

export const EntropyGauge: React.FC<Props> = ({ value, size = 'medium', showLabel = true, showBreakdown, breakdown }) => {
  const cfg = CONFIGS[size];
  const color = riskColor(value);
  const circumference = 2 * Math.PI * cfg.r;
  const dash = circumference * Math.min(1, Math.max(0, value));
  const [showTip, setShowTip] = React.useState(false);

  const riskLabel = value < 0.3 ? 'LOW' : value < 0.5 ? 'MEDIUM' : value < 0.7 ? 'HIGH' : 'CRITICAL';

  return (
    <div
      className="relative inline-flex flex-col items-center cursor-pointer"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <svg width={cfg.size} height={cfg.size} className="block">
        {/* Track */}
        <circle
          cx={cfg.cx} cy={cfg.cy} r={cfg.r}
          fill="none" stroke="rgba(255,255,255,0.06)"
          strokeWidth={cfg.stroke}
        />
        {/* Glow circle */}
        <circle
          cx={cfg.cx} cy={cfg.cy} r={cfg.r}
          fill="none" stroke={color.stroke}
          strokeWidth={cfg.stroke}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cfg.cx} ${cfg.cy})`}
          style={{ transition: 'stroke-dasharray 0.6s ease', filter: `drop-shadow(0 0 6px ${color.stroke})` }}
        />
        {/* Center text */}
        <text
          x={cfg.cx} y={cfg.cy + 5}
          textAnchor="middle" dominantBaseline="middle"
          className={`font-mono font-bold ${cfg.text}`}
          fill={color.stroke}
          fontSize={cfg.size * 0.24}
        >
          {Math.round(value * 100)}%
        </text>
      </svg>

      {showLabel && (
        <span className={`text-xs mt-1 font-mono tracking-wider ${color.text}`}>{riskLabel}</span>
      )}

      {/* Breakdown tooltip */}
      {showTip && breakdown && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 w-56 z-20 shadow-2xl text-xs">
          <p className="text-gray-400 font-semibold mb-2 tracking-wider uppercase">Breakdown</p>
          {Object.entries({
            'Shannon': breakdown.shannonEntropy,
            'Loop Penalty': breakdown.loopPenalty,
            'Tool Variance': breakdown.toolVariance,
            'Drift': breakdown.driftScore,
          }).map(([k, v]) => (
            <div key={k} className="flex justify-between items-center mb-1">
              <span className="text-gray-500">{k}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${v * 100}%`, background: riskColor(v).stroke }}
                  />
                </div>
                <span className={riskColor(v).text}>{(v * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
