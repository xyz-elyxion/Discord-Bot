import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hierarchyError } from '../lib/moderation.js';
import { errorEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription("Change or reset a member's nickname")
    .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((option) => option.setName('name').setDescription('New nickname (omit to reset)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const name = interaction.options.getString('name');
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
      await member.setNickname(name ?? null, `Changed by ${interaction.user.tag}`);
    } catch (nicknameError) {
      await interaction.reply({ embeds: [errorEmbed(`I could not change that nickname: ${nicknameError.message}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      embeds: [
        okEmbed(
          'Nickname updated',
          name ? `${target}'s nickname is now **${name}**.` : `${target}'s nickname was reset.`,
        ),
      ],
    });
  },
};
