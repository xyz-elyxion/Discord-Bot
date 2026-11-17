import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check the bot's latency"),

  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging…', withResponse: true });
    const message = sent.resource?.message;
    const roundtrip = message ? message.createdTimestamp - interaction.createdTimestamp : 0;

    await interaction.editReply(
      `🏓 Pong!\n` +
        `**Roundtrip:** ${roundtrip}ms\n` +
        `**WebSocket:** ${Math.round(interaction.client.ws.ping)}ms`,
    );
  },
};
