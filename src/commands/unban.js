import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { caseEmbed, createCase } from '../lib/moderation.js';
import { errorEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by ID')
    .addUserOption((option) => option.setName('user').setDescription('User to unban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the unban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    try {
      await interaction.guild.members.unban(target.id, `${reason} — by ${interaction.user.tag}`);
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed(`I could not unban that user (are they banned?): ${error.message}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const entry = await createCase(interaction.guild, {
      type: 'unban',
      user: target,
      moderatorId: interaction.user.id,
      reason,
    });

    await interaction.reply({ embeds: [caseEmbed(entry, `Unbanned ${target.tag}`)] });
  },
};
