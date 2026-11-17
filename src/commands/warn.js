import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { caseEmbed, createCase, dmUser, hierarchyError } from '../lib/moderation.js';
import { errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member and record it on their history')
    .addUserOption((option) => option.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('What are they being warned for?').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (member) {
      const error = hierarchyError(interaction.guild, interaction.member, member);
      if (error) {
        await interaction.reply({ embeds: [errorEmbed(error)], flags: MessageFlags.Ephemeral });
        return;
      }
    }

    const entry = await createCase(interaction.guild, {
      type: 'warn',
      user: target,
      moderatorId: interaction.user.id,
      reason,
    });

    await dmUser(target, `You were warned in **${interaction.guild.name}**: ${reason}`);
    await interaction.reply({ embeds: [caseEmbed(entry, `Warned ${target.tag}`)] });
  },
};
