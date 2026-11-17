import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { errorEmbed, warnEmbed } from '../lib/embeds.js';
import { sendLog, logEmbed } from '../lib/logging.js';

export default {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Clone a channel and delete the original (clears all messages)')
    .addChannelOption((option) => option.setName('channel').setDescription('Channel (defaults to this one)'))
    .addBooleanOption((option) => option.setName('confirm').setDescription('Set to true to actually nuke the channel'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const guild = interaction.guild ?? channel.guild;

    if (!channel?.isTextBased?.() || typeof channel.clone !== 'function') {
      await interaction.reply({ embeds: [errorEmbed('That channel cannot be nuked.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const confirmation = warnEmbed(
      'Confirm nuke',
      `This will clone <#${channel.id}> and delete the original, along with every message. Use \`/nuke confirm:true\` to go ahead.`,
    );

    const confirmed = interaction.options.getBoolean('confirm') ?? false;
    if (!confirmed) {
      await interaction.reply({ embeds: [confirmation], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const clone = await channel.clone({ reason: `Nuked by ${interaction.user.tag}` });
      await channel.delete(`Nuked by ${interaction.user.tag}`);
      await clone.send({ content: `💥 Channel nuked by <@${interaction.user.id}>.` });

      await interaction.editReply({ embeds: [errorEmbed(`Nuked <#${clone.id}>.`, 'Channel nuked')] });
      await sendLog(
        guild,
        'server',
        logEmbed({
          title: 'Channel nuked',
          description: `<@${interaction.user.id}> nuked <#${clone.id}>.`,
        }),
      );
    } catch (error) {
      await interaction.editReply({ embeds: [errorEmbed(`Nuke failed: ${error.message}`)] });
    }
  },
};
