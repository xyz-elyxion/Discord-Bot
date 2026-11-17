import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List the commands this bot knows'),

  async execute(interaction) {
    const commands = [...interaction.client.commands.values()].sort((a, b) =>
      a.data.name.localeCompare(b.data.name),
    );

    const lines = commands.map((command) => `**/${command.data.name}** — ${command.data.description}`);
    const chunks = [];
    let current = '';

    for (const line of lines) {
      if (current.length + line.length > 950) {
        chunks.push(current);
        current = '';
      }
      current += `${line}\n`;
    }
    if (current) chunks.push(current);

    const embed = new EmbedBuilder()
      .setTitle('Commands')
      .setColor(0x5865f2)
      .setDescription(chunks.shift() || 'No commands loaded.')
      .setFooter({ text: `${commands.length} commands · moderation, security and configuration` });

    if (chunks.length) {
      embed.addFields(chunks.map((chunk, index) => ({ name: `More commands (${index + 2})`, value: chunk })));
    }

    await interaction.reply({ embeds: [embed] });
  },
};
