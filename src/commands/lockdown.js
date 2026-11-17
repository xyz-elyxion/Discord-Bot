import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild } from '../lib/store.js';
import { lockGuild, unlockGuild } from '../lib/lockdown.js';
import { errorEmbed, fieldsEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock every text channel in the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Lock all viewable text channels')
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the lockdown')),
    )
    .addSubcommand((sub) => sub.setName('end').setDescription('Restore the channels to their previous state'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show whether a lockdown is active')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);

    if (sub === 'status') {
      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Lockdown status',
            null,
            [
              ['Active', config.lockdown.active ? 'Yes' : 'No', true],
              ['Locked channels', String(config.lockdown.channels?.length ?? 0), true],
              ['Panic mode', config.antiraid.raidMode ? 'Yes' : 'No', true],
            ],
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'start') {
      if (config.lockdown.active) {
        await interaction.reply({ embeds: [errorEmbed('A lockdown is already active. Use `/lockdown end` first.')], flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply();
      const reason = interaction.options.getString('reason') ?? `Lockdown by ${interaction.user.tag}`;
      const locked = await lockGuild(interaction.guild, reason);

      await interaction.editReply({
        embeds: [okEmbed('Lockdown started', `Locked **${locked}** channels. Members can read but not send messages.`)],
      });
      return;
    }

    if (sub === 'end') {
      if (!config.lockdown.active) {
        await interaction.reply({ embeds: [errorEmbed('No lockdown is active.')], flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply();
      const restored = await unlockGuild(interaction.guild, `Lockdown lifted by ${interaction.user.tag}`);
      await interaction.editReply({
        embeds: [okEmbed('Lockdown lifted', `Restored **${restored}** channels.`)],
      });
    }
  },
};
