import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { COLORS, errorEmbed, fieldsEmbed, okEmbed, onOff } from '../lib/embeds.js';

const PLACEHOLDERS = '`{user}` `{name}` `{tag}` `{server}` `{count}`';

export default {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome and goodbye messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set the welcome channel and message')
        .addChannelOption((option) => option.setName('channel').setDescription('Welcome channel').setRequired(true))
        .addStringOption((option) => option.setName('message').setDescription(`Message · placeholders: ${PLACEHOLDERS}`)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('goodbye')
        .setDescription('Set the goodbye channel and message')
        .addChannelOption((option) => option.setName('channel').setDescription('Goodbye channel').setRequired(true))
        .addStringOption((option) => option.setName('message').setDescription(`Message · placeholders: ${PLACEHOLDERS}`)),
    )
    .addSubcommand((sub) => sub.setName('test').setDescription('Send a test welcome message'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Turn welcome messages off'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the current welcome settings')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);

    if (sub === 'status') {
      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Welcome messages',
            null,
            [
              ['Welcome', onOff(config.welcome.enabled), true],
              ['Channel', config.welcome.channelId ? `<#${config.welcome.channelId}>` : 'not set', true],
              ['Message', config.welcome.message],
              ['Goodbye', onOff(config.welcome.goodbye.enabled), true],
              ['Goodbye channel', config.welcome.goodbye.channelId ? `<#${config.welcome.goodbye.channelId}>` : 'not set', true],
              ['Goodbye message', config.welcome.goodbye.message],
            ],
            COLORS.primary,
          ).setFooter({ text: `Placeholders: {user} {name} {tag} {server} {count}` }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'disable') {
      setGuild(interaction.guild.id, { welcome: { enabled: false, goodbye: { enabled: false } } });
      await interaction.reply({ embeds: [okEmbed('Welcome messages disabled', 'Join and leave messages will not be sent.')] });
      return;
    }

    if (sub === 'test') {
      const channel = interaction.guild.channels.cache.get(config.welcome.channelId) ?? interaction.channel;
      if (!channel?.isTextBased?.()) {
        await interaction.reply({ embeds: [errorEmbed('Set a welcome channel first with `/welcome set`.')], flags: MessageFlags.Ephemeral });
        return;
      }
      await channel.send({
        content: config.welcome.message
          .replaceAll('{user}', `<@${interaction.user.id}>`)
          .replaceAll('{name}', interaction.user.username)
          .replaceAll('{tag}', interaction.user.tag)
          .replaceAll('{server}', interaction.guild.name)
          .replaceAll('{count}', String(interaction.guild.memberCount))
          .slice(0, 2000),
        allowedMentions: { users: [interaction.user.id] },
      });
      await interaction.reply({ embeds: [okEmbed('Test sent', `Check <#${channel.id}>.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'set' || sub === 'goodbye') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');

      if (!channel?.isTextBased?.()) {
        await interaction.reply({ embeds: [errorEmbed('Pick a text channel.')], flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === 'set') {
        setGuild(interaction.guild.id, {
          welcome: {
            enabled: true,
            channelId: channel.id,
            ...(message ? { message } : {}),
          },
        });
        await interaction.reply({ embeds: [okEmbed('Welcome configured', `New members will be greeted in <#${channel.id}>.`)] });
      } else {
        setGuild(interaction.guild.id, {
          welcome: {
            goodbye: { enabled: true, channelId: channel.id, ...(message ? { message } : {}) },
          },
        });
        await interaction.reply({ embeds: [okEmbed('Goodbye configured', `Leave messages will be posted in <#${channel.id}>.`)] });
      }
    }
  },
};
