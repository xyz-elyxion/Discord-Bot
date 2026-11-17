import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show a user's avatar")
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to look up (defaults to you)'),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const avatar = user.displayAvatarURL({ size: 1024 });

    const embed = new EmbedBuilder()
      .setTitle(`${user.tag}'s avatar`)
      .setColor(0x5865f2)
      .setImage(avatar)
      .addFields({ name: 'Download', value: `[PNG](${user.displayAvatarURL({ extension: 'png', size: 1024 })})` });

    await interaction.reply({ embeds: [embed] });
  },
};
