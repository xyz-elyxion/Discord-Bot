import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REST, Routes } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const commands = [];
const commandsDir = path.join(__dirname, 'commands');

for (const file of (await readdir(commandsDir)).filter((name) => name.endsWith('.js'))) {
  const { default: command } = await import(path.join(commandsDir, file));
  if (!command?.data) {
    console.warn(`Skipping ${file}: no command data found.`);
    continue;
  }
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(DISCORD_TOKEN);
const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

try {
  const registered = await rest.put(route, { body: commands });
  console.log(
    `Registered ${registered.length} commands ${DISCORD_GUILD_ID ? `in guild ${DISCORD_GUILD_ID}` : 'globally'}.`,
  );
} catch (error) {
  console.error('Failed to register commands:', error);
  process.exit(1);
}
