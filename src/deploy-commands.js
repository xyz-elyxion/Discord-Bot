import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REST, Routes } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Accept a couple of common env aliases so a differently named .env still works.
const TOKEN = process.env.DISCORD_TOKEN ?? process.env.TOKEN;
const CLIENT_ID =
  process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID ?? process.env.APPLICATION_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID ?? '';
const checkOnly = process.argv.includes('--check') || process.argv.includes('--status');

function die(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function explain(error) {
  // discord.js puts the HTTP status on `status` and the Discord error code on `code`.
  const numbers = [error?.status, error?.code].filter((value) => typeof value === 'number' && value > 0);

  if (numbers.includes(401)) {
    return 'The bot token is invalid or was reset. Copy a fresh one from Bot → Reset Token.';
  }
  if (numbers.includes(403) || numbers.includes(50001)) {
    return 'Discord says "Missing Access". Re-invite the bot with the applications.commands scope (the invite link below).';
  }
  if (numbers.includes(10004)) {
    return `Unknown guild ${GUILD_ID}. Check DISCORD_GUILD_ID — it must be the server ID, not a channel ID.`;
  }
  if (numbers.includes(10002)) {
    return 'Unknown application. Check DISCORD_CLIENT_ID against General Information → Application ID.';
  }
  if (typeof error?.message === 'string' && /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/.test(error.message)) {
    return "Could not reach discord.com. Check the machine's internet connection or proxy.";
  }
  return null;
}

function inviteUrl() {
  return `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands`;
}

if (!TOKEN) die('Missing DISCORD_TOKEN. Copy .env.example to .env and paste your bot token.');
if (!CLIENT_ID) {
  die(
    'Missing DISCORD_CLIENT_ID. It is the Application ID from General Information — a long number, not the token.',
  );
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

if (!commands.length) die('No commands were found in src/commands.');

console.log(`\nPrepared ${commands.length} commands: ${commands.map((command) => `/${command.name}`).join(', ')}`);

const rest = new REST({ timeout: 15_000 }).setToken(TOKEN);

// 1. Verify the token and that it belongs to the application in CLIENT_ID.
let application;
try {
  application = await rest.get(Routes.user('@me'));
} catch (error) {
  die(`Discord rejected the token.\n  ${explain(error) ?? error.message}`);
}

if (application.id !== CLIENT_ID) {
  die(
    [
      'DISCORD_CLIENT_ID does not match the token\'s application.',
      `  Token belongs to: ${application.username} (${application.id})`,
      `  .env says:        ${CLIENT_ID}`,
      'Commands sent with a mismatched ID are registered on a different app, which is why nothing appears in your server.',
    ].join('\n'),
  );
}

console.log(`Application: ${application.username} (${application.id})`);

const scopeLabel = GUILD_ID ? `guild ${GUILD_ID}` : 'global (can take up to an hour to appear)';
console.log(`Target:      ${scopeLabel}`);

async function listRegistered() {
  let global = [];
  let guild = [];

  try {
    global = await rest.get(Routes.applicationCommands(CLIENT_ID));
  } catch (error) {
    console.warn(`Could not read global commands: ${explain(error) ?? error.message}`);
  }

  if (GUILD_ID) {
    try {
      guild = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
    } catch (error) {
      die(`Could not read commands in guild ${GUILD_ID}.\n  ${explain(error) ?? error.message}`);
    }
  }

  const names = (list) => (list.length ? list.map((command) => `/${command.name}`).join(', ') : 'none');
  console.log(`\nRegistered globally: ${names(global)}`);
  if (GUILD_ID) console.log(`Registered in guild:  ${names(guild)}`);

  return { global, guild };
}

if (checkOnly) {
  await listRegistered();
  console.log(`\nInvite link (needs the applications.commands scope):\n  ${inviteUrl()}\n`);
  process.exit(0);
}

const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

try {
  const registered = await rest.put(route, { body: commands });
  console.log(`\n✔ Registered ${registered.length} commands ${GUILD_ID ? `in guild ${GUILD_ID}` : 'globally'}.`);
  if (!GUILD_ID) {
    console.log('  Global commands can take up to an hour to appear. Set DISCORD_GUILD_ID for instant updates.');
  }
} catch (error) {
  die(`Registration failed.\n  ${explain(error) ?? `${error.message} (code ${error.code ?? error.status ?? 'unknown'})`}`);
}

// Read them back so you can see exactly what Discord is holding.
await listRegistered();

console.log(`\nIf they still do not show up in Discord:`);
console.log(`  1. Re-invite the bot with the applications.commands scope:\n     ${inviteUrl()}`);
console.log('  2. Restart the Discord client (Ctrl+R) — command lists are cached per session.');
console.log('  3. Make sure the bot is running: npm start\n');
