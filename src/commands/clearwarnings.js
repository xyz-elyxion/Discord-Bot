import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { listCases, updateCase } from '../lib/store.js';
import { okEmbed, errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription("Clear a member's active warnings")
    .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const active = listCases(interaction.guild.id, { userId: target.id, type: 'warn' }).filter(
      (entry) => !entry.clearedAt,
    );

    if (!active.length) {
      await interaction.reply({
        embeds: [errorEmbed(`${target.tag} has no active warnings.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const now = Date.now();
    for (const entry of active) updateCase(interaction.guild.id, entry.id, { clearedAt: now });

    await interaction.reply({
      embeds: [okEmbed('Warnings cleared', `Cleared **${active.length}** warning(s) for ${target}.`)],
    });
  },
};
