import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List the commands this bot knows'),

  async execute(interaction) {
    const commands = [...interaction.client.commands.values()].sort((a, b) =>
      a.data.name.localeCompare(b.data.name),
    );

    const embed = new EmbedBuilder()
      .setTitle('Commands')
      .setColor(0x5865f2)
      .setDescription(
        commands.map((command) => `**/${command.data.name}** — ${command.data.description}`).join('\n') ||
          'No commands loaded.',
      );

    await interaction.reply({ embeds: [embed] });
  },
};
