import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { COLORS, errorEmbed, fieldsEmbed, infoEmbed, okEmbed, onOff } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Button-based verification gate')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Post the verification panel and choose the role to grant')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel for the panel').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Role granted on verify').setRequired(true))
        .addStringOption((option) => option.setName('message').setDescription('Text shown above the button')),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Turn verification off'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the verification configuration')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);

    if (sub === 'status') {
      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Verification',
            null,
            [
              ['Status', onOff(config.verification.enabled), true],
              ['Channel', config.verification.channelId ? `<#${config.verification.channelId}>` : 'not set', true],
              ['Role', config.verification.roleId ? `<@&${config.verification.roleId}>` : 'not set', true],
            ],
            COLORS.primary,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'disable') {
      setGuild(interaction.guild.id, { verification: { enabled: false } });
      await interaction.reply({ embeds: [okEmbed('Verification disabled', 'The verify button will no longer grant a role.')] });
      return;
    }

    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    const message =
      interaction.options.getString('message') ??
      'Click **Verify** below, then type the characters shown in the captcha image to get access.';

    if (!channel?.isTextBased?.()) {
      await interaction.reply({ embeds: [errorEmbed('Pick a text channel.')], flags: MessageFlags.Ephemeral });
      return;
    }

    if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
      await interaction.reply({
        embeds: [errorEmbed('I cannot assign that role — it is managed or above my highest role.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_start')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🤖'),
    );

    const sent = await channel.send({
      embeds: [infoEmbed('Verification', message).setFooter({ text: interaction.guild.name })],
      components: [row],
    });

    setGuild(interaction.guild.id, {
      verification: { enabled: true, channelId: channel.id, roleId: role.id, messageId: sent.id },
    });

    await interaction.reply({
      embeds: [okEmbed('Verification set up', `Members can verify in <#${channel.id}> to receive ${role}.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
