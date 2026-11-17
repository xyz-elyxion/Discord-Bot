import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChannelType } from 'discord.js';
import { getGuild, listCases, setGuild } from '../lib/store.js';
import { sanitizePatch } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_COOKIE = 'dash_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BODY_LIMIT = 200 * 1024;

const TEXT_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

function notFound(res) {
  json(res, 404, { error: 'not found' });
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(httpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(httpError(400, 'Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest();
}

function sessions() {
  const sign = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');

  return {
    create(secret) {
      const expires = String(Date.now() + SESSION_TTL_MS);
      return `${expires}.${sign(expires, secret)}`;
    },

    verify(value, secret) {
      if (typeof value !== 'string') return false;
      const [expires, signature] = value.split('.');
      if (!expires || !signature) return false;
      if (!Number.isFinite(Number(expires)) || Number(expires) < Date.now()) return false;

      const expected = Buffer.from(sign(expires, secret));
      const provided = Buffer.from(signature);
      return provided.length === expected.length && timingSafeEqual(provided, expected);
    },
  };
}

function guildPayload(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const channels = [...guild.channels.cache.values()]
    .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type))
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
    .slice(0, 500)
    .map((channel) => ({ id: channel.id, name: channel.name }));

  const roles = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((a, b) => b.position - a.position)
    .slice(0, 250)
    .map((role) => ({ id: role.id, name: role.name }));

  return {
    guild: {
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount ?? null,
      icon: typeof guild.iconURL === 'function' ? guild.iconURL({ size: 64 }) : null,
    },
    channels,
    roles,
  };
}

function caseList(guildId, limit = 50) {
  return listCases(guildId)
    .slice(-limit)
    .reverse()
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      userId: entry.userId,
      userTag: entry.userTag,
      moderatorId: entry.moderatorId,
      reason: entry.reason,
      createdAt: entry.createdAt,
      durationMs: entry.durationMs ?? null,
      clearedAt: entry.clearedAt ?? null,
    }));
}

/**
 * Start the dashboard. Requires SERVER_PORT (defaults to 3000).
 * Returns the http server so tests and shutdown handlers can close it.
 */
export async function startDashboard(client, options = {}) {
  const port = Number(options.port ?? process.env.SERVER_PORT ?? 3000);
  const host = options.host ?? process.env.DASHBOARD_HOST ?? '0.0.0.0';

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`SERVER_PORT must be a port number, got "${process.env.SERVER_PORT}"`);
  }

  const configured = Boolean(process.env.DASHBOARD_PASSWORD);
  const secret = process.env.DASHBOARD_PASSWORD || randomBytes(18).toString('base64url');
  const html = await readFile(path.join(__dirname, 'index.html'), 'utf8');
  const session = sessions();

  const attempts = new Map(); // ip -> { count, resetAt }

  function loginBlocked(ip) {
    const entry = attempts.get(ip);
    if (!entry) return false;
    if (Date.now() > entry.resetAt) {
      attempts.delete(ip);
      return false;
    }
    return entry.count >= 10;
  }

  function recordFailure(ip) {
    const entry = attempts.get(ip);
    if (!entry || Date.now() > entry.resetAt) {
      attempts.set(ip, { count: 1, resetAt: Date.now() + 5 * 60_000 });
      return;
    }
    entry.count += 1;
  }

  function authenticated(req) {
    return session.verify(getCookie(req, SESSION_COOKIE), secret);
  }

  function isHttps(req) {
    return (req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
  }

  function setSessionCookie(req, res) {
    const flags = [
      `${SESSION_COOKIE}=${session.create(secret)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ];
    if (isHttps(req)) flags.push('Secure');
    res.setHeader('set-cookie', flags.join('; '));
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const { pathname } = url;
    const ip = req.socket.remoteAddress ?? 'unknown';

    try {
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'content-security-policy':
            "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
        });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && pathname === '/healthz') {
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/login' && req.method === 'POST') {
        if (req.headers['x-dashboard'] !== '1') {
          json(res, 403, { error: 'missing request header' });
          return;
        }
        if (loginBlocked(ip)) {
          json(res, 429, { error: 'too many attempts, wait a few minutes' });
          return;
        }

        const body = await readJson(req);
        const provided = hash(body.password ?? '');

        if (!timingSafeEqual(provided, hash(secret))) {
          recordFailure(ip);
          json(res, 401, { error: 'wrong password' });
          return;
        }

        attempts.delete(ip);
        setSessionCookie(req, res);
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/logout' && req.method === 'POST') {
        res.setHeader('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
        json(res, 200, { ok: true });
        return;
      }

      if (!pathname.startsWith('/api/')) {
        notFound(res);
        return;
      }

      if (!authenticated(req)) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }

      if (pathname === '/api/guilds' && req.method === 'GET') {
        const guilds = [...client.guilds.cache.values()]
          .map((guild) => ({ id: guild.id, name: guild.name, memberCount: guild.memberCount ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name));

        json(res, 200, { guilds });
        return;
      }

      const guildMatch = pathname.match(/^\/api\/guilds\/(\d{15,25})$/);
      if (guildMatch) {
        const guildId = guildMatch[1];
        const payload = guildPayload(client, guildId);
        if (!payload) {
          json(res, 404, { error: 'the bot is not in that server' });
          return;
        }

        if (req.method === 'GET') {
          json(res, 200, { ...payload, config: getGuild(guildId) });
          return;
        }

        if (req.method === 'PATCH') {
          if (req.headers['x-dashboard'] !== '1') {
            json(res, 403, { error: 'missing request header' });
            return;
          }

          const body = await readJson(req);
          const { patch, applied, unknown, invalid } = sanitizePatch(body);

          if (invalid.length) {
            json(res, 400, { error: 'invalid values', invalid });
            return;
          }
          if (!applied.length) {
            json(res, 400, { error: 'nothing to update', unknown });
            return;
          }

          const config = setGuild(guildId, patch);
          json(res, 200, { ok: true, applied, unknown, config });
          return;
        }

        json(res, 405, { error: 'method not allowed' });
        return;
      }

      const casesMatch = pathname.match(/^\/api\/guilds\/(\d{15,25})\/cases$/);
      if (casesMatch && req.method === 'GET') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
        json(res, 200, { cases: caseList(casesMatch[1], limit) });
        return;
      }

      notFound(res);
    } catch (error) {
      const status = typeof error.status === 'number' ? error.status : 500;
      if (status >= 500) console.error('Dashboard request failed:', error);

      if (!res.headersSent) json(res, status, { error: error.message ?? 'internal error' });
      else res.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const actualPort = server.address().port;
  console.log(`Dashboard listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}`);

  if (!configured) {
    console.warn('DASHBOARD_PASSWORD is not set — use this generated password to sign in:');
    console.warn(`  ${secret}`);
  }

  return server;
}
