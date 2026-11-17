import { Events, PermissionFlagsBits } from 'discord.js';
import { detectViolation, snippet } from '../lib/automod.js';
import { getGuild } from '../lib/store.js';
import { createCase, dmUser } from '../lib/moderation.js';
import { sendLog, logEmbed } from '../lib/logging.js';
import { COLORS } from '../lib/embeds.js';

export function registerAutomod(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot || !message.member) return;

    const config = getGuild(message.guild.id);
    let violation;
    try {
      violation = detectViolation(message, config);
    } catch (error) {
      console.error('Automod detection failed:', error);
      return;
    }
    if (!violation) return;

    const automod = config.automod;
    const me = message.guild.members.me;
    let outcome = 'Message deleted';

    try {
      if (me?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await message.delete().catch(() => null);
      }

      if (automod.action === 'timeout') {
        await message.member
          .timeout(automod.timeoutMinutes * 60_000, `Automod: ${violation.reason}`)
          .catch(() => null);
        outcome = `Timed out for ${automod.timeoutMinutes} minutes`;
      } else if (automod.action === 'kick') {
        await message.member.kick(`Automod: ${violation.reason}`).catch(() => null);
        outcome = 'Kicked';
      }
    } catch (error) {
      console.error('Automod action failed:', error);
    }

    const entry = await createCase(message.guild, {
      type: 'automod',
      user: message.author,
      moderatorId: client.user.id,
      reason: `${violation.rule}: ${violation.reason}`,
      silent: true,
    });

    await sendLog(
      message.guild,
      'moderation',
      logEmbed({
        title: '🤖 Automod',
        color: COLORS.warning,
        description: `**${message.author.tag}** in <#${message.channel.id}> — ${violation.rule}`,
        fields: [
          ['Action', outcome, true],
          ['Case', `#${entry.id}`, true],
          ['Reason', violation.reason],
          ['Message', snippet(message.content ?? '')],
        ],
        thumbnail: message.author.displayAvatarURL({ size: 128 }),
        footer: `User ${message.author.id}`,
      }),
    );

    await dmUser(
      message.author,
      `A message you sent in **${message.guild.name}** was removed: ${violation.reason}`,
    );
  });
}
