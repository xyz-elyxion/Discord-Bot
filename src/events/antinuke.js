import { Events, PermissionFlagsBits } from 'discord.js';
import { enforceAntinuke } from '../lib/security.js';

function guard(guild, action, targetId, detail) {
  enforceAntinuke(guild, { action, targetId, detail }).catch((error) =>
    console.error(`Anti-nuke handler failed for ${action}:`, error),
  );
}

export function registerAntinuke(client) {
  client.on(Events.ChannelCreate, (channel) =>
    guard(channel.guild, 'channelCreate', channel.id, `created channel #${channel.name}`),
  );

  client.on(Events.ChannelDelete, (channel) =>
    guard(channel.guild, 'channelDelete', channel.id, `deleted channel #${channel.name}`),
  );

  client.on(Events.RoleCreate, (role) =>
    guard(role.guild, 'roleCreate', role.id, `created role ${role.name}`),
  );

  client.on(Events.RoleDelete, (role) =>
    guard(role.guild, 'roleDelete', role.id, `deleted role ${role.name}`),
  );

  client.on(Events.GuildBanAdd, (ban) =>
    guard(ban.guild, 'ban', ban.user.id, `banned ${ban.user.tag}`),
  );

  client.on(Events.GuildMemberAdd, (member) => {
    if (!member.user.bot) return;
    guard(member.guild, 'botAdd', member.id, `added bot ${member.user.tag}`);
  });

  client.on(Events.WebhooksUpdate, (channel) =>
    guard(channel.guild, 'webhookCreate', channel.id, `webhook activity in #${channel.name}`),
  );

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    const hadAdmin = oldMember.permissions?.has(PermissionFlagsBits.Administrator);
    const hasAdmin = newMember.permissions?.has(PermissionFlagsBits.Administrator);

    if (!hadAdmin && hasAdmin) {
      guard(newMember.guild, 'adminGrant', newMember.id, `granted Administrator to ${newMember.user.tag}`);
      return;
    }

    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      guard(newMember.guild, 'memberRoleUpdate', newMember.id, `changed roles of ${newMember.user.tag}`);
    }
  });
}
