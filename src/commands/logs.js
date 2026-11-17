import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { LOG_CATEGORIES } from '../lib/logging.js';
import { COLORS, errorEmbed, fieldsEmbed, okEmbed, onOff } from '../lib/embeds.js';

const CATEGORY_LABELS = {
  messages: 'Message edits/deletes',
  members: 'Member joins/leaves',
  moderation: 'Moderation actions',
  server: 'Channel/role changes',
  voice: 'Voice activity',
};

export default {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Send audit logs to a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Choose the log channel')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel for log messages').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Stop sending logs'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the logging configuration'))
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Turn one log category on or off')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Category')
            .setRequired(true)
            .addChoices(...LOG_CATEGORIES.map((value) => ({ name: CATEGORY_LABELS[value] ?? value, value }))),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);

    if (sub === 'status') {
      const events = Object.entries(config.logs.events)
        .map(([key, enabled]) => `${CATEGORY_LABELS[key] ?? key}: ${enabled ? '✅' : '❌'}`)
        .join('\n');

      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Logging',
            null,
            [
              ['Status', onOff(config.logs.enabled), true],
              ['Channel', config.logs.channelId ? `<#${config.logs.channelId}>` : 'not set', true],
              ['Categories', events],
            ],
            COLORS.primary,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'disable') {
      setGuild(interaction.guild.id, { logs: { enabled: false } });
      await interaction.reply({ embeds: [okEmbed('Logging disabled', 'The bot will stop posting audit logs.')] });
      return;
    }

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');

      if (!channel?.isTextBased?.()) {
        await interaction.reply({ embeds: [errorEmbed('Pick a text channel.')], flags: MessageFlags.Ephemeral });
        return;
      }

      const me = interaction.guild.members.me;
      const permissions = channel.permissionsFor(me);
      if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) {
        await interaction.reply({
          embeds: [errorEmbed('I need **Send Messages** and **Embed Links** in that channel.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      setGuild(interaction.guild.id, { logs: { enabled: true, channelId: channel.id } });
      await interaction.reply({ embeds: [okEmbed('Logging enabled', `Logs will be posted in <#${channel.id}>.`)] });
      return;
    }

    if (sub === 'toggle') {
      const event = interaction.options.getString('event');
      const current = config.logs.events[event] !== false;
      setGuild(interaction.guild.id, { logs: { events: { [event]: !current } } });
      await interaction.reply({
        embeds: [okEmbed('Category updated', `${CATEGORY_LABELS[event] ?? event} is now ${current ? 'disabled' : 'enabled'}.`)],
      });
    }
  },
};
