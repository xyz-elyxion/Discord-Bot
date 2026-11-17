import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a user')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to look up (defaults to you)'),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.options.getMember('user') ?? interaction.guild?.members.cache.get(user.id);

    const embed = new EmbedBuilder()
      .setTitle(user.tag)
      .setColor(0x5865f2)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      );

    if (member?.joinedTimestamp) {
      embed.addFields({
        name: 'Joined server',
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
        inline: true,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
