import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { caseEmbed, createCase, dmUser, hierarchyError } from '../lib/moderation.js';
import { errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((option) => option.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

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

    try {
      await member.kick(`${reason} — by ${interaction.user.tag}`);
    } catch (kickError) {
      await interaction.reply({ embeds: [errorEmbed(`I could not kick that member: ${kickError.message}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    const entry = await createCase(interaction.guild, {
      type: 'kick',
      user: target,
      moderatorId: interaction.user.id,
      reason,
    });

    await dmUser(target, `You were kicked from **${interaction.guild.name}**: ${reason}`);
    await interaction.reply({ embeds: [caseEmbed(entry, `Kicked ${target.tag}`)] });
  },
};
