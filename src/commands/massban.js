import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { createCase } from '../lib/moderation.js';
import { COLORS, errorEmbed, okEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Ban several user IDs at once')
    .addStringOption((option) =>
      option
        .setName('users')
        .setDescription('User IDs separated by spaces or commas (max 20)')
        .setRequired(true),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the bans'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const raw = interaction.options.getString('users');
    const reason = interaction.options.getString('reason') ?? 'Mass ban';
    const ids = [...new Set(raw.split(/[\s,]+/).filter((id) => /^\d{15,25}$/.test(id)))].slice(0, 20);

    if (!ids.length) {
      await interaction.reply({ embeds: [errorEmbed('Provide at least one valid user ID.')], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const banned = [];
    const failed = [];

    for (const id of ids) {
      try {
        await interaction.guild.members.ban(id, {
          reason: `${reason} — by ${interaction.user.tag}`,
          deleteMessageSeconds: 0,
        });
        banned.push(id);
      } catch {
        failed.push(id);
      }
    }

    if (banned.length) {
      await createCase(interaction.guild, {
        type: 'massban',
        user: { id: banned[0], tag: `${banned.length} users` },
        moderatorId: interaction.user.id,
        reason: `${reason} (IDs: ${banned.join(', ')})`.slice(0, 1024),
      });
    }

    await interaction.editReply({
      embeds: [
        okEmbed(
          'Massban finished',
          [
            `Banned **${banned.length}** of ${ids.length}.`,
            failed.length ? `Failed: ${failed.map((id) => `\`${id}\``).join(', ')}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        ).setColor(banned.length ? COLORS.success : COLORS.danger),
      ],
    });
  },
};
