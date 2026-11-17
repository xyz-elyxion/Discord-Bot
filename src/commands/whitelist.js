import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { COLORS, errorEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage who anti-nuke never punishes')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add-user')
        .setDescription('Trust a member')
        .addUserOption((option) => option.setName('user').setDescription('Member to trust').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-user')
        .setDescription('Stop trusting a member')
        .addUserOption((option) => option.setName('user').setDescription('Member').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-role')
        .setDescription('Trust everyone with a role')
        .addRoleOption((option) => option.setName('role').setDescription('Role to trust').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-role')
        .setDescription('Stop trusting a role')
        .addRoleOption((option) => option.setName('role').setDescription('Role').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show the whitelist')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);
    const users = new Set(config.antinuke.whitelist.users);
    const roles = new Set(config.antinuke.whitelist.roles);

    if (sub === 'list') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('Anti-nuke whitelist')
        .addFields(
          { name: 'Users', value: users.size ? [...users].map((id) => `<@${id}>`).join('\n').slice(0, 1024) : 'None' },
          { name: 'Roles', value: roles.size ? [...roles].map((id) => `<@&${id}>`).join('\n').slice(0, 1024) : 'None' },
        )
        .setFooter({ text: 'The server owner and this bot are always exempt.' });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'add-user' || sub === 'remove-user') {
      const user = interaction.options.getUser('user');
      const adding = sub === 'add-user';

      if (adding && user.id === interaction.user.id) {
        await interaction.reply({ embeds: [errorEmbed('You cannot whitelist yourself.')], flags: MessageFlags.Ephemeral });
        return;
      }

      if (adding) users.add(user.id);
      else users.delete(user.id);

      setGuild(interaction.guild.id, { antinuke: { whitelist: { users: [...users] } } });
      await interaction.reply({
        embeds: [okEmbed(adding ? 'User trusted' : 'User removed', `<@${user.id}> is ${adding ? 'now' : 'no longer'} whitelisted.`)],
      });
      return;
    }

    if (sub === 'add-role' || sub === 'remove-role') {
      const role = interaction.options.getRole('role');
      const adding = sub === 'add-role';

      if (adding) roles.add(role.id);
      else roles.delete(role.id);

      setGuild(interaction.guild.id, { antinuke: { whitelist: { roles: [...roles] } } });
      await interaction.reply({
        embeds: [okEmbed(adding ? 'Role trusted' : 'Role removed', `${role} is ${adding ? 'now' : 'no longer'} whitelisted.`)],
      });
    }
  },
};
