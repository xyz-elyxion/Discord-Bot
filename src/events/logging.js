import { Events } from 'discord.js';
import { sendLog, logEmbed } from '../lib/logging.js';
import { snippet } from '../lib/automod.js';
import { COLORS } from '../lib/embeds.js';

export function registerLogging(client) {
  client.on(Events.MessageDelete, async (message) => {
    if (!message.guild || message.author?.bot) return;

    await sendLog(
      message.guild,
      'messages',
      logEmbed({
        title: 'Message deleted',
        description: `In <#${message.channel.id}> by ${message.author ? `<@${message.author.id}>` : 'unknown user'}`,
        color: COLORS.danger,
        fields: [
          ['Content', snippet(message.content ?? '')],
          ['Author', message.author ? `${message.author.tag} (${message.author.id})` : 'unknown'],
        ],
      }),
    );
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if ((oldMessage.content ?? '') === (newMessage.content ?? '')) return;

    await sendLog(
      newMessage.guild,
      'messages',
      logEmbed({
        title: 'Message edited',
        description: `In <#${newMessage.channel.id}> by <@${newMessage.author.id}> · [jump](${newMessage.url})`,
        color: COLORS.warning,
        fields: [
          ['Before', snippet(oldMessage.content ?? '')],
          ['After', snippet(newMessage.content ?? '')],
        ],
      }),
    );
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild) return;
    await sendLog(
      channel.guild,
      'server',
      logEmbed({
        title: 'Channel created',
        description: `<#${channel.id}> (${channel.name})`,
        color: COLORS.success,
        fields: [['Type', String(channel.type), true]],
      }),
    );
  });

  client.on(Events.ChannelDelete, async (channel) => {
    if (!channel.guild) return;
    await sendLog(
      channel.guild,
      'server',
      logEmbed({
        title: 'Channel deleted',
        description: `#${channel.name} (${channel.id})`,
        color: COLORS.danger,
        fields: [['Type', String(channel.type), true]],
      }),
    );
  });

  client.on(Events.RoleCreate, async (role) => {
    await sendLog(
      role.guild,
      'server',
      logEmbed({
        title: 'Role created',
        description: `${role.name} (${role.id})`,
        color: COLORS.success,
      }),
    );
  });

  client.on(Events.RoleDelete, async (role) => {
    await sendLog(
      role.guild,
      'server',
      logEmbed({
        title: 'Role deleted',
        description: `${role.name} (${role.id})`,
        color: COLORS.danger,
      }),
    );
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    await sendLog(
      ban.guild,
      'moderation',
      logEmbed({
        title: 'Member banned',
        description: `${ban.user.tag} (${ban.user.id})`,
        color: COLORS.danger,
        fields: [['Reason', ban.reason ?? 'No reason provided']],
      }),
    );
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    await sendLog(
      ban.guild,
      'moderation',
      logEmbed({
        title: 'Member unbanned',
        description: `${ban.user.tag} (${ban.user.id})`,
        color: COLORS.success,
      }),
    );
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    await sendLog(
      member.guild,
      'members',
      logEmbed({
        title: 'Member joined',
        description: `<@${member.id}> (${member.user.tag})`,
        color: COLORS.success,
        fields: [
          ['Account created', `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, true],
          ['Member count', String(member.guild.memberCount), true],
        ],
        thumbnail: member.user.displayAvatarURL({ size: 128 }),
      }),
    );
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    await sendLog(
      member.guild,
      'members',
      logEmbed({
        title: 'Member left',
        description: `${member.user.tag} (${member.id})`,
        color: COLORS.muted,
        fields: [['Member count', String(member.guild.memberCount), true]],
      }),
    );
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const guild = newState.guild ?? oldState.guild;
    if (oldState.channelId === newState.channelId) return;

    if (!oldState.channelId && newState.channelId) {
      await sendLog(
        guild,
        'voice',
        logEmbed({
          title: 'Joined voice',
          description: `<@${member.id}> joined <#${newState.channelId}>`,
          color: COLORS.primary,
        }),
      );
    } else if (oldState.channelId && !newState.channelId) {
      await sendLog(
        guild,
        'voice',
        logEmbed({
          title: 'Left voice',
          description: `<@${member.id}> left <#${oldState.channelId}>`,
          color: COLORS.muted,
        }),
      );
    }
  });
}
