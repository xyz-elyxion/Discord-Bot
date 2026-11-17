import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { caseEmbed, createCase, hierarchyError } from '../lib/moderation.js';
import { errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a timeout from a member')
    .addUserOption((option) => option.setName('user').setDescription('Member to un-timeout').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      await interaction.reply({ embeds: [errorEmbed('That user is not a member of this server.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const error = hierarchyError(interaction.guild, interaction.member, member);
    if (error) {
      await interaction.reply({ embeds: [errorEmbed(error)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (!member.isCommunicationDisabled()) {
      await interaction.reply({ embeds: [errorEmbed('That member is not timed out.')], flags: MessageFlags.Ephemeral });
      return;
    }

    await member.timeout(null, `${reason} — by ${interaction.user.tag}`);

    const entry = await createCase(interaction.guild, {
      type: 'untimeout',
      user: target,
      moderatorId: interaction.user.id,
      reason,
    });

    await interaction.reply({ embeds: [caseEmbed(entry, `Removed timeout from ${target.tag}`)] });
  },
};
