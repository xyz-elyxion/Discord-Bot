import { Routes } from 'discord.js';

/** Command payloads for every command the bot has loaded. */
export function collectCommands(client) {
  return [...client.commands.values()].map((command) => command.data.toJSON());
}

/**
 * Compare only the parts Discord stores, so option order and runtime fields
 * (id, version, default_permissions, …) do not cause needless re-registration.
 */
export function commandSignature(list) {
  return JSON.stringify(
    [...list]
      .map((command) => ({
        name: command.name,
        description: command.description,
        options: command.options ?? [],
        default_member_permissions: command.default_member_permissions ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}

export function commandRoute(applicationId, guildId) {
  return guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);
}

/**
 * Register the loaded commands, but only when Discord's copy differs.
 * Returns what Discord now has so the caller can report missing commands.
 */
export async function syncCommands(client, { guildId = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID, force = false } = {}) {
  const commands = collectCommands(client);
  if (!commands.length) throw new Error('no commands were loaded from src/commands');

  const route = commandRoute(client.application.id, guildId);
  const scope = guildId ? `guild ${guildId}` : 'global';

  let registered = await client.rest.get(route);
  const changed = force || commandSignature(registered) !== commandSignature(commands);

  if (changed) {
    registered = await client.rest.put(route, { body: commands });
  }

  const names = new Set(registered.map((command) => command.name));
  const missing = commands.map((command) => command.name).filter((name) => !names.has(name));

  return { changed, scope, count: registered.length, missing };
}
