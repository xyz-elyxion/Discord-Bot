import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { errorEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete recent messages')
    .addIntegerOption((option) =>
      option.setName('count').setDescription('How many messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100),
    )
    .addUserOption((option) => option.setName('user').setDescription('Only delete messages from this user'))
    .addStringOption((option) => option.setName('contains').setDescription('Only delete messages containing this text'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const count = interaction.options.getInteger('count');
    const targetUser = interaction.options.getUser('user');
    const contains = interaction.options.getString('contains')?.toLowerCase() ?? null;

    if (!interaction.channel?.isTextBased()) {
      await interaction.reply({ embeds: [errorEmbed('This channel cannot be purged.')], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const fetched = await interaction.channel.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - 13 * 86_400_000; // Discord refuses to bulk delete older messages

    const deletable = [...fetched.values()]
      .filter((message) => message.createdTimestamp > cutoff)
      .filter((message) => !targetUser || message.author.id === targetUser.id)
      .filter((message) => !contains || (message.content ?? '').toLowerCase().includes(contains))
      .slice(0, count);

    if (!deletable.length) {
      await interaction.editReply({ embeds: [errorEmbed('No messages matched those filters.')] });
      return;
    }

    const deleted = await interaction.channel.bulkDelete(deletable, true).catch(() => null);
    if (!deleted) {
      await interaction.editReply({ embeds: [errorEmbed('I could not delete those messages.')] });
      return;
    }

    await interaction.editReply({ embeds: [okEmbed('Messages purged', `Deleted **${deleted.size}** messages.`)] });
  },
};
