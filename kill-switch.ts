import { Router, Request, Response } from 'express';
import { pool } from '../index';
import { emitTelemetryEvent } from '../services/telemetry';
import { triggerWebhook } from '../services/webhook';

const router = Router();

// In-memory global kill flag (use Redis in multi-instance deployments)
let globalKillActive = false;

/**
 * POST /api/v1/kill-switch/activate
 * Terminates ALL active agents for the authenticated user.
 */
router.post('/activate', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { reason = 'Manual activation', agent_ids } = req.body;

  try {
    let query: string;
    let params: any[];

    if (agent_ids && Array.isArray(agent_ids) && agent_ids.length > 0) {
      // Targeted kill
      query = `UPDATE agents SET status='terminated', updated_at=NOW()
               WHERE id = ANY($1::uuid[]) AND user_id=$2 AND status='active'
               RETURNING id, name`;
      params = [agent_ids, userId];
    } else {
      // Global kill
      globalKillActive = true;
      query = `UPDATE agents SET status='terminated', updated_at=NOW()
               WHERE user_id=$1 AND status='active'
               RETURNING id, name`;
      params = [userId];
    }

    const terminated = await pool.query(query, params);

    await emitTelemetryEvent({
      user_id: userId,
      agent_id: null,
      event_type: 'kill_switch_activated',
      data: {
        reason,
        terminated_count: terminated.rowCount,
        terminated_agents: terminated.rows.map(r => r.id),
        global: !agent_ids,
      },
    });

    await triggerWebhook(userId, 'kill_switch.activated', {
      reason,
      terminated_count: terminated.rowCount,
      agents: terminated.rows,
      activated_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      terminated_count: terminated.rowCount,
      terminated_agents: terminated.rows,
      activated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[KILL_SWITCH_ERROR]', err.message);
    res.status(500).json({ error: 'kill_switch_failed', message: 'Failed to activate kill switch' });
  }
});

/**
 * POST /api/v1/kill-switch/reset
 * Reactivates all agents (clears kill flag).
 */
router.post('/reset', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  globalKillActive = false;

  await pool.query(
    `UPDATE agents SET status='active', updated_at=NOW() WHERE user_id=$1 AND status='terminated'`,
    [userId]
  );

  await emitTelemetryEvent({ user_id: userId, agent_id: null, event_type: 'kill_switch_reset', data: {} });

  res.json({ success: true, reset_at: new Date().toISOString() });
});

/**
 * GET /api/v1/kill-switch/status
 */
router.get('/status', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { rows } = await pool.query(
    `SELECT status, COUNT(*) FROM agents WHERE user_id=$1 GROUP BY status`,
    [userId]
  );
  res.json({ global_kill_active: globalKillActive, agent_status_counts: rows });
});

export { router as killSwitchRouter };
