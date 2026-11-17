import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { describeChannel, isViewable } from '../lib/channels.js';

export default {
  data: new SlashCommandBuilder()
    .setName('channels')
    .setDescription('List the channels this bot can see'),

  async execute(interaction) {
    const { guild } = interaction;
    if (!guild) {
      await interaction.reply({
        content: 'This command only works in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const visible = [...guild.channels.cache.values()]
      .filter(isViewable)
      .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

    const listing = visible
      .slice(0, 60)
      .map((channel) => describeChannel(channel))
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`Channels in ${guild.name}`)
      .setColor(0x5865f2)
      .setDescription(listing || 'No channels visible.')
      .setFooter({
        text: `${visible.length} visible${visible.length > 60 ? ' (showing first 60)' : ''} · hidden channels are not listed`,
      });

    await interaction.reply({ embeds: [embed] });
  },
};
