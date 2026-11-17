import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChannelType } from 'discord.js';
import { getGuild, listCases, setGuild } from '../lib/store.js';
import { sanitizePatch } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_COOKIE = 'dash_session';
const STATE_COOKIE = 'dash_state';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BODY_LIMIT = 200 * 1024;

const DISCORD_API = 'https://discord.com/api/v10';
const OAUTH_SCOPES = 'identify guilds';
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;

const TEXT_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function redirect(res, location, cookies = []) {
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.writeHead(302, { location, 'cache-control': 'no-store' });
  res.end();
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

function avatarUrl(user) {
  if (!user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
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
 * Start the dashboard. Discord OAuth2 decides who may see and change a guild:
 * the visitor must have Manage Server or Administrator there and the bot must
 * already be in that guild.
 */
export async function startDashboard(client, options = {}) {
  const port = Number(options.port ?? process.env.SERVER_PORT ?? 3000);
  const host = options.host ?? process.env.DASHBOARD_HOST ?? '0.0.0.0';
  const clientId = process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`SERVER_PORT must be a port number, got "${process.env.SERVER_PORT}"`);
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      [
        'Discord OAuth is not configured for the dashboard.',
        'Add DISCORD_CLIENT_SECRET to .env and register this redirect URI in the Developer Portal (OAuth2 → Redirects):',
        `  ${(process.env.DASHBOARD_URL ?? `http://localhost:${port}`).replace(/\/+$/, '')}/auth/callback`,
      ].join('\n'),
    );
  }

  const html = await readFile(path.join(__dirname, 'index.html'), 'utf8');
  const sessions = new Map(); // sid -> { userId, username, avatar, accessToken, expiresAt, guilds }

  function baseUrl() {
    if (options.baseUrl) return String(options.baseUrl).replace(/\/+$/, '');
    if (process.env.DASHBOARD_URL) return process.env.DASHBOARD_URL.replace(/\/+$/, '');
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : port;
    return `http://localhost:${actualPort}`;
  }

  async function discord(pathname, accessToken) {
    const response = await fetchImpl(`${DISCORD_API}${pathname}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw httpError(502, `Discord API returned ${response.status}`);
    return response.json();
  }

  function sessionOf(req) {
    const sid = getCookie(req, SESSION_COOKIE);
    if (!sid) return null;

    const entry = sessions.get(sid);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      sessions.delete(sid);
      return null;
    }

    return { sid, entry };
  }

  /** Guilds this visitor may manage, cached for a minute to spare the API. */
  async function manageableGuilds(session) {
    const { entry } = session;

    if (entry.guilds && Date.now() - entry.guilds.at < 60_000) return entry.guilds.map;

    const list = await discord('/users/@me/guilds', entry.accessToken);
    const map = new Map();

    for (const guild of list) {
      const permissions = BigInt(guild.permissions ?? '0');
      const canManage =
        Boolean(guild.owner) ||
        (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
        (permissions & ADMINISTRATOR) === ADMINISTRATOR;

      if (canManage) map.set(guild.id, { name: guild.name, owner: Boolean(guild.owner) });
    }

    entry.guilds = { at: Date.now(), map };
    return map;
  }

  async function authorizeGuild(session, guildId) {
    const manageable = await manageableGuilds(session);
    if (!manageable.has(guildId)) return { ok: false, status: 403 };
    if (!client.guilds.cache.has(guildId)) return { ok: false, status: 404 };
    return { ok: true };
  }

  function guildCards(session) {
    return manageableGuilds(session).then((manageable) =>
      [...manageable.keys()]
        .map((id) => client.guilds.cache.get(id))
        .filter(Boolean)
        .map((guild) => ({ id: guild.id, name: guild.name, memberCount: guild.memberCount ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  function isHttps(req) {
    return (req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
  }

  function secureFlag(req) {
    return isHttps(req) ? '; Secure' : '';
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const { pathname } = url;

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

      if (req.method === 'GET' && pathname === '/auth/login') {
        const state = randomBytes(24).toString('base64url');
        const params = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: `${baseUrl()}/auth/callback`,
          scope: OAUTH_SCOPES,
          state,
          prompt: 'consent',
        });

        redirect(res, `https://discord.com/oauth2/authorize?${params}`, [
          `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag(req)}`,
        ]);
        return;
      }

      if (req.method === 'GET' && pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const oauthError = url.searchParams.get('error');
        const expectedState = getCookie(req, STATE_COOKIE);

        if (oauthError) {
          redirect(res, `${baseUrl()}/?error=${encodeURIComponent(oauthError)}`);
          return;
        }
        if (!state || !expectedState || state !== expectedState) {
          redirect(res, `${baseUrl()}/?error=state`);
          return;
        }
        if (!code) {
          redirect(res, `${baseUrl()}/?error=missing_code`);
          return;
        }

        let token;
        try {
          const tokenResponse = await fetchImpl('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: 'authorization_code',
              code,
              redirect_uri: `${baseUrl()}/auth/callback`,
            }),
          });

          if (!tokenResponse.ok) {
            console.warn(`Dashboard OAuth token exchange failed: Discord returned ${tokenResponse.status}`);
            redirect(res, `${baseUrl()}/?error=token_exchange`);
            return;
          }
          token = await tokenResponse.json();
        } catch (error) {
          console.warn('Dashboard OAuth token exchange failed:', error.message);
          redirect(res, `${baseUrl()}/?error=token_exchange`);
          return;
        }

        let user;
        try {
          user = await discord('/users/@me', token.access_token);
        } catch (error) {
          console.warn('Dashboard could not read the Discord user:', error.message);
          redirect(res, `${baseUrl()}/?error=profile`);
          return;
        }

        const sid = randomBytes(32).toString('base64url');
        sessions.set(sid, {
          userId: user.id,
          username: user.username,
          displayName: user.global_name ?? null,
          avatar: avatarUrl(user),
          accessToken: token.access_token,
          expiresAt: Date.now() + SESSION_TTL_MS,
          guilds: null,
        });

        redirect(res, `${baseUrl()}/`, [
          `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureFlag(req)}`,
          `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`,
        ]);
        return;
      }

      if (pathname === '/auth/logout' && req.method === 'POST') {
        if (req.headers['x-dashboard'] !== '1') {
          json(res, 403, { error: 'missing request header' });
          return;
        }

        const session = sessionOf(req);
        if (session) sessions.delete(session.sid);

        res.setHeader('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`);
        json(res, 200, { ok: true });
        return;
      }

      if (!pathname.startsWith('/api/')) {
        notFound(res);
        return;
      }

      const session = sessionOf(req);
      if (!session) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }

      if (pathname === '/api/me' || (pathname === '/api/guilds' && req.method === 'GET')) {
        let guilds;
        try {
          guilds = await guildCards(session);
        } catch (error) {
          if (error.status === 502) {
            json(res, 401, { error: 'Discord session expired, sign in again' });
            return;
          }
          throw error;
        }

        json(res, 200, {
          user: {
            id: session.entry.userId,
            username: session.entry.username,
            displayName: session.entry.displayName,
            avatar: session.entry.avatar,
          },
          guilds,
        });
        return;
      }

      const guildMatch = pathname.match(/^\/api\/guilds\/(\d{15,25})$/);
      if (guildMatch) {
        const guildId = guildMatch[1];
        const access = await authorizeGuild(session, guildId);

        if (!access.ok) {
          json(res, access.status, {
            error: access.status === 403 ? 'you do not have Manage Server in that guild' : 'the bot is not in that server',
          });
          return;
        }

        if (req.method === 'GET') {
          json(res, 200, { ...guildPayload(client, guildId), config: getGuild(guildId) });
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
        const access = await authorizeGuild(session, casesMatch[1]);
        if (!access.ok) {
          json(res, access.status, { error: 'no access to that guild' });
          return;
        }

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
  console.log(`  OAuth redirect URI: ${baseUrl()}/auth/callback`);
  console.log('  Sign in with Discord; only servers where you have Manage Server are listed.');

  return server;
}
