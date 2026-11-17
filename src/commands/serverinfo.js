import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { summarizeChannels } from '../lib/channels.js';

export default {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server'),

  async execute(interaction) {
    const { guild } = interaction;
    if (!guild) {
      await interaction.reply({
        content: 'This command only works in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const owner = await guild.fetchOwner().catch(() => null);
    const { visible, hidden, total } = summarizeChannels(guild);

    // Only channels the bot can actually view are counted as real channels.
    // Obfuscated ones are reported separately, by count only.
    const channelValue = hidden.length
      ? `${visible.length} visible\n${hidden.length} hidden`
      : String(visible.length);

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setColor(0x5865f2)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: guild.id, inline: true },
        { name: 'Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
        { name: 'Members', value: String(guild.memberCount), inline: true },
        { name: 'Channels', value: channelValue, inline: true },
        { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
        { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
      );

    if (hidden.length) {
      embed.setFooter({
        text: `${hidden.length} of ${total} channels are hidden from this bot (Private Channel Obfuscation).`,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
