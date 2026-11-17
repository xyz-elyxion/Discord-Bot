import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { caseEmbed, createCase, dmUser, formatDuration, hierarchyError, parseDuration } from '../lib/moderation.js';
import { errorEmbed } from '../lib/embeds.js';

const MAX_TIMEOUT_MS = 28 * 86_400_000;

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member')
    .addUserOption((option) => option.setName('user').setDescription('Member to timeout').setRequired(true))
    .addStringOption((option) =>
      option.setName('duration').setDescription('e.g. 10m, 2h, 7d (max 28d)').setRequired(true),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the timeout'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const durationInput = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const durationMs = parseDuration(durationInput);

    if (!durationMs || durationMs > MAX_TIMEOUT_MS) {
      await interaction.reply({
        embeds: [errorEmbed('Use a duration like `10m`, `2h` or `7d` — up to 28 days.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.reply({ embeds: [errorEmbed('That user is not a member of this server.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const error = hierarchyError(interaction.guild, interaction.member, member);
    if (error) {
      await interaction.reply({ embeds: [errorEmbed(error)], flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await member.timeout(durationMs, `${reason} — by ${interaction.user.tag}`);
    } catch (timeoutError) {
      await interaction.reply({ embeds: [errorEmbed(`I could not time that member out: ${timeoutError.message}`)], flags: MessageFlags.Ephemeral });
      return;
    }

    const entry = await createCase(interaction.guild, {
      type: 'timeout',
      user: target,
      moderatorId: interaction.user.id,
      reason,
      durationMs,
    });

    await dmUser(target, `You were timed out in **${interaction.guild.name}** for ${formatDuration(durationMs)}: ${reason}`);
    await interaction.reply({ embeds: [caseEmbed(entry, `Timed out ${target.tag}`)] });
  },
};
