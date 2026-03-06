import { Router, Request, Response } from 'express';
import { pool } from '../index';
import { calculateKineticEntropy } from '../services/entropy';
import { emitTelemetryEvent } from '../services/telemetry';
import { triggerWebhook } from '../services/webhook';

const router = Router();

const KILL_SWITCH_THRESHOLD = 0.85;
const REQUIRED_METRICS = ['token_usage', 'execution_time', 'loop_count', 'tool_calls'];

/**
 * POST /api/v1/calculate-entropy
 * Compute kinetic entropy with full breakdown; auto-triggers kill-switch above threshold.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { agent_id, metrics } = req.body;
    const userId = (req as any).user?.id;

    if (!agent_id) return res.status(400).json({ error: 'validation_error', message: 'agent_id is required' });
    if (!metrics || typeof metrics !== 'object')
      return res.status(400).json({ error: 'validation_error', message: 'metrics object is required' });

    const missing = REQUIRED_METRICS.filter(k => !(k in metrics));
    if (missing.length > 0)
      return res.status(400).json({ error: 'validation_error', message: `Missing metrics: ${missing.join(', ')}` });

    const agentRow = await pool.query(
      'SELECT id, user_id, name, status FROM agents WHERE id = $1',
      [agent_id]
    );
    if (agentRow.rows.length === 0)
      return res.status(404).json({ error: 'agent_not_found', message: 'Agent not found' });

    const agent = agentRow.rows[0];
    if (agent.user_id !== userId)
      return res.status(403).json({ error: 'forbidden', message: 'Access denied' });

    // Core calculation
    const result = calculateKineticEntropy(metrics);

    // Persist entropy record
    const record = await pool.query(
      `INSERT INTO agent_entropy
         (agent_id, entropy_score, shannon_entropy, loop_penalty, tool_variance, drift_score, metrics_snapshot, calculated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      [
        agent_id,
        result.totalEntropy,
        result.breakdown.shannonEntropy,
        result.breakdown.loopPenalty,
        result.breakdown.toolVariance,
        result.breakdown.driftScore,
        JSON.stringify(metrics),
      ]
    );

    // Auto kill-switch
    let killSwitchTriggered = false;
    if (result.totalEntropy >= KILL_SWITCH_THRESHOLD) {
      killSwitchTriggered = true;
      await pool.query('UPDATE agents SET status=$1, updated_at=NOW() WHERE id=$2', ['terminated', agent_id]);
      await emitTelemetryEvent({
        user_id: userId,
        agent_id,
        event_type: 'kill_switch_auto_triggered',
        data: { entropy_score: result.totalEntropy, threshold: KILL_SWITCH_THRESHOLD, agent_name: agent.name },
      });
      await triggerWebhook(userId, 'agent.killswitch.triggered', {
        agent_id, agent_name: agent.name,
        entropy_score: result.totalEntropy,
        triggered_at: new Date().toISOString(),
      });
    }

    // Emit standard calc event
    await emitTelemetryEvent({
      user_id: userId,
      agent_id,
      event_type: 'entropy_calculated',
      data: { entropy_score: result.totalEntropy, breakdown: result.breakdown, kill_switch_triggered: killSwitchTriggered },
    });

    const wastePrevented = estimateWastePrevented(result);

    res.json({
      agent_id,
      agent_name: agent.name,
      entropy: {
        total: result.totalEntropy,
        breakdown: result.breakdown,
        risk_level: riskLevel(result.totalEntropy),
      },
      waste_prevented_usd: wastePrevented,
      kill_switch_triggered: killSwitchTriggered,
      entropy_record_id: record.rows[0].id,
      calculated_at: record.rows[0].calculated_at,
    });
  } catch (err: any) {
    console.error('[ENTROPY_ERROR]', err.message);
    res.status(500).json({ error: 'calculation_failed', message: 'Failed to calculate entropy' });
  }
});

/**
 * GET /api/v1/calculate-entropy/:agentId/history
 */
router.get('/:agentId/history', async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const userId = (req as any).user?.id;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;

  const agentRow = await pool.query('SELECT user_id FROM agents WHERE id=$1', [agentId]);
  if (!agentRow.rows.length) return res.status(404).json({ error: 'not_found' });
  if (agentRow.rows[0].user_id !== userId) return res.status(403).json({ error: 'forbidden' });

  const history = await pool.query(
    `SELECT id, entropy_score, shannon_entropy, loop_penalty, tool_variance, drift_score, calculated_at
     FROM agent_entropy WHERE agent_id=$1 ORDER BY calculated_at DESC LIMIT $2 OFFSET $3`,
    [agentId, limit, offset]
  );

  res.json({ agent_id: agentId, history: history.rows, limit, offset });
});

function riskLevel(e: number): string {
  if (e < 0.3) return 'low';
  if (e < 0.5) return 'medium';
  if (e < 0.7) return 'high';
  return 'critical';
}

function estimateWastePrevented(result: ReturnType<typeof calculateKineticEntropy>): number {
  const loops = Math.floor(result.breakdown.loopPenalty * 10);
  return Math.round(loops * 150 * result.totalEntropy * 100) / 100;
}

export { router as entropyRouter };
