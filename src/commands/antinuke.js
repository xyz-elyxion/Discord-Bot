import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { COLORS, errorEmbed, fieldsEmbed, okEmbed, onOff, yesNo } from '../lib/embeds.js';

const ACTIONS = {
  ban: 'Mass bans',
  kick: 'Mass kicks',
  channelDelete: 'Channel deletes',
  channelCreate: 'Channel creates',
  roleDelete: 'Role deletes',
  roleCreate: 'Role creates',
  webhookCreate: 'Webhook creates',
  memberRoleUpdate: 'Member role changes',
  adminGrant: 'Administrator grants',
  botAdd: 'Bot additions',
};

const PUNISHMENTS = [
  { name: 'ban', value: 'ban' },
  { name: 'kick', value: 'kick' },
  { name: 'strip roles', value: 'strip' },
  { name: 'none (log only)', value: 'none' },
];

const ACTION_CHOICES = Object.entries(ACTIONS).map(([value, name]) => ({ name, value }));

export default {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Configure anti-nuke protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Turn anti-nuke protection on'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Turn anti-nuke protection off'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the current anti-nuke settings'))
    .addSubcommand((sub) =>
      sub
        .setName('punishment')
        .setDescription('Choose what happens to a detected nuker')
        .addStringOption((option) =>
          option.setName('type').setDescription('Punishment').setRequired(true).addChoices(...PUNISHMENTS),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('threshold')
        .setDescription('Set how many actions in the window trigger a punishment')
        .addStringOption((option) =>
          option.setName('action').setDescription('Action to watch').setRequired(true).addChoices(...ACTION_CHOICES),
        )
        .addIntegerOption((option) =>
          option.setName('count').setDescription('Actions allowed before punishing').setRequired(true).setMinValue(1).setMaxValue(50),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('trustadmins')
        .setDescription('Whether members with Administrator are exempt')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Trust admins?').setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);

    if (sub === 'status') {
      const thresholds = Object.entries(config.antinuke.thresholds)
        .map(([action, count]) => `${ACTIONS[action] ?? action}: **${count}**`)
        .join('\n');

      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Anti-nuke settings',
            null,
            [
              ['Status', onOff(config.antinuke.enabled), true],
              ['Punishment', config.antinuke.punishment, true],
              ['Window', `${Math.round(config.antinuke.windowMs / 1000)}s`, true],
              ['Trust admins', yesNo(config.antinuke.trustAdmins), true],
              ['Whitelisted users', String(config.antinuke.whitelist.users.length), true],
              ['Whitelisted roles', String(config.antinuke.whitelist.roles.length), true],
              ['Thresholds', thresholds],
            ],
            COLORS.primary,
          ).setFooter({ text: 'Whitelist staff with /whitelist so the bot never punishes them.' }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'enable') {
      setGuild(interaction.guild.id, { antinuke: { enabled: true } });
      await interaction.reply({ embeds: [okEmbed('Anti-nuke enabled', 'Destructive actions are now monitored.')] });
      return;
    }

    if (sub === 'disable') {
      setGuild(interaction.guild.id, { antinuke: { enabled: false } });
      await interaction.reply({ embeds: [okEmbed('Anti-nuke disabled', 'No destructive actions will be monitored.')] });
      return;
    }

    if (sub === 'punishment') {
      const type = interaction.options.getString('type');
      setGuild(interaction.guild.id, { antinuke: { punishment: type } });
      await interaction.reply({ embeds: [okEmbed('Punishment updated', `Detected nukers will be **${type}**.`)] });
      return;
    }

    if (sub === 'threshold') {
      const action = interaction.options.getString('action');
      const count = interaction.options.getInteger('count');
      setGuild(interaction.guild.id, { antinuke: { thresholds: { [action]: count } } });
      await interaction.reply({
        embeds: [okEmbed('Threshold updated', `${ACTIONS[action] ?? action}: **${count}** per window.`)],
      });
      return;
    }

    if (sub === 'trustadmins') {
      const enabled = interaction.options.getBoolean('enabled');
      setGuild(interaction.guild.id, { antinuke: { trustAdmins: enabled } });
      await interaction.reply({
        embeds: [
          enabled
            ? okEmbed('Admins trusted', 'Members with Administrator are exempt from anti-nuke.')
            : errorEmbed('Admins no longer trusted — whitelist any staff you want exempt.', 'Admins untrusted'),
        ],
      });
    }
  },
};
