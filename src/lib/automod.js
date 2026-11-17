import { PermissionFlagsBits } from 'discord.js';
import { getGuild } from './store.js';

const INVITE_PATTERN = /(?:discord\.gg|discord(?:app)?\.com\/invite|dsc\.gg)\/[a-z0-9-]+/i;
const LINK_PATTERN = /https?:\/\/[^\s]+/i;
const EMOJI_PATTERN = /<a?:\w+:\d+>|\p{Extended_Pictographic}/gu;
const WHITESPACE = /\s+/g;

const spamBuckets = new Map(); // `${guildId}:${userId}` -> timestamps

function isExempt(message, config) {
  if (!message.guild || !message.member) return true;
  if (message.author.bot) return true;
  if (message.author.id === message.guild.ownerId) return true;
  if (message.member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;

  const automod = config.automod;
  if (automod.exemptUsers.includes(message.author.id)) return true;
  if (automod.exemptChannels.includes(message.channel.id)) return true;
  if (automod.exemptRoles.some((roleId) => message.member.roles.cache.has(roleId))) return true;

  return false;
}

function isSpamming(guildId, userId, spam) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const timestamps = (spamBuckets.get(key) ?? []).filter((time) => now - time < spam.windowMs);
  timestamps.push(now);
  spamBuckets.set(key, timestamps);

  if (spamBuckets.size > 5000) {
    for (const [oldKey, times] of spamBuckets) {
      if (!times.length || now - times[times.length - 1] > spam.windowMs * 4) spamBuckets.delete(oldKey);
    }
  }

  return timestamps.length >= spam.threshold;
}

function isCaps(content, caps) {
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length < caps.minLength) return false;
  const upper = letters.replace(/[^A-Z]/g, '');
  return (upper.length / letters.length) * 100 >= caps.percent;
}

function countEmojis(content) {
  return (content.match(EMOJI_PATTERN) ?? []).length;
}

/**
 * Inspect a message against the guild's automod rules.
 * Returns { rule, reason } for the first violation, otherwise null.
 */
export function detectViolation(message, config = getGuild(message.guild.id)) {
  const automod = config.automod;
  if (!automod.enabled) return null;
  if (isExempt(message, config)) return null;

  const content = message.content ?? '';

  if (automod.bannedWords.length) {
    const lowered = content.toLowerCase();
    const word = automod.bannedWords.find((banned) => lowered.includes(banned.toLowerCase()));
    if (word) return { rule: 'banned word', reason: `Used a banned word: ${word}` };
  }

  if (automod.invites.enabled && INVITE_PATTERN.test(content)) {
    return { rule: 'discord invite', reason: 'Posted a Discord invite link' };
  }

  if (automod.links.enabled && LINK_PATTERN.test(content)) {
    return { rule: 'link', reason: 'Posted a link' };
  }

  if (automod.spam.enabled && isSpamming(message.guild.id, message.author.id, automod.spam)) {
    return { rule: 'spam', reason: `Sent ${automod.spam.threshold}+ messages in ${Math.round(automod.spam.windowMs / 1000)}s` };
  }

  const mentionCount = (message.mentions?.users.size ?? 0) + (message.mentions?.roles.size ?? 0);
  if (automod.mentions.enabled && mentionCount >= automod.mentions.limit) {
    return { rule: 'mass mention', reason: `Mentioned ${mentionCount} users/roles` };
  }

  if (automod.emojis.enabled && countEmojis(content) > automod.emojis.limit) {
    return { rule: 'emoji spam', reason: `Used ${countEmojis(content)} emojis` };
  }

  if (automod.caps.enabled && isCaps(content, automod.caps)) {
    return { rule: 'excessive caps', reason: 'Message was mostly capital letters' };
  }

  return null;
}

export function snippet(content, max = 500) {
  const text = String(content ?? '').replace(WHITESPACE, ' ').trim();
  if (!text) return '*(no text content)*';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
