import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { COLORS, errorEmbed, fieldsEmbed, okEmbed, onOff } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Roles given to every new member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a role to autorole')
        .addRoleOption((option) => option.setName('role').setDescription('Role to give on join').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a role from autorole')
        .addRoleOption((option) => option.setName('role').setDescription('Role to remove').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show the autorole configuration'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Stop giving roles on join')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);
    const roles = new Set(config.autorole.roleIds);

    if (sub === 'list') {
      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Autorole',
            null,
            [
              ['Status', onOff(config.autorole.enabled), true],
              ['Roles', roles.size ? [...roles].map((id) => `<@&${id}>`).join(', ') : 'None'],
            ],
            COLORS.primary,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'disable') {
      setGuild(interaction.guild.id, { autorole: { enabled: false } });
      await interaction.reply({ embeds: [okEmbed('Autorole disabled', 'New members will not receive roles automatically.')] });
      return;
    }

    const role = interaction.options.getRole('role');

    if (role.managed || role.id === interaction.guild.id) {
      await interaction.reply({ embeds: [errorEmbed('That role cannot be assigned by a bot.')], flags: MessageFlags.Ephemeral });
      return;
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      await interaction.reply({ embeds: [errorEmbed('That role is above my highest role — move my role higher.')], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'add') {
      if (roles.size >= 10) {
        await interaction.reply({ embeds: [errorEmbed('You can configure up to 10 autoroles.')], flags: MessageFlags.Ephemeral });
        return;
      }
      roles.add(role.id);
      setGuild(interaction.guild.id, { autorole: { enabled: true, roleIds: [...roles] } });
      await interaction.reply({ embeds: [okEmbed('Autorole added', `${role} will be given to new members.`)] });
      return;
    }

    roles.delete(role.id);
    setGuild(interaction.guild.id, { autorole: { roleIds: [...roles], ...(roles.size ? {} : { enabled: false }) } });
    await interaction.reply({ embeds: [okEmbed('Autorole removed', `${role} is no longer given automatically.`)] });
  },
};
