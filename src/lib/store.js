import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const storePath = path.join(dataDir, 'store.json');

let data = { guilds: {} };
let saveTimer = null;

export function defaultGuildConfig() {
  return {
    antinuke: {
      enabled: false,
      punishment: 'ban', // ban | kick | strip | none
      windowMs: 10_000,
      trustAdmins: true,
      thresholds: {
        ban: 3,
        kick: 3,
        channelDelete: 2,
        channelCreate: 3,
        roleDelete: 2,
        roleCreate: 3,
        webhookCreate: 2,
        memberRoleUpdate: 5,
        adminGrant: 1,
        botAdd: 1,
      },
      whitelist: { users: [], roles: [] },
    },
    antiraid: {
      enabled: false,
      joinThreshold: 5,
      windowMs: 10_000,
      minAccountAgeDays: 7,
      action: 'kick', // kick | ban | quarantine | none
      raidMode: false,
    },
    automod: {
      enabled: false,
      action: 'delete', // delete | timeout | kick
      timeoutMinutes: 10,
      spam: { enabled: true, threshold: 5, windowMs: 5000 },
      invites: { enabled: true },
      links: { enabled: false },
      caps: { enabled: false, percent: 70, minLength: 12 },
      mentions: { enabled: true, limit: 5 },
      emojis: { enabled: true, limit: 10 },
      bannedWords: [],
      exemptRoles: [],
      exemptChannels: [],
      exemptUsers: [],
    },
    logs: {
      enabled: false,
      channelId: null,
      events: { messages: true, members: true, moderation: true, server: true, voice: true },
    },
    welcome: {
      enabled: false,
      channelId: null,
      message: 'Welcome {user} to **{server}**! You are member #{count}.',
      goodbye: { enabled: false, channelId: null, message: '**{user}** left the server.' },
    },
    autorole: { enabled: false, roleIds: [] },
    verification: { enabled: false, channelId: null, roleId: null, messageId: null },
    quarantineRoleId: null,
    lockdown: { active: false, channels: [] },
    counter: 0,
    cases: [],
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mergeDeep(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch === undefined ? base : patch;

  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = isPlainObject(value) && isPlainObject(base[key]) ? mergeDeep(base[key], value) : value;
  }
  return result;
}

export async function initStore() {
  await mkdir(dataDir, { recursive: true });

  try {
    const parsed = JSON.parse(await readFile(storePath, 'utf8'));
    data = { guilds: parsed?.guilds ?? {} };
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Could not read the data store:', error.message);
    data = { guilds: {} };
  }

  // Fill in any config keys added since the file was written.
  for (const [guildId, guildData] of Object.entries(data.guilds)) {
    data.guilds[guildId] = mergeDeep(defaultGuildConfig(), guildData);
  }
}

export function getGuild(guildId) {
  if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuildConfig();
  return data.guilds[guildId];
}

export function setGuild(guildId, patch) {
  data.guilds[guildId] = mergeDeep(getGuild(guildId), patch);
  scheduleSave();
  return data.guilds[guildId];
}

export async function saveStore() {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${storePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2));
  await rename(tmpPath, storePath);
}

export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStore().catch((error) => console.error('Failed to save the data store:', error));
  }, 500);
}

export async function flushStore() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  await saveStore();
}

export function addCase(guildId, fields) {
  const guild = getGuild(guildId);
  guild.counter = (guild.counter ?? 0) + 1;
  const entry = { id: guild.counter, createdAt: Date.now(), ...fields };
  guild.cases.push(entry);
  if (guild.cases.length > 5000) guild.cases.splice(0, guild.cases.length - 5000);
  scheduleSave();
  return entry;
}

export function getCase(guildId, caseId) {
  return getGuild(guildId).cases.find((entry) => entry.id === caseId) ?? null;
}

export function listCases(guildId, { userId, type } = {}) {
  return getGuild(guildId).cases.filter(
    (entry) => (!userId || entry.userId === userId) && (!type || entry.type === type),
  );
}

export function updateCase(guildId, caseId, patch) {
  const entry = getCase(guildId, caseId);
  if (!entry) return null;
  Object.assign(entry, patch);
  scheduleSave();
  return entry;
}
