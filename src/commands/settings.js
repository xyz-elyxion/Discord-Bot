import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild } from '../lib/store.js';
import { COLORS, fieldsEmbed, onOff } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Show every security and moderation setting for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const config = getGuild(interaction.guild.id);

    await interaction.reply({
      embeds: [
        fieldsEmbed(
          `Settings for ${interaction.guild.name}`,
          null,
          [
            ['Anti-nuke', `${onOff(config.antinuke.enabled)} · punishment: ${config.antinuke.punishment}`, true],
            ['Anti-raid', `${onOff(config.antiraid.enabled)} · action: ${config.antiraid.action}`, true],
            ['Panic mode', config.antiraid.raidMode ? '🚨 active' : 'inactive', true],
            ['Automod', `${onOff(config.automod.enabled)} · action: ${config.automod.action}`, true],
            ['Logs', config.logs.enabled && config.logs.channelId ? `<#${config.logs.channelId}>` : 'disabled', true],
            ['Welcome', config.welcome.enabled && config.welcome.channelId ? `<#${config.welcome.channelId}>` : 'disabled', true],
            ['Goodbye', config.welcome.goodbye.enabled && config.welcome.goodbye.channelId ? `<#${config.welcome.goodbye.channelId}>` : 'disabled', true],
            ['Autorole', config.autorole.enabled ? config.autorole.roleIds.map((id) => `<@&${id}>`).join(', ') || 'none' : 'disabled', true],
            ['Verification', config.verification.enabled ? `<#${config.verification.channelId}>` : 'disabled', true],
            ['Quarantine role', config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : 'not set', true],
            ['Lockdown', config.lockdown.active ? `active · ${config.lockdown.channels?.length ?? 0} channels` : 'inactive', true],
            ['Cases recorded', String(config.cases.length), true],
          ],
          COLORS.primary,
        ).setFooter({ text: 'Configure with /antinuke, /automod, /logs, /welcome, /autorole, /verification' }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
