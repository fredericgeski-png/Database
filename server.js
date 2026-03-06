/**
 * Kinetic Integrity Monitor — server.js
 * Single-file Express server. No build step, no TypeScript.
 * Auto-creates DB tables on first boot.
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
require('dotenv').config();

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

// ── DB pool ───────────────────────────────────────────────────────────────────
// Try every variable name Railway might use
const DB_URL =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRESQL_URL ||
  process.env.POSTGRES_PRIVATE_URL ||
  process.env.DATABASE_PRIVATE_URL ||
  null;

console.log('🔍 ENV VARS AVAILABLE:', Object.keys(process.env).filter(k =>
  k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('PG') || k.includes('RAILWAY')
));
console.log('🔍 DB_URL found:', DB_URL ? DB_URL.replace(/:([^:@]+)@/, ':***@') : 'NONE');

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── Auto-migrate: create tables if they don't exist ──────────────────────────
async function migrate() {
  const sql = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS users (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email             VARCHAR(255) UNIQUE NOT NULL,
      password_hash     VARCHAR(255) NOT NULL,
      subscription_tier VARCHAR(50) DEFAULT 'free',
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      last_login_at     TIMESTAMPTZ,
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agents (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            VARCHAR(255) NOT NULL,
      framework       VARCHAR(50) DEFAULT 'custom',
      status          VARCHAR(50) DEFAULT 'active',
      entropy_score   DECIMAL(5,4),
      tokens_consumed BIGINT DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_entropy (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id         UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      entropy_score    DECIMAL(5,4) NOT NULL,
      shannon_entropy  DECIMAL(5,4),
      loop_penalty     DECIMAL(5,4),
      tool_variance    DECIMAL(5,4),
      drift_score      DECIMAL(5,4),
      metrics_snapshot JSONB,
      calculated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id    UUID REFERENCES agents(id) ON DELETE SET NULL,
      event_type  VARCHAR(100) NOT NULL,
      event_data  JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_webhooks (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url        TEXT NOT NULL,
      events     TEXT[] DEFAULT '{"*"}',
      is_active  BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_agents_user       ON agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_entropy_agent     ON agent_entropy(agent_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_user    ON telemetry_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_time    ON telemetry_events(created_at DESC);
  `;
  try {
    await pool.query(sql);
    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    // Don't crash — tables may already exist partially
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

const globalLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const entropyLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use('/api/', globalLimiter);

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing Authorization header' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token', message: 'Token expired or invalid' });
  }
}

// ── Root + Health ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'Kinetic Integrity Monitor',
    version: '1.0.0',
    status: 'running',
    docs: '/health',
    upgrade: 'https://fredericgeski.selar.com/727l48e1z1',
  });
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', db: 'disconnected', error: err.message });
  }
});

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/v1/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)    return res.status(400).json({ error: 'email and password required' });
    if (password.length < 8)    return res.status(400).json({ error: 'password must be ≥8 characters' });

    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length)     return res.status(409).json({ error: 'email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const user = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id, email, subscription_tier',
      [email, hash]
    );
    const token = jwt.sign({ id: user.rows[0].id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: user.rows[0] });
  } catch (e) {
    console.error('[SIGNUP]', e.message);
    res.status(500).json({ error: 'signup failed', detail: e.message });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)  return res.status(400).json({ error: 'email and password required' });

    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length)  return res.status(401).json({ error: 'invalid credentials' });

    const user  = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)               return res.status(401).json({ error: 'invalid credentials' });

    await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email, subscription_tier: user.subscription_tier } });
  } catch (e) {
    console.error('[LOGIN]', e.message);
    res.status(500).json({ error: 'login failed', detail: e.message });
  }
});

// ── Agents ────────────────────────────────────────────────────────────────────
const AGENT_LIMITS = { free: 5, pro: -1 };

app.get('/api/v1/agents', auth, async (req, res) => {
  try {
    const userRow = await pool.query('SELECT subscription_tier FROM users WHERE id=$1', [req.user.id]);
    const tier    = userRow.rows[0]?.subscription_tier || 'free';
    const agents  = await pool.query(
      'SELECT id, name, framework, status, entropy_score, tokens_consumed, created_at FROM agents WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    const limit = AGENT_LIMITS[tier] ?? 5;
    res.json({
      agents: agents.rows,
      subscription: {
        tier,
        agent_count: agents.rows.length,
        agent_limit: limit,
        percentage_used: limit === -1 ? 0 : Math.round((agents.rows.length / limit) * 100),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v1/agents', auth, async (req, res) => {
  try {
    const { name, framework = 'custom' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    const userRow = await pool.query('SELECT subscription_tier FROM users WHERE id=$1', [req.user.id]);
    const tier    = userRow.rows[0]?.subscription_tier || 'free';
    const limit   = AGENT_LIMITS[tier] ?? 5;

    if (limit !== -1) {
      const count = await pool.query('SELECT COUNT(*) FROM agents WHERE user_id=$1', [req.user.id]);
      if (parseInt(count.rows[0].count) >= limit) {
        return res.status(402).json({
          error:       'agent_limit_reached',
          message:     'Upgrade to Pro for unlimited agents',
          upgrade_url: 'https://fredericgeski.selar.com/727l48e1z1',
        });
      }
    }

    const agent = await pool.query(
      'INSERT INTO agents (user_id, name, framework) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, name, framework]
    );
    res.status(201).json(agent.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/v1/agents/:id', auth, async (req, res) => {
  const result = await pool.query('DELETE FROM agents WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'not found' });
  res.json({ success: true });
});

// ── Entropy engine ────────────────────────────────────────────────────────────
function clamp(n)  { return Math.min(1, Math.max(0, isNaN(n) ? 0 : n)); }
function avg(arr)  { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function riskLevel(e) { return e < 0.3 ? 'low' : e < 0.5 ? 'medium' : e < 0.7 ? 'high' : 'critical'; }

function calcShannon(tu) {
  if (!tu || !tu.total_tokens) return 0;
  const p1 = tu.prompt_tokens / tu.total_tokens;
  const p2 = tu.completion_tokens / tu.total_tokens;
  let h = 0;
  if (p1 > 0) h -= p1 * Math.log2(p1);
  if (p2 > 0) h -= p2 * Math.log2(p2);
  let vol = 0;
  if (tu.history && tu.history.length > 1) {
    const m = avg(tu.history);
    const v = tu.history.reduce((a, b) => a + (b - m) ** 2, 0) / tu.history.length;
    vol = m > 0 ? clamp((Math.sqrt(v) / m) * 0.5) : 0;
  }
  return clamp(h + vol);
}

function calcLoop(loopCount, et) {
  if (!et) return clamp(loopCount / 10);
  const lp = clamp(loopCount / 10);
  const td = clamp((et.p99_ms - et.average_ms) / Math.max(et.average_ms, 1));
  return clamp(lp * 0.7 + td * 0.3);
}

function calcToolVariance(tc) {
  if (!tc || !tc.total || !tc.by_tool) return 0;
  const tools = Object.keys(tc.by_tool);
  if (!tools.length) return 0;
  const h = tools.reduce((a, t) => {
    const p = tc.by_tool[t] / tc.total;
    return p > 0 ? a - p * Math.log2(p) : a;
  }, 0);
  const max = Math.log2(tools.length);
  return max > 0 ? clamp(h / max) : 0;
}

function calcDrift(drift, tu) {
  if (!drift) {
    const h = tu && tu.history;
    if (!h || h.length < 2) return 0;
    const recent = avg(h.slice(-5));
    const older  = avg(h.slice(0, 5));
    return older > 0 ? clamp(Math.abs(recent - older) / older) : 0;
  }
  const td = Math.abs(drift.current_tokens - drift.baseline_tokens) / Math.max(drift.baseline_tokens, 1);
  const tt = Math.abs(drift.current_time   - drift.baseline_time)   / Math.max(drift.baseline_time, 1);
  return clamp(td * 0.6 + tt * 0.4);
}

function calculateKineticEntropy(metrics) {
  const shannon = calcShannon(metrics.token_usage);
  const loop    = calcLoop(metrics.loop_count, metrics.execution_time);
  const toolVar = calcToolVariance(metrics.tool_calls);
  const drift   = calcDrift(metrics.drift_metrics, metrics.token_usage);
  const total   = shannon * 0.25 + loop * 0.35 + toolVar * 0.20 + drift * 0.20;
  return {
    totalEntropy: clamp(total),
    breakdown: { shannonEntropy: shannon, loopPenalty: loop, toolVariance: toolVar, driftScore: drift },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function emitTelemetry(userId, agentId, eventType, data) {
  try {
    await pool.query(
      'INSERT INTO telemetry_events (user_id, agent_id, event_type, event_data) VALUES ($1,$2,$3,$4)',
      [userId, agentId || null, eventType, JSON.stringify(data)]
    );
  } catch (e) { console.error('[TELEMETRY_EMIT]', e.message); }
}

async function triggerWebhooks(userId, eventType, data) {
  try {
    const { rows } = await pool.query(
      'SELECT url, events FROM user_webhooks WHERE user_id=$1 AND is_active=true', [userId]
    );
    const payload = JSON.stringify({ event: eventType, data, timestamp: new Date().toISOString() });
    for (const w of rows) {
      const ev = w.events || ['*'];
      if (!ev.includes('*') && !ev.includes(eventType)) continue;
      fetch(w.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  } catch (e) { console.error('[WEBHOOK]', e.message); }
}

// ── Entropy route ─────────────────────────────────────────────────────────────
app.post('/api/v1/calculate-entropy', entropyLimiter, auth, async (req, res) => {
  try {
    const { agent_id, metrics } = req.body || {};
    if (!agent_id) return res.status(400).json({ error: 'agent_id is required' });
    if (!metrics)  return res.status(400).json({ error: 'metrics is required' });

    for (const k of ['token_usage', 'execution_time', 'loop_count', 'tool_calls']) {
      if (!(k in metrics)) return res.status(400).json({ error: `Missing metric: ${k}` });
    }

    const agentRow = await pool.query('SELECT id, user_id, name FROM agents WHERE id=$1', [agent_id]);
    if (!agentRow.rows.length)               return res.status(404).json({ error: 'agent not found' });
    if (agentRow.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const result = calculateKineticEntropy(metrics);

    const record = await pool.query(
      `INSERT INTO agent_entropy
         (agent_id, entropy_score, shannon_entropy, loop_penalty, tool_variance, drift_score, metrics_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, calculated_at`,
      [agent_id, result.totalEntropy, result.breakdown.shannonEntropy, result.breakdown.loopPenalty,
       result.breakdown.toolVariance, result.breakdown.driftScore, JSON.stringify(metrics)]
    );

    // Update agent's latest entropy
    await pool.query('UPDATE agents SET entropy_score=$1, updated_at=NOW() WHERE id=$2', [result.totalEntropy, agent_id]);

    const THRESHOLD = 0.85;
    let killed = false;
    if (result.totalEntropy >= THRESHOLD) {
      killed = true;
      await pool.query("UPDATE agents SET status='terminated', updated_at=NOW() WHERE id=$1", [agent_id]);
      await emitTelemetry(req.user.id, agent_id, 'kill_switch_auto_triggered', { entropy_score: result.totalEntropy });
      await triggerWebhooks(req.user.id, 'agent.killswitch.triggered', { agent_id, entropy_score: result.totalEntropy });
    }

    await emitTelemetry(req.user.id, agent_id, 'entropy_calculated', {
      entropy_score: result.totalEntropy,
      breakdown: result.breakdown,
      kill_switch_triggered: killed,
      waste_prevented_usd: Math.round(Math.floor(result.breakdown.loopPenalty * 10) * 150 * result.totalEntropy * 100) / 100,
    });

    res.json({
      agent_id,
      agent_name: agentRow.rows[0].name,
      entropy: { total: result.totalEntropy, breakdown: result.breakdown, risk_level: riskLevel(result.totalEntropy) },
      waste_prevented_usd: Math.round(Math.floor(result.breakdown.loopPenalty * 10) * 150 * result.totalEntropy * 100) / 100,
      kill_switch_triggered: killed,
      entropy_record_id: record.rows[0].id,
      calculated_at: record.rows[0].calculated_at,
    });
  } catch (e) {
    console.error('[ENTROPY]', e.message);
    res.status(500).json({ error: 'calculation failed', detail: e.message });
  }
});

app.get('/api/v1/calculate-entropy/:agentId/history', auth, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const agentRow = await pool.query('SELECT user_id FROM agents WHERE id=$1', [req.params.agentId]);
    if (!agentRow.rows.length)                    return res.status(404).json({ error: 'not found' });
    if (agentRow.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    const history = await pool.query(
      'SELECT id, entropy_score, shannon_entropy, loop_penalty, tool_variance, drift_score, calculated_at FROM agent_entropy WHERE agent_id=$1 ORDER BY calculated_at DESC LIMIT $2 OFFSET $3',
      [req.params.agentId, limit, offset]
    );
    res.json({ agent_id: req.params.agentId, history: history.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Kill-switch ───────────────────────────────────────────────────────────────
let globalKillActive = false;

app.post('/api/v1/kill-switch/activate', auth, async (req, res) => {
  try {
    const { reason = 'Manual activation', agent_ids } = req.body || {};
    let terminated;
    if (agent_ids && Array.isArray(agent_ids) && agent_ids.length) {
      terminated = await pool.query(
        "UPDATE agents SET status='terminated', updated_at=NOW() WHERE id=ANY($1::uuid[]) AND user_id=$2 AND status='active' RETURNING id, name",
        [agent_ids, req.user.id]
      );
    } else {
      globalKillActive = true;
      terminated = await pool.query(
        "UPDATE agents SET status='terminated', updated_at=NOW() WHERE user_id=$1 AND status='active' RETURNING id, name",
        [req.user.id]
      );
    }
    await emitTelemetry(req.user.id, null, 'kill_switch_activated', { reason, terminated_count: terminated.rowCount });
    await triggerWebhooks(req.user.id, 'kill_switch.activated', { reason, terminated_count: terminated.rowCount });
    res.json({ success: true, terminated_count: terminated.rowCount, terminated_agents: terminated.rows });
  } catch (e) {
    console.error('[KILL_SWITCH]', e.message);
    res.status(500).json({ error: 'kill switch failed', detail: e.message });
  }
});

app.post('/api/v1/kill-switch/reset', auth, async (req, res) => {
  globalKillActive = false;
  await pool.query("UPDATE agents SET status='active', updated_at=NOW() WHERE user_id=$1 AND status='terminated'", [req.user.id]);
  await emitTelemetry(req.user.id, null, 'kill_switch_reset', {});
  res.json({ success: true, reset_at: new Date().toISOString() });
});

app.get('/api/v1/kill-switch/status', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT status, COUNT(*) FROM agents WHERE user_id=$1 GROUP BY status', [req.user.id]);
  res.json({ global_kill_active: globalKillActive, agent_status_counts: rows });
});

// ── Telemetry ─────────────────────────────────────────────────────────────────
app.get('/api/v1/telemetry/stats', auth, async (req, res) => {
  try {
    const [stats, active, kills] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE event_type='entropy_calculated') AS calcs,
           AVG((event_data->>'entropy_score')::float) FILTER (WHERE event_type='entropy_calculated') AS avg_entropy,
           SUM((event_data->>'waste_prevented_usd')::float) FILTER (WHERE event_type='entropy_calculated') AS total_waste
         FROM telemetry_events WHERE user_id=$1 AND created_at > NOW() - INTERVAL '24 hours'`,
        [req.user.id]
      ),
      pool.query("SELECT COUNT(*) FROM agents WHERE user_id=$1 AND status='active'", [req.user.id]),
      pool.query(
        "SELECT COUNT(*) FROM telemetry_events WHERE user_id=$1 AND event_type LIKE 'kill_switch%' AND created_at > NOW() - INTERVAL '24 hours'",
        [req.user.id]
      ),
    ]);
    res.json({
      last_24_hours: {
        entropy_calculations:      parseInt(stats.rows[0].calcs)       || 0,
        average_entropy:           parseFloat(stats.rows[0].avg_entropy) || 0,
        total_waste_prevented_usd: parseFloat(stats.rows[0].total_waste) || 0,
        active_sessions:           parseInt(active.rows[0].count)      || 0,
        kill_switch_triggers:      parseInt(kills.rows[0].count)       || 0,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v1/telemetry', auth, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    const conditions = ['user_id=$1'];
    const params     = [req.user.id];
    let i = 2;
    if (req.query.event_type) { conditions.push(`event_type=$${i++}`); params.push(req.query.event_type); }
    if (req.query.agent_id)   { conditions.push(`agent_id=$${i++}`);   params.push(req.query.agent_id); }

    const where = conditions.join(' AND ');
    const [events, countRes] = await Promise.all([
      pool.query(`SELECT id, agent_id, event_type, event_data, created_at FROM telemetry_events WHERE ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i+1}`, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM telemetry_events WHERE ${where}`, params),
    ]);
    const total = parseInt(countRes.rows[0].count);
    res.json({ events: events.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Webhooks ──────────────────────────────────────────────────────────────────
app.get('/api/v1/webhooks', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, url, events, is_active, created_at FROM user_webhooks WHERE user_id=$1', [req.user.id]);
  res.json({ webhooks: rows });
});

app.post('/api/v1/webhooks', auth, async (req, res) => {
  const { url, events = ['*'] } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  const { rows } = await pool.query(
    'INSERT INTO user_webhooks (user_id, url, events) VALUES ($1,$2,$3) RETURNING *',
    [req.user.id, url, events]
  );
  res.status(201).json(rows[0]);
});

app.delete('/api/v1/webhooks/:id', auth, async (req, res) => {
  const result = await pool.query('DELETE FROM user_webhooks WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ success: !!result.rowCount });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'not_found', message: 'Endpoint not found' }));

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  console.log('⏳ Connecting to database...');
  // Retry DB connection up to 10 times (Railway Postgres may take a moment)
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Database connected');
      break;
    } catch (err) {
      if (attempt === 10) {
        console.error('❌ Could not connect after 10 attempts:', err.message);
        console.error('❌ DB_URL:', DB_URL ? DB_URL.replace(/:([^:@]+)@/, ':***@') : 'UNDEFINED');
        // Still start server — health endpoint will show unhealthy
        break;
      }
      console.log(`⏳ DB not ready (attempt ${attempt}/10), retrying in 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  await migrate();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Kinetic running on port ${PORT}`);
    console.log(`📊 Health: http://0.0.0.0:${PORT}/health`);
    console.log(`🔑 JWT_SECRET: ${JWT_SECRET === 'dev-secret-change-in-prod' ? '⚠️  using default (set JWT_SECRET in env)' : '✅ set'}`);
    console.log(`🗄️  DB: ${process.env.POSTGRES_URL || process.env.DATABASE_URL ? '✅ env var found' : '❌ POSTGRES_URL not set'}`);
  });
}

start();
