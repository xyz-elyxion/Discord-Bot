import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { isLockable, lockChannel } from '../lib/lockdown.js';
import { errorEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Prevent @everyone from sending messages in a channel')
    .addChannelOption((option) => option.setName('channel').setDescription('Channel (defaults to this one)'))
    .addStringOption((option) => option.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason') ?? `Locked by ${interaction.user.tag}`;

    if (!isLockable(channel)) {
      await interaction.reply({ embeds: [errorEmbed('That channel cannot be locked.')], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await lockChannel(channel, reason);
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(`I could not lock that channel: ${error.message}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ embeds: [okEmbed('Channel locked', `<#${channel.id}> is now read-only.`)] });
  },
};
