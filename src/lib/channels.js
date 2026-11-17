import { ChannelType } from 'discord.js';

// Discord's CHANNEL_OBFUSCATED flag (1 << 17). discord.js 14.28 does not expose it
// as a named ChannelFlags member yet, so it is defined here.
export const CHANNEL_OBFUSCATED = 1n << 17n;
export const HIDDEN_CHANNEL_NAME = '___hidden___';

// Channel types that live in a guild and can be hidden from the bot.
const GUILD_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
]);

function hasObfuscatedFlag(channel) {
  const { flags } = channel ?? {};
  if (flags == null) return false;

  const bitfield = typeof flags === 'bigint' ? flags : flags.bitfield;
  if (typeof bitfield !== 'bigint') return false;

  return (bitfield & CHANNEL_OBFUSCATED) === CHANNEL_OBFUSCATED;
}

/**
 * Whether the bot can genuinely see this channel.
 *
 * Since 16 November 2026 Discord obfuscates channels the bot cannot view: they are
 * still dispatched over the gateway, but named "___hidden___", flagged with
 * CHANNEL_OBFUSCATED and stripped of their real permission overwrites. Over HTTP
 * they are omitted entirely. Treat all of those as hidden.
 */
export function isViewable(channel) {
  if (!channel) return false;
  if (!GUILD_CHANNEL_TYPES.has(channel.type)) return true;
  if (hasObfuscatedFlag(channel)) return false;
  if (channel.name === HIDDEN_CHANNEL_NAME) return false;
  if (typeof channel.viewable === 'boolean') return channel.viewable;
  return true;
}

export function isObfuscated(channel) {
  if (!channel) return false;
  return !isViewable(channel);
}

/**
 * Split a guild's cached channels into the ones the bot can actually see and the
 * obfuscated ones. Hidden channels are only ever known by ID from the gateway.
 */
export function summarizeChannels(guild) {
  const channels = [...(guild?.channels?.cache?.values?.() ?? [])];
  const visible = channels.filter(isViewable);
  const hidden = channels.filter(isObfuscated);

  return { visible, hidden, total: channels.length };
}

/**
 * Format a channel for logs and embeds without ever leaking a hidden channel name.
 */
export function describeChannel(channel) {
  if (isObfuscated(channel)) return `#hidden (${channel.id})`;
  return `#${channel.name} (${channel.id})`;
}
