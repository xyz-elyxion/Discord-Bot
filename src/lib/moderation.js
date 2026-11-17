import { EmbedBuilder } from 'discord.js';
import { addCase } from './store.js';
import { sendLog } from './logging.js';
import { COLORS } from './embeds.js';

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** Parse "10m", "2h", "7d", "1h30m" into milliseconds. Returns null when invalid. */
export function parseDuration(input) {
  if (!input || typeof input !== 'string') return null;

  const matches = [...input.toLowerCase().matchAll(/(\d+)\s*(s|m|h|d|w)/g)];
  if (!matches.length) return null;

  const ms = matches.reduce((total, [, amount, unit]) => total + Number(amount) * UNITS[unit], 0);
  return ms > 0 ? ms : null;
}

export function formatDuration(ms) {
  if (!ms || ms <= 0) return 'permanent';

  const parts = [];
  let remaining = ms;
  for (const [unit, size] of [['w', UNITS.w], ['d', UNITS.d], ['h', UNITS.h], ['m', UNITS.m], ['s', UNITS.s]]) {
    const amount = Math.floor(remaining / size);
    if (amount > 0) {
      parts.push(`${amount}${unit}`);
      remaining -= amount * size;
    }
  }
  return parts.join(' ') || '0s';
}

export function caseColor(type) {
  switch (type) {
    case 'ban':
    case 'softban':
    case 'massban':
    case 'antinuke':
    case 'raid':
      return COLORS.danger;
    case 'kick':
    case 'timeout':
    case 'automod':
      return COLORS.warning;
    case 'unban':
    case 'untimeout':
    case 'unmute':
    case 'warn-cleared':
      return COLORS.success;
    default:
      return COLORS.primary;
  }
}

export function caseEmbed(entry, title = `Case #${entry?.id ?? '?'}`) {
  const embed = new EmbedBuilder()
    .setColor(caseColor(entry?.type))
    .setTitle(title)
    .addFields(
      { name: 'Type', value: entry?.type ?? 'unknown', inline: true },
      { name: 'User', value: entry?.userId ? `<@${entry.userId}> (${entry.userId})` : 'unknown', inline: true },
      { name: 'Moderator', value: entry?.moderatorId ? `<@${entry.moderatorId}>` : 'system', inline: true },
      { name: 'Reason', value: String(entry?.reason ?? 'No reason provided').slice(0, 1024) },
    );

  if (entry?.createdAt) embed.setTimestamp(Number(entry.createdAt));
  if (entry?.durationMs) embed.addFields({ name: 'Duration', value: formatDuration(entry.durationMs), inline: true });
  if (entry?.clearedAt) embed.addFields({ name: 'Cleared', value: `<t:${Math.floor(entry.clearedAt / 1000)}:R>`, inline: true });

  return embed;
}

/** Record a moderation case and mirror it to the moderation log. */
export async function createCase(guild, { type, user, moderatorId, reason = 'No reason provided', durationMs = null, silent = false }) {
  const entry = addCase(guild.id, {
    type,
    userId: user?.id ?? null,
    userTag: user?.tag ?? null,
    moderatorId: moderatorId ?? null,
    reason,
    durationMs,
  });

  if (!silent) {
    await sendLog(
      guild,
      'moderation',
      caseEmbed(entry, `Case #${entry.id} · ${type}`).setFooter({ text: `Case #${entry.id}` }),
    );
  }

  return entry;
}

export async function dmUser(user, content) {
  if (!user?.send) return false;
  try {
    await user.send(content);
    return true;
  } catch {
    return false; // DMs closed
  }
}

/**
 * Check Discord's role hierarchy before moderating.
 * Returns an error message, or null when the action is allowed.
 */
export function hierarchyError(guild, moderator, target) {
  if (!guild || !target) return 'That member could not be resolved.';
  if (target.id === moderator.id) return 'You cannot moderate yourself.';
  if (target.id === guild.ownerId) return 'You cannot moderate the server owner.';
  if (target.id === guild.members.me?.id) return 'You cannot moderate me.';

  const isOwner = moderator.id === guild.ownerId;
  if (!isOwner && target.roles.highest.position >= moderator.roles.highest.position) {
    return 'That member has a role equal to or higher than yours.';
  }

  const bot = guild.members.me;
  if (bot && target.roles.highest.position >= bot.roles.highest.position) {
    return 'That member has a role equal to or higher than mine — move my role higher.';
  }

  return null;
}

/** Shared guard for every moderation command. */
export function requireGuild(interaction) {
  return interaction.guild ? null : 'This command can only be used in a server.';
}
