import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getCase } from '../lib/store.js';
import { caseEmbed } from '../lib/moderation.js';
import { errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Show a moderation case by number')
    .addIntegerOption((option) => option.setName('id').setDescription('Case number').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const entry = getCase(interaction.guild.id, interaction.options.getInteger('id'));

    if (!entry) {
      await interaction.reply({ embeds: [errorEmbed('No case with that number exists.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = caseEmbed(entry).setFooter({ text: `Created ${new Date(entry.createdAt).toUTCString()}` });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
