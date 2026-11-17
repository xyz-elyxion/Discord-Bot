import { Events } from 'discord.js';
import { getGuild } from '../lib/store.js';
import { createCase } from '../lib/moderation.js';
import { sendLog, logEmbed } from '../lib/logging.js';
import { COLORS } from '../lib/embeds.js';

const joinBuckets = new Map(); // guildId -> timestamps

function formatTemplate(template, member) {
  return String(template)
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{name}', member.user.username)
    .replaceAll('{tag}', member.user.tag)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount))
    .slice(0, 2000);
}

function joinsInWindow(guild, windowMs) {
  const now = Date.now();
  const timestamps = (joinBuckets.get(guild.id) ?? []).filter((time) => now - time < windowMs);
  timestamps.push(now);
  joinBuckets.set(guild.id, timestamps);
  return timestamps.length;
}

async function handleRaid(member, config, client) {
  const { antiraid } = config;
  if (!antiraid.enabled) return false;

  const accountAgeMs = Date.now() - member.user.createdTimestamp;
  const tooNew = accountAgeMs < antiraid.minAccountAgeDays * 86_400_000;
  const joins = joinsInWindow(member.guild, antiraid.windowMs);
  const raidDetected = joins >= antiraid.joinThreshold;

  if (!tooNew && !raidDetected) return false;

  const reason = raidDetected
    ? `Anti-raid: ${joins} joins in ${Math.round(antiraid.windowMs / 1000)}s`
    : `Anti-raid: account is younger than ${antiraid.minAccountAgeDays} days`;

  let outcome = 'none';
  if (antiraid.action === 'ban') {
    await member.ban({ reason }).catch(() => null);
    outcome = 'banned';
  } else if (antiraid.action === 'kick') {
    await member.kick(reason).catch(() => null);
    outcome = 'kicked';
  } else if (antiraid.action === 'quarantine' && config.quarantineRoleId) {
    await member.roles.add(config.quarantineRoleId, reason).catch(() => null);
    outcome = 'quarantined';
  }

  const entry = await createCase(member.guild, {
    type: 'raid',
    user: member.user,
    moderatorId: client.user.id,
    reason,
    silent: true,
  });

  await sendLog(
    member.guild,
    'members',
    logEmbed({
      title: '🚨 Anti-raid',
      color: COLORS.danger,
      description: `<@${member.id}> triggered the join filter and was **${outcome}**.`,
      fields: [
        ['Account created', `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, true],
        ['Joins in window', String(joins), true],
        ['Case', `#${entry.id}`, true],
        ['Reason', reason],
      ],
      footer: `User ${member.id}`,
    }),
  );

  return true;
}

export function registerMembers(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;

    const config = getGuild(member.guild.id);

    try {
      // Panic mode: nobody joins while the server is under attack.
      if (config.antiraid.raidMode) {
        await member
          .kick('Panic mode: the server is locked down')
          .catch(() => null);
        return;
      }

      if (await handleRaid(member, config, client)) return;

      if (config.quarantineRoleId && !config.autorole.roleIds.includes(config.quarantineRoleId)) {
        await member.roles.add(config.quarantineRoleId, 'Quarantine on join').catch(() => null);
      }

      if (config.autorole.enabled && config.autorole.roleIds.length) {
        await member.roles.add(config.autorole.roleIds, 'Autorole').catch(() => null);
      }

      if (config.welcome.enabled && config.welcome.channelId) {
        const channel = member.guild.channels.cache.get(config.welcome.channelId);
        if (channel?.isTextBased?.()) {
          await channel
            .send({ content: formatTemplate(config.welcome.message, member), allowedMentions: { users: [member.id] } })
            .catch(() => null);
        }
      }
    } catch (error) {
      console.error('Member join handler failed:', error);
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const config = getGuild(member.guild.id);
    const { goodbye } = config.welcome;
    if (!goodbye.enabled || !goodbye.channelId) return;

    const channel = member.guild.channels.cache.get(goodbye.channelId);
    if (!channel?.isTextBased?.()) return;

    await channel
      .send({ content: formatTemplate(goodbye.message, member), allowedMentions: { parse: [] } })
      .catch(() => null);
  });
}
