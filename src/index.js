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
} from 'discord.js';
import { summarizeChannels } from './lib/channels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
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

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag} with ${client.commands.size} commands.`);
  readyClient.user.setActivity('/help', { type: ActivityType.Listening });
});
client.on(Events.InteractionCreate, async (interaction) => {
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
  if (hidden.length) {
    console.log(
      `${guild.name}: ${visible.length} channels visible, ${hidden.length} hidden by channel obfuscation.`,
    );
  }
});

client.on(Events.Error, (error) => console.error('Client error:', error));
client.on(Events.Warn, (message) => console.warn('Client warning:', message));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\nReceived ${signal}, shutting down.`);
    client.destroy();
    process.exit(0);
  });
}

await client.login(token);
