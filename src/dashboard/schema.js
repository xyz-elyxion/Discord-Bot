const toBool = (value) => (typeof value === 'boolean' ? value : undefined);

const toInt = (min, max) => (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, Math.trunc(number)));
};

const toEnum = (...allowed) => (value) => (allowed.includes(value) ? value : undefined);

const toStr = (max) => (value) => (typeof value === 'string' ? value.slice(0, max) : undefined);

const isId = (value) => typeof value === 'string' && /^\d{15,25}$/.test(value);

const toId = (value) => {
  if (value === null || value === '') return null;
  return isId(value) ? value : undefined;
};

const toIdList = (value) => {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter(isId))].slice(0, 100);
};

const toWords = (value) => {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.map((word) => String(word).trim().toLowerCase()).filter(Boolean).map((word) => word.slice(0, 50)))].slice(0, 200);
};

export const THRESHOLD_KEYS = [
  'ban',
  'kick',
  'channelDelete',
  'channelCreate',
  'roleDelete',
  'roleCreate',
  'webhookCreate',
  'memberRoleUpdate',
  'adminGrant',
  'botAdd',
];

/** Every setting the dashboard may change, as a dotted path. */
export const FIELDS = {
  'antinuke.enabled': toBool,
  'antinuke.punishment': toEnum('ban', 'kick', 'strip', 'none'),
  'antinuke.trustAdmins': toBool,
  'antinuke.windowMs': toInt(1000, 600_000),
  'antinuke.whitelist.users': toIdList,
  'antinuke.whitelist.roles': toIdList,

  'antiraid.enabled': toBool,
  'antiraid.action': toEnum('kick', 'ban', 'quarantine', 'none'),
  'antiraid.joinThreshold': toInt(2, 100),
  'antiraid.windowMs': toInt(2000, 600_000),
  'antiraid.minAccountAgeDays': toInt(0, 365),
  'antiraid.raidMode': toBool,

  'automod.enabled': toBool,
  'automod.action': toEnum('delete', 'timeout', 'kick'),
  'automod.timeoutMinutes': toInt(1, 40_320),
  'automod.spam.enabled': toBool,
  'automod.spam.threshold': toInt(2, 100),
  'automod.spam.windowMs': toInt(1000, 600_000),
  'automod.invites.enabled': toBool,
  'automod.links.enabled': toBool,
  'automod.caps.enabled': toBool,
  'automod.caps.percent': toInt(10, 100),
  'automod.caps.minLength': toInt(3, 200),
  'automod.mentions.enabled': toBool,
  'automod.mentions.limit': toInt(1, 50),
  'automod.emojis.enabled': toBool,
  'automod.emojis.limit': toInt(1, 100),
  'automod.bannedWords': toWords,
  'automod.exemptUsers': toIdList,
  'automod.exemptRoles': toIdList,
  'automod.exemptChannels': toIdList,

  'logs.enabled': toBool,
  'logs.channelId': toId,
  'logs.events.messages': toBool,
  'logs.events.members': toBool,
  'logs.events.moderation': toBool,
  'logs.events.server': toBool,
  'logs.events.voice': toBool,

  'welcome.enabled': toBool,
  'welcome.channelId': toId,
  'welcome.message': toStr(2000),
  'welcome.goodbye.enabled': toBool,
  'welcome.goodbye.channelId': toId,
  'welcome.goodbye.message': toStr(2000),

  'autorole.enabled': toBool,
  'autorole.roleIds': toIdList,

  'verification.enabled': toBool,
  'verification.channelId': toId,
  'verification.roleId': toId,

  quarantineRoleId: toId,
};

for (const key of THRESHOLD_KEYS) {
  FIELDS[`antinuke.thresholds.${key}`] = toInt(1, 50);
}

function setPath(target, dottedPath, value) {
  const parts = dottedPath.split('.');
  let cursor = target;

  for (const part of parts.slice(0, -1)) {
    if (typeof cursor[part] !== 'object' || cursor[part] === null) cursor[part] = {};
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
}

/**
 * Turn a flat { "automod.spam.threshold": 5 } body into a nested config patch.
 * Unknown keys are ignored and reported so the UI can surface typos.
 */
export function sanitizePatch(input) {
  const patch = {};
  const applied = [];
  const unknown = [];
  const invalid = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { patch, applied, unknown, invalid: ['body'] };
  }

  for (const [key, value] of Object.entries(input)) {
    const validate = FIELDS[key];
    if (!validate) {
      unknown.push(key);
      continue;
    }

    const clean = validate(value);
    if (clean === undefined) {
      invalid.push(key);
      continue;
    }

    setPath(patch, key, clean);
    applied.push(key);
  }

  return { patch, applied, unknown, invalid };
}
