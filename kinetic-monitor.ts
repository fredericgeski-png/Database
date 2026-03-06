/**
 * @kinetic/monitor — Node.js / TypeScript SDK
 * npm install @kinetic/monitor
 */

import fetch from 'node-fetch'; // node 18+: global fetch available

export interface KineticConfig {
  apiKey: string;
  agentId: string;
  baseUrl?: string;
  autoKill?: boolean;
  killThreshold?: number;
  verbose?: boolean;
}

export interface EntropyMetrics {
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    history?: number[];
  };
  execution_time: { average_ms: number; p95_ms: number; p99_ms: number };
  loop_count: number;
  tool_calls: { total: number; by_tool: Record<string, number> };
  drift_metrics?: { baseline_tokens: number; current_tokens: number; baseline_time: number; current_time: number };
}

class MetricsCollector {
  promptTokens = 0;
  completionTokens = 0;
  tokenHistory: number[] = [];
  loopCount = 0;
  toolCalls: Record<string, number> = {};
  stepTimes: number[] = [];
  private lastStepTime = Date.now();

  reset() {
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.tokenHistory = [];
    this.loopCount = 0;
    this.toolCalls = {};
    this.stepTimes = [];
    this.lastStepTime = Date.now();
  }

  onLlmCall(promptTokens: number, completionTokens: number) {
    this.promptTokens += promptTokens;
    this.completionTokens += completionTokens;
    this.tokenHistory.push(promptTokens + completionTokens);
  }

  onLoop() { this.loopCount++; }

  onToolCall(toolName: string) {
    this.toolCalls[toolName] = (this.toolCalls[toolName] || 0) + 1;
    const now = Date.now();
    this.stepTimes.push(now - this.lastStepTime);
    this.lastStepTime = now;
  }

  buildMetrics(): EntropyMetrics {
    const total = this.promptTokens + this.completionTokens;
    const times = this.stepTimes.length ? this.stepTimes : [0];
    const sorted = [...times].sort((a, b) => a - b);
    return {
      token_usage: {
        prompt_tokens: this.promptTokens,
        completion_tokens: this.completionTokens,
        total_tokens: total,
        history: this.tokenHistory.slice(-50),
      },
      execution_time: {
        average_ms: times.reduce((a, b) => a + b, 0) / times.length,
        p95_ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        p99_ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
      },
      loop_count: this.loopCount,
      tool_calls: {
        total: Object.values(this.toolCalls).reduce((a, b) => a + b, 0),
        by_tool: { ...this.toolCalls },
      },
    };
  }
}

export class KineticMonitor {
  private config: Required<KineticConfig>;
  private collector = new MetricsCollector();

  constructor(config: KineticConfig) {
    this.config = {
      baseUrl: 'https://app.kinetic.ai',
      autoKill: true,
      killThreshold: 0.85,
      verbose: false,
      ...config,
    };
  }

  /**
   * Wrap an async agent function.
   * @example
   *   const run = monitor.wrapAgent(async (input) => { ... });
   */
  wrapAgent<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return (async (...args: any[]) => {
      this.collector.reset();
      try {
        return await fn(...args);
      } finally {
        await this.flush();
      }
    }) as T;
  }

  /**
   * Express/Next.js middleware that tracks per-request metrics.
   */
  middleware() {
    return (req: any, res: any, next: () => void) => {
      const start = Date.now();
      this.collector.reset();

      res.on('finish', async () => {
        this.collector.onLlmCall(
          parseInt(res.getHeader?.('x-prompt-tokens') as string) || 0,
          parseInt(res.getHeader?.('x-completion-tokens') as string) || 0
        );
        await this.flush();
        if (this.config.verbose) {
          console.log(`[kinetic] ${req.method} ${req.path} — ${Date.now() - start}ms`);
        }
      });
      next();
    };
  }

  // ── Manual tracking ──────────────────────────────────────────────────────

  trackLlm(promptTokens: number, completionTokens: number) {
    this.collector.onLlmCall(promptTokens, completionTokens);
  }
  trackLoop() { this.collector.onLoop(); }
  trackTool(name: string) { this.collector.onToolCall(name); }

  async flush() {
    try {
      const metrics = this.collector.buildMetrics();
      const res = await fetch(`${this.config.baseUrl}/api/v1/calculate-entropy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'User-Agent': 'kinetic-node/1.0.0',
        },
        body: JSON.stringify({ agent_id: this.config.agentId, metrics }),
      });
      const data = await res.json() as any;
      if (this.config.verbose) {
        console.log(`[kinetic] entropy=${data.entropy?.total?.toFixed(3)} risk=${data.entropy?.risk_level}`);
      }
      return data;
    } catch (err) {
      if (this.config.verbose) console.error('[kinetic] flush error:', err);
      return null;
    }
  }
}

// ── LangChain.js callback handler ─────────────────────────────────────────────

export function createLangChainCallbackHandler(monitor: KineticMonitor) {
  return {
    handleLLMEnd: async (output: any) => {
      const usage = output?.llmOutput?.tokenUsage ?? {};
      monitor.trackLlm(usage.promptTokens ?? 0, usage.completionTokens ?? 0);
    },
    handleToolStart: async (_tool: any, input: string) => {
      monitor.trackTool(input);
    },
    handleAgentAction: async () => {
      monitor.trackLoop();
    },
    handleChainEnd: async () => {
      await monitor.flush();
    },
  };
}
