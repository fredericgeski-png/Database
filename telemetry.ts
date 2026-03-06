import { Router, Request, Response } from 'express';
import { pool } from '../index';

const router = Router();

/**
 * GET /api/v1/telemetry
 * Paginated telemetry events, most recent first.
 */
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = (page - 1) * limit;
  const event_type = req.query.event_type as string | undefined;
  const agent_id = req.query.agent_id as string | undefined;

  const conditions = ['user_id=$1'];
  const params: any[] = [userId];
  let i = 2;

  if (event_type) { conditions.push(`event_type=$${i++}`); params.push(event_type); }
  if (agent_id)   { conditions.push(`agent_id=$${i++}`); params.push(agent_id); }

  const where = conditions.join(' AND ');

  const [events, countResult] = await Promise.all([
    pool.query(
      `SELECT id, agent_id, event_type, event_data, created_at
       FROM telemetry_events WHERE ${where}
       ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM telemetry_events WHERE ${where}`, params),
  ]);

  const total = parseInt(countResult.rows[0].count);

  res.json({
    events: events.rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/v1/telemetry/stats
 * Aggregate stats for dashboard: last 24h averages, active sessions, kill triggers.
 */
router.get('/stats', async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;

  const [stats, activeAgents, killEvents] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type='entropy_calculated') AS entropy_calcs,
         AVG((event_data->>'entropy_score')::float) FILTER (WHERE event_type='entropy_calculated') AS avg_entropy,
         SUM((event_data->>'waste_prevented_usd')::float) FILTER (WHERE event_type='entropy_calculated') AS total_waste_prevented
       FROM telemetry_events
       WHERE user_id=$1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    ),
    pool.query(`SELECT COUNT(*) FROM agents WHERE user_id=$1 AND status='active'`, [userId]),
    pool.query(
      `SELECT COUNT(*) FROM telemetry_events
       WHERE user_id=$1 AND event_type LIKE 'kill_switch%' AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    ),
  ]);

  res.json({
    last_24_hours: {
      entropy_calculations: parseInt(stats.rows[0].entropy_calcs) || 0,
      average_entropy: parseFloat(stats.rows[0].avg_entropy) || 0,
      total_waste_prevented_usd: parseFloat(stats.rows[0].total_waste_prevented) || 0,
      active_sessions: parseInt(activeAgents.rows[0].count) || 0,
      kill_switch_triggers: parseInt(killEvents.rows[0].count) || 0,
    },
  });
});

export { router as telemetryRouter };
