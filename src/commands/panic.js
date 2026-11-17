import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { lockGuild, unlockGuild } from '../lib/lockdown.js';
import { fieldsEmbed, okEmbed, warnEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('panic')
    .setDescription('Emergency mode: lock the server, block joins and arm anti-nuke')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Enable panic mode')
        .addStringOption((option) => option.setName('reason').setDescription('What is happening?')),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('End panic mode and unlock the server'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show panic mode status')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);

    if (sub === 'status') {
      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Panic mode',
            config.antiraid.raidMode ? 'Panic mode is **active** — new members are kicked on join.' : 'Panic mode is inactive.',
            [
              ['Raid mode', config.antiraid.raidMode ? 'On' : 'Off', true],
              ['Lockdown', config.lockdown.active ? 'On' : 'Off', true],
              ['Anti-nuke', config.antinuke.enabled ? 'On' : 'Off', true],
            ],
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'enable') {
      await interaction.deferReply();
      const reason = interaction.options.getString('reason') ?? `Panic mode by ${interaction.user.tag}`;
      const locked = await lockGuild(interaction.guild, reason);
      setGuild(interaction.guild.id, { antiraid: { raidMode: true }, antinuke: { enabled: true } });

      await interaction.editReply({
        embeds: [
          warnEmbed(
            '🚨 Panic mode enabled',
            [
              `Locked **${locked}** channels.`,
              'New members are kicked on join.',
              'Anti-nuke is armed.',
              'Use `/panic disable` once the raid is over.',
            ].join('\n'),
          ),
        ],
      });
      return;
    }

    if (sub === 'disable') {
      await interaction.deferReply();
      const restored = await unlockGuild(interaction.guild, 'Panic mode disabled');
      setGuild(interaction.guild.id, { antiraid: { raidMode: false } });

      await interaction.editReply({
        embeds: [okEmbed('Panic mode disabled', `Unlocked **${restored}** channels. Anti-nuke stays enabled — turn it off with \`/antinuke disable\` if you want.`)],
      });
    }
  },
};
