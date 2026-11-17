import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { caseEmbed, createCase, dmUser, hierarchyError } from '../lib/moderation.js';
import { errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Ban and immediately unban a member to delete their messages')
    .addUserOption((option) => option.setName('user').setDescription('Member to softban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the softban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
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
        reason: `Softban: ${reason} — by ${interaction.user.tag}`,
        deleteMessageSeconds: 604_800,
      });
      await interaction.guild.members.unban(target.id, 'Softban finished');
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(`Softban failed: ${error.message}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    const entry = await createCase(interaction.guild, {
      type: 'softban',
      user: target,
      moderatorId: interaction.user.id,
      reason,
    });

    await dmUser(target, `You were softbanned from **${interaction.guild.name}**: ${reason}`);
    await interaction.reply({ embeds: [caseEmbed(entry, `Softbanned ${target.tag}`)] });
  },
};
