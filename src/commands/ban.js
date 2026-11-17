import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { caseEmbed, createCase, dmUser, hierarchyError } from '../lib/moderation.js';
import { errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption((option) => option.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban'))
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Delete this many days of their messages (0-7)')
        .setMinValue(0)
        .setMaxValue(7),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      const error = hierarchyError(interaction.guild, interaction.member, member);
      if (error) {
        await interaction.reply({ embeds: [errorEmbed(error)], flags: MessageFlags.Ephemeral });
        return;
      }
    }

    try {
      await interaction.guild.members.ban(target.id, {
        reason: `${reason} — by ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 86_400,
      });
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed(`I could not ban that user: ${error.message}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const entry = await createCase(interaction.guild, {
      type: 'ban',
      user: target,
      moderatorId: interaction.user.id,
      reason,
    });

    await dmUser(target, `You were banned from **${interaction.guild.name}**: ${reason}`);
    await interaction.reply({ embeds: [caseEmbed(entry, `Banned ${target.tag}`)] });
  },
};
