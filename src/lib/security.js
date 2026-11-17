import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import { getGuild } from './store.js';
import { sendLog, logEmbed } from './logging.js';
import { COLORS } from './embeds.js';

export const AUDIT_EVENTS = {
  ban: AuditLogEvent.MemberBanAdd,
  kick: AuditLogEvent.MemberKick,
  channelDelete: AuditLogEvent.ChannelDelete,
  channelCreate: AuditLogEvent.ChannelCreate,
  roleDelete: AuditLogEvent.RoleDelete,
  roleCreate: AuditLogEvent.RoleCreate,
  webhookCreate: AuditLogEvent.WebhookCreate,
  memberRoleUpdate: AuditLogEvent.MemberRoleUpdate,
  botAdd: AuditLogEvent.BotAdd,
};

const ACTION_LABELS = {
  ban: 'mass banned members',
  kick: 'mass kicked members',
  channelDelete: 'deleted channels',
  channelCreate: 'created channels',
  roleDelete: 'deleted roles',
  roleCreate: 'created roles',
  webhookCreate: 'created webhooks',
  memberRoleUpdate: 'changed member roles',
  adminGrant: 'granted administrator',
  botAdd: 'added a bot',
};

const buckets = new Map(); // `${guildId}:${userId}:${action}` -> timestamps
const punished = new Map(); // `${guildId}:${userId}` -> timestamp
const debounce = new Map(); // `${guildId}:${action}` -> timestamp

function recentActions(key, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((time) => now - time < windowMs);
  list.push(now);
  buckets.set(key, list);

  if (buckets.size > 10_000) {
    for (const [oldKey, times] of buckets) {
      if (!times.length || now - times[times.length - 1] > windowMs * 10) buckets.delete(oldKey);
    }
  }

  return list.length;
}

export function isWhitelisted(guild, member, config) {
  if (!member) return false;
  if (member.id === guild.ownerId) return true;
  if (member.id === guild.members.me?.id) return true;
  if (config.antinuke.whitelist.users.includes(member.id)) return true;
  if (config.antinuke.whitelist.roles.some((roleId) => member.roles.cache.has(roleId))) return true;
  if (config.antinuke.trustAdmins && member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

/** Find who performed an audit-log action, matching on target when possible. */
export async function fetchExecutor(guild, action, targetId) {
  const type = AUDIT_EVENTS[action];
  if (!type) return null;

  try {
    const { entries } = await guild.fetchAuditLogs({ type, limit: 6 });
    const cutoff = Date.now() - 20_000;

    for (const entry of entries.values()) {
      if (entry.createdTimestamp < cutoff) continue;
      if (targetId && String(entry.targetId) !== String(targetId)) continue;
      if (entry.executorId === guild.client.user.id) continue;
      return entry.executor ?? (entry.executorId ? { id: entry.executorId, bot: false } : null);
    }
  } catch {
    return null; // missing View Audit Log
  }

  return null;
}

async function punish(guild, member, punishment, reason) {
  switch (punishment) {
    case 'ban':
      await guild.members.ban(member.id, { reason, deleteMessageSeconds: 0 }).catch(() =>
        member.kick(reason).catch(() => null),
      );
      return 'banned';
    case 'kick':
      await member.kick(reason).catch(() => null);
      return 'kicked';
    case 'strip':
      await member.roles.set([], reason).catch(() => null);
      return 'stripped of roles';
    default:
      return 'no punishment configured';
  }
}

/**
 * Antinuke entry point. Call from the gateway event handlers with the action name
 * and the affected target ID so the audit log entry can be matched.
 */
export async function enforceAntinuke(guild, { action, targetId = null, detail = '' }) {
  if (!guild) return { tripped: false };

  const config = getGuild(guild.id);
  if (!config.antinuke?.enabled) return { tripped: false };

  // Several gateway events can fire for one action; only inspect once per burst.
  const debounceKey = `${guild.id}:${action}:${targetId ?? ''}`;
  const lastSeen = debounce.get(debounceKey) ?? 0;
  if (Date.now() - lastSeen < 1500) return { tripped: false };
  debounce.set(debounceKey, Date.now());

  const executor = await fetchExecutor(guild, action, targetId);
  if (!executor || executor.bot) return { tripped: false };

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (!member) return { tripped: false };
  if (isWhitelisted(guild, member, config)) return { tripped: false };

  const threshold = config.antinuke.thresholds[action] ?? 3;
  const count = recentActions(`${guild.id}:${member.id}:${action}`, config.antinuke.windowMs ?? 10_000);
  if (count < threshold) return { tripped: false, count, threshold };

  const punishKey = `${guild.id}:${member.id}`;
  if (Date.now() - (punished.get(punishKey) ?? 0) < 60_000) return { tripped: false };
  punished.set(punishKey, Date.now());

  const reason = `Anti-nuke: ${ACTION_LABELS[action] ?? action} (${count} in ${Math.round((config.antinuke.windowMs ?? 10_000) / 1000)}s)`;
  const outcome = await punish(guild, member, config.antinuke.punishment, reason);

  await sendLog(
    guild,
    'server',
    logEmbed({
      title: '🛡️ Anti-nuke triggered',
      color: COLORS.danger,
      description: `<@${member.id}> ${ACTION_LABELS[action] ?? action}.`,
      fields: [
        ['Action', action, true],
        ['Triggered', `${count} / ${threshold}`, true],
        ['Punishment', outcome, true],
        ['Detail', detail || '—'],
        ['Executor', `${member.user.tag} (${member.id})`],
      ],
    }),
  );

  return { tripped: true, action, outcome, memberId: member.id, count, threshold };
}
