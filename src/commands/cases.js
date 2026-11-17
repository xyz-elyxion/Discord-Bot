import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { listCases } from '../lib/store.js';
import { fieldsEmbed } from '../lib/embeds.js';
import { caseColor } from '../lib/moderation.js';

export default {
  data: new SlashCommandBuilder()
    .setName('cases')
    .setDescription("Show a member's moderation history")
    .addUserOption((option) => option.setName('user').setDescription('Member to look up').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const cases = listCases(interaction.guild.id, { userId: target.id });

    if (!cases.length) {
      await interaction.reply({
        content: `${target.tag} has no moderation history.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const recent = cases.slice(-15);
    const description = recent
      .map(
        (entry) =>
          `**#${entry.id}** \`${entry.type}\` · <t:${Math.floor(entry.createdAt / 1000)}:d> by <@${entry.moderatorId}>\n${entry.reason}`,
      )
      .join('\n\n');

    await interaction.reply({
      embeds: [
        fieldsEmbed(
          `History for ${target.tag}`,
          description,
          [
            ['Cases', String(cases.length), true],
            ['User ID', target.id, true],
          ],
          caseColor(recent[recent.length - 1].type),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
