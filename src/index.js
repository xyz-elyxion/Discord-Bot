import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
} from 'discord.js';
import { summarizeChannels } from './lib/channels.js';
import { flushStore, initStore } from './lib/store.js';
import { handleComponent } from './events/interactions.js';
import { registerAntinuke } from './events/antinuke.js';
import { registerAutomod } from './events/automod.js';
import { registerLogging } from './events/logging.js';
import { registerMembers } from './events/members.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

await initStore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: enable "Server Members" in the Developer Portal
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: enable "Message Content" in the Developer Portal
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User],
});

client.commands = new Collection();

const commandsDir = path.join(__dirname, 'commands');
for (const file of (await readdir(commandsDir)).filter((name) => name.endsWith('.js'))) {
  const { default: command } = await import(path.join(commandsDir, file));
  if (!command?.data || typeof command.execute !== 'function') {
    console.warn(`Skipping ${file}: expected a default export with "data" and "execute".`);
    continue;
  }
  client.commands.set(command.data.name, command);
}

registerAntinuke(client);
registerAutomod(client);
registerMembers(client);
registerLogging(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag} with ${client.commands.size} commands.`);
  readyClient.user.setActivity('/help', { type: ActivityType.Listening });

  // Tell the operator when the running bot has commands Discord does not know about.
  try {
    const registered = new Set(
      (await readyClient.application.commands.fetch()).map((command) => command.name),
    );

    const guildId = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID;
    const guild = guildId ? readyClient.guilds.cache.get(guildId) : null;

    if (guild) {
      for (const command of await guild.commands.fetch()) registered.add(command.name);
      console.log(`Slash commands registered in ${guild.name}: ${registered.size}`);
    } else {
      console.log(`Slash commands registered globally: ${registered.size}`);
      if (registered.size === 0) {
        console.warn('No slash commands are registered yet — run "npm run deploy".');
      }
    }

    const missing = [...client.commands.keys()].filter((name) => !registered.has(name));
    if (missing.length) {
      console.warn(
        `${missing.length} commands are not registered with Discord — run "npm run deploy": ${missing.join(', ')}`,
      );
    }
  } catch (error) {
    console.warn('Could not check which commands are registered:', error.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    await handleComponent(interaction).catch((error) => console.error('Button handler failed:', error));
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`Received unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`Error while running /${interaction.commandName}:`, error);

    const response = {
      content: 'Something went wrong while running that command.',
      flags: MessageFlags.Ephemeral,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    } catch (replyError) {
      console.error('Failed to send the error message:', replyError);
    }
  }
});

client.on(Events.GuildCreate, (guild) => {
  const { visible, hidden } = summarizeChannels(guild);
  console.log(
    `Joined ${guild.name}: ${visible.length} channels visible, ${hidden.length} hidden by channel obfuscation.`,
  );
});

client.on(Events.Error, (error) => console.error('Client error:', error));
client.on(Events.Warn, (message) => console.warn('Client warning:', message));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`\nReceived ${signal}, saving data and shutting down.`);
    await flushStore().catch((error) => console.error('Failed to flush the store:', error));
    client.destroy();
    process.exit(0);
  });
}

await client.login(token);
