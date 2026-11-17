import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { isLockable, unlockChannel } from '../lib/lockdown.js';
import { errorEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Let @everyone send messages in a channel again')
    .addChannelOption((option) => option.setName('channel').setDescription('Channel (defaults to this one)'))
    .addStringOption((option) => option.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason') ?? `Unlocked by ${interaction.user.tag}`;

    if (!isLockable(channel)) {
      await interaction.reply({ embeds: [errorEmbed('That channel cannot be unlocked.')], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await unlockChannel(channel, null, reason);
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(`I could not unlock that channel: ${error.message}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ embeds: [okEmbed('Channel unlocked', `<#${channel.id}> is writable again.`)] });
  },
};
