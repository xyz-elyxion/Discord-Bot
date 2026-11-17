import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { listCases } from '../lib/store.js';
import { COLORS, fieldsEmbed, errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Show the warnings recorded for a member')
    .addUserOption((option) => option.setName('user').setDescription('Member to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const warnings = listCases(interaction.guild.id, { userId: target.id, type: 'warn' }).filter(
      (entry) => !entry.clearedAt,
    );

    if (!warnings.length) {
      await interaction.reply({
        embeds: [errorEmbed(`${target.tag} has no active warnings.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const listing = warnings
      .slice(-10)
      .map(
        (entry) =>
          `**#${entry.id}** · <t:${Math.floor(entry.createdAt / 1000)}:d> by <@${entry.moderatorId}>\n${entry.reason}`,
      )
      .join('\n\n');

    await interaction.reply({
      embeds: [
        fieldsEmbed(
          `Warnings for ${target.tag}`,
          listing,
          [
            ['Total active', String(warnings.length), true],
            ['User ID', target.id, true],
          ],
          COLORS.warning,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
