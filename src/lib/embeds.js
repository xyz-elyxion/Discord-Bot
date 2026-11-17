import { EmbedBuilder } from 'discord.js';

export const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  muted: 0x99aab5,
};

export function okEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(title).setDescription(description ?? null);
}

export function errorEmbed(description, title = 'Error') {
  return new EmbedBuilder().setColor(COLORS.danger).setTitle(title).setDescription(description);
}

export function infoEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.primary).setTitle(title).setDescription(description ?? null);
}

export function warnEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.warning).setTitle(title).setDescription(description ?? null);
}

/** Build an embed from [label, value] pairs, skipping empty values. */
export function fieldsEmbed(title, description, fields, color = COLORS.primary) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title);
  if (description) embed.setDescription(description);

  const usable = fields.filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (usable.length) {
    embed.addFields(usable.map(([name, value, inline]) => ({ name, value: String(value), inline: Boolean(inline) })));
  }

  return embed;
}

export function onOff(value) {
  return value ? '✅ enabled' : '❌ disabled';
}

export function yesNo(value) {
  return value ? 'Yes' : 'No';
}

/** Trim a user-provided string so it always fits an embed field. */
export function clamp(value, max = 1024) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
