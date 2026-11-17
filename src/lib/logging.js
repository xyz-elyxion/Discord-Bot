import { EmbedBuilder } from 'discord.js';
import { getGuild } from './store.js';
import { COLORS } from './embeds.js';

export const LOG_CATEGORIES = ['messages', 'members', 'moderation', 'server', 'voice'];

export function logEmbed({ title, description, color = COLORS.primary, fields = [], footer, thumbnail }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();

  if (description) embed.setDescription(description);
  const usable = fields.filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (usable.length) {
    embed.addFields(usable.map(([name, value, inline]) => ({ name, value: String(value), inline: Boolean(inline) })));
  }
  if (footer) embed.setFooter({ text: footer });
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

/**
 * Send an embed to the guild's configured log channel.
 * Honours the per-category toggles and never throws.
 */
export async function sendLog(guild, category, embed) {
  if (!guild) return false;

  const { logs } = getGuild(guild.id);
  if (!logs.enabled || !logs.channelId) return false;
  if (logs.events?.[category] === false) return false;

  const channel = guild.channels.cache.get(logs.channelId) ?? (await guild.channels.fetch(logs.channelId).catch(() => null));
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return false;

  try {
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.warn(`Could not write to the log channel in ${guild.name}:`, error.message);
    return false;
  }
}
