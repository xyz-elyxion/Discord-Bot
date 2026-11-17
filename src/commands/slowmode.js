import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { errorEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode in a channel')
    .addIntegerOption((option) =>
      option.setName('seconds').setDescription('Seconds between messages, 0 to turn off (max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600),
    )
    .addChannelOption((option) => option.setName('channel').setDescription('Channel (defaults to this one)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    if (!channel?.isTextBased?.() || typeof channel.setRateLimitPerUser !== 'function') {
      await interaction.reply({ embeds: [errorEmbed('That channel does not support slowmode.')], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(`I could not set slowmode: ${error.message}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      embeds: [
        okEmbed(
          'Slowmode updated',
          seconds === 0 ? `Slowmode was disabled in <#${channel.id}>.` : `<#${channel.id}> now has a **${seconds}s** slowmode.`,
        ),
      ],
    });
  },
};
