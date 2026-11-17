import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { COLORS, errorEmbed, fieldsEmbed, okEmbed, onOff } from '../lib/embeds.js';

const ACTIONS = [
  { name: 'kick', value: 'kick' },
  { name: 'ban', value: 'ban' },
  { name: 'quarantine (needs a quarantine role)', value: 'quarantine' },
  { name: 'none (log only)', value: 'none' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('Filter suspicious joins and raids')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Turn join filtering on'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Turn join filtering off'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the anti-raid settings'))
    .addSubcommand((sub) =>
      sub
        .setName('action')
        .setDescription('What happens to flagged joins')
        .addStringOption((option) =>
          option.setName('type').setDescription('Action').setRequired(true).addChoices(...ACTIONS),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('threshold')
        .setDescription('How many joins in a short window count as a raid')
        .addIntegerOption((option) =>
          option.setName('joins').setDescription('Joins allowed in the window').setRequired(true).setMinValue(2).setMaxValue(100),
        )
        .addIntegerOption((option) =>
          option.setName('seconds').setDescription('Window length in seconds').setMinValue(2).setMaxValue(600),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('minage')
        .setDescription('Minimum account age in days')
        .addIntegerOption((option) =>
          option.setName('days').setDescription('Days (0 to disable the age check)').setRequired(true).setMinValue(0).setMaxValue(365),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('quarantine')
        .setDescription('Set the quarantine role used for flagged joins')
        .addRoleOption((option) => option.setName('role').setDescription('Quarantine role').setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);

    if (sub === 'status') {
      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Anti-raid settings',
            null,
            [
              ['Status', onOff(config.antiraid.enabled), true],
              ['Action', config.antiraid.action, true],
              ['Join threshold', `${config.antiraid.joinThreshold} / ${Math.round(config.antiraid.windowMs / 1000)}s`, true],
              ['Minimum account age', config.antiraid.minAccountAgeDays ? `${config.antiraid.minAccountAgeDays} days` : 'no check', true],
              ['Quarantine role', config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : 'not set', true],
              ['Panic mode', config.antiraid.raidMode ? 'active' : 'inactive', true],
            ],
            COLORS.primary,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'enable' || sub === 'disable') {
      setGuild(interaction.guild.id, { antiraid: { enabled: sub === 'enable' } });
      await interaction.reply({
        embeds: [okEmbed(`Anti-raid ${sub === 'enable' ? 'enabled' : 'disabled'}`, sub === 'enable' ? 'Suspicious joins will be filtered.' : 'New joins will no longer be filtered.')],
      });
      return;
    }

    if (sub === 'action') {
      const type = interaction.options.getString('type');
      if (type === 'quarantine' && !config.quarantineRoleId) {
        await interaction.reply({
          embeds: [errorEmbed('Set a quarantine role first with `/antiraid quarantine`.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      setGuild(interaction.guild.id, { antiraid: { action: type } });
      await interaction.reply({ embeds: [okEmbed('Anti-raid action updated', `Flagged joins will be **${type}**.`)] });
      return;
    }

    if (sub === 'threshold') {
      const joins = interaction.options.getInteger('joins');
      const seconds = interaction.options.getInteger('seconds') ?? 10;
      setGuild(interaction.guild.id, { antiraid: { joinThreshold: joins, windowMs: seconds * 1000 } });
      await interaction.reply({
        embeds: [okEmbed('Threshold updated', `**${joins}** joins within **${seconds}s** count as a raid.`)],
      });
      return;
    }

    if (sub === 'minage') {
      const days = interaction.options.getInteger('days');
      setGuild(interaction.guild.id, { antiraid: { minAccountAgeDays: days } });
      await interaction.reply({
        embeds: [
          okEmbed(
            'Account age filter updated',
            days ? `Accounts younger than **${days} days** will be flagged.` : 'The account age check is disabled.',
          ),
        ],
      });
      return;
    }

    if (sub === 'quarantine') {
      const role = interaction.options.getRole('role');
      if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
        await interaction.reply({ embeds: [errorEmbed('I cannot assign that role — pick a role below my highest role.')], flags: MessageFlags.Ephemeral });
        return;
      }
      setGuild(interaction.guild.id, { quarantineRoleId: role.id });
      await interaction.reply({ embeds: [okEmbed('Quarantine role set', `Flagged members will receive ${role}.`)] });
    }
  },
};
