import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hierarchyError } from '../lib/moderation.js';
import { errorEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Give or remove a role from a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a role to a member')
        .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Role to add').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a role from a member')
        .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Role to remove').setRequired(true)),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const action = interaction.options.getSubcommand();
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

    if (role.managed || role.id === interaction.guild.id) {
      await interaction.reply({ embeds: [errorEmbed('That role is managed by an integration and cannot be assigned manually.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const me = interaction.guild.members.me;
    if (role.position >= me.roles.highest.position) {
      await interaction.reply({ embeds: [errorEmbed('That role is above my highest role — move my role higher.')], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      if (action === 'add') {
        await member.roles.add(role, `Added by ${interaction.user.tag}`);
      } else {
        await member.roles.remove(role, `Removed by ${interaction.user.tag}`);
      }
    } catch (roleError) {
      await interaction.reply({ embeds: [errorEmbed(`I could not update that member's roles: ${roleError.message}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      embeds: [
        okEmbed(
          action === 'add' ? 'Role added' : 'Role removed',
          `${role} was ${action === 'add' ? 'given to' : 'removed from'} ${target}.`,
        ),
      ],
    });
  },
};
