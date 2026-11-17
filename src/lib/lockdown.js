import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getGuild, setGuild } from './store.js';
import { isViewable } from './channels.js';

const LOCKABLE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

export function isLockable(channel) {
  return LOCKABLE_TYPES.has(channel?.type) && isViewable(channel);
}

/** Snapshot the @everyone overwrite so unlock can put it back the way it was. */
export function snapshotChannel(channel) {
  const everyone = channel.guild.roles.everyone;
  const overwrite = channel.permissionOverwrites.cache.get(everyone.id);

  return {
    id: channel.id,
    hadOverwrite: Boolean(overwrite),
    allowedSend: Boolean(overwrite?.allow?.has(PermissionFlagsBits.SendMessages)),
    deniedSend: Boolean(overwrite?.deny?.has(PermissionFlagsBits.SendMessages)),
  };
}

export async function lockChannel(channel, reason = 'Channel locked') {
  const snapshot = snapshotChannel(channel);
  await channel.permissionOverwrites.edit(
    channel.guild.roles.everyone,
    { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, AddReactions: false },
    { reason },
  );
  return snapshot;
}

export async function unlockChannel(channel, snapshot = null, reason = 'Channel unlocked') {
  const restore = snapshot ?? { hadOverwrite: false, allowedSend: false, deniedSend: false };
  const sendMessages = restore.hadOverwrite
    ? restore.allowedSend || !restore.deniedSend
    : null; // null = inherit from the category

  await channel.permissionOverwrites.edit(
    channel.guild.roles.everyone,
    { SendMessages: sendMessages, SendMessagesInThreads: null, CreatePublicThreads: null, AddReactions: null },
    { reason },
  );
}

/** Lock every viewable text channel and remember the previous state. */
export async function lockGuild(guild, reason = 'Lockdown') {
  const snapshots = [];
  for (const channel of guild.channels.cache.values()) {
    if (!isLockable(channel)) continue;
    try {
      snapshots.push(await lockChannel(channel, reason));
    } catch (error) {
      console.warn(`Could not lock #${channel.id}:`, error.message);
    }
  }

  setGuild(guild.id, { lockdown: { active: true, channels: snapshots } });
  return snapshots.length;
}

/** Unlock the channels recorded by lockGuild. */
export async function unlockGuild(guild, reason = 'Lockdown lifted') {
  const { lockdown } = getGuild(guild.id);
  let restored = 0;

  for (const snapshot of lockdown.channels ?? []) {
    const channel = guild.channels.cache.get(snapshot.id);
    if (!channel?.permissionOverwrites) continue;
    try {
      await unlockChannel(channel, snapshot, reason);
      restored += 1;
    } catch (error) {
      console.warn(`Could not unlock #${snapshot.id}:`, error.message);
    }
  }

  setGuild(guild.id, { lockdown: { active: false, channels: [] } });
  return restored;
}
