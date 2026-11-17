import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuild, setGuild } from '../lib/store.js';
import { COLORS, errorEmbed, fieldsEmbed, okEmbed, onOff } from '../lib/embeds.js';

const RULES = {
  spam: 'Spam',
  invites: 'Discord invites',
  links: 'Links',
  caps: 'Excessive caps',
  mentions: 'Mass mentions',
  emojis: 'Emoji spam',
};

const LIMITS = {
  spam_threshold: 'Spam messages per window',
  spam_window: 'Spam window (seconds)',
  mention_limit: 'Mentions before action',
  emoji_limit: 'Emojis before action',
  caps_percent: 'Caps percentage',
  timeout_minutes: 'Timeout length (minutes)',
};

const EXEMPT_TYPES = {
  user: 'exemptUsers',
  role: 'exemptRoles',
  channel: 'exemptChannels',
};

function parseId(input) {
  return String(input ?? '').replace(/[<@#!&>]/g, '');
}

export default {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automatic moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Turn automod on'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Turn automod off'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show the automod settings'))
    .addSubcommand((sub) =>
      sub
        .setName('action')
        .setDescription('What happens when a rule is broken')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Action')
            .setRequired(true)
            .addChoices(
              { name: 'delete the message', value: 'delete' },
              { name: 'delete + timeout', value: 'timeout' },
              { name: 'delete + kick', value: 'kick' },
            ),
        )
        .addIntegerOption((option) =>
          option.setName('timeout_minutes').setDescription('Timeout length when using the timeout action').setMinValue(1).setMaxValue(40320),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rule')
        .setDescription('Enable or disable a single rule')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Rule')
            .setRequired(true)
            .addChoices(...Object.entries(RULES).map(([value, name]) => ({ name, value }))),
        )
        .addBooleanOption((option) => option.setName('enabled').setDescription('Turn the rule on or off').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('limits')
        .setDescription('Adjust a numeric limit')
        .addStringOption((option) =>
          option
            .setName('setting')
            .setDescription('Which limit')
            .setRequired(true)
            .addChoices(...Object.entries(LIMITS).map(([value, name]) => ({ name, value }))),
        )
        .addIntegerOption((option) => option.setName('value').setDescription('New value').setRequired(true).setMinValue(1).setMaxValue(1000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('words')
        .setDescription('Manage the banned word list')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Add, remove or list')
            .setRequired(true)
            .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }),
        )
        .addStringOption((option) => option.setName('word').setDescription('Word or phrase')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('exempt')
        .setDescription('Manage exempt users, roles and channels')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Add, remove or list')
            .setRequired(true)
            .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }),
        )
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('What to exempt')
            .addChoices({ name: 'user', value: 'user' }, { name: 'role', value: 'role' }, { name: 'channel', value: 'channel' }),
        )
        .addStringOption((option) => option.setName('id').setDescription('User/role/channel ID or mention')),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuild(interaction.guild.id);
    const automod = config.automod;

    if (sub === 'enable' || sub === 'disable') {
      setGuild(interaction.guild.id, { automod: { enabled: sub === 'enable' } });
      await interaction.reply({
        embeds: [okEmbed(`Automod ${sub === 'enable' ? 'enabled' : 'disabled'}`, sub === 'enable' ? 'Rules are now enforced.' : 'No messages will be filtered.')],
      });
      return;
    }

    if (sub === 'status') {
      const rules = Object.entries(RULES)
        .map(([key, label]) => `${label}: ${automod[key].enabled ? '✅' : '❌'}`)
        .join('\n');

      await interaction.reply({
        embeds: [
          fieldsEmbed(
            'Automod settings',
            null,
            [
              ['Status', onOff(automod.enabled), true],
              ['Action', automod.action, true],
              ['Timeout', `${automod.timeoutMinutes}m`, true],
              ['Rules', rules],
              ['Spam', `${automod.spam.threshold} / ${Math.round(automod.spam.windowMs / 1000)}s`, true],
              ['Mentions', String(automod.mentions.limit), true],
              ['Emojis', String(automod.emojis.limit), true],
              ['Caps', `${automod.caps.percent}%`, true],
              ['Banned words', String(automod.bannedWords.length), true],
              ['Exemptions', `${automod.exemptUsers.length} users · ${automod.exemptRoles.length} roles · ${automod.exemptChannels.length} channels`],
            ],
            COLORS.primary,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'action') {
      const type = interaction.options.getString('type');
      const minutes = interaction.options.getInteger('timeout_minutes');
      setGuild(interaction.guild.id, {
        automod: { action: type, ...(minutes ? { timeoutMinutes: minutes } : {}) },
      });
      await interaction.reply({ embeds: [okEmbed('Automod action updated', `Rule breaks now result in **${type}**.`)] });
      return;
    }

    if (sub === 'rule') {
      const name = interaction.options.getString('name');
      const enabled = interaction.options.getBoolean('enabled');
      setGuild(interaction.guild.id, { automod: { [name]: { enabled } } });
      await interaction.reply({ embeds: [okEmbed('Rule updated', `${RULES[name]} is now ${enabled ? 'enabled' : 'disabled'}.`)] });
      return;
    }

    if (sub === 'limits') {
      const setting = interaction.options.getString('setting');
      const value = interaction.options.getInteger('value');

      const patch = {
        spam_threshold: { automod: { spam: { threshold: value } } },
        spam_window: { automod: { spam: { windowMs: value * 1000 } } },
        mention_limit: { automod: { mentions: { limit: value } } },
        emoji_limit: { automod: { emojis: { limit: value } } },
        caps_percent: { automod: { caps: { percent: Math.min(value, 100) } } },
        timeout_minutes: { automod: { timeoutMinutes: value } },
      }[setting];

      setGuild(interaction.guild.id, patch);
      await interaction.reply({ embeds: [okEmbed('Limit updated', `${LIMITS[setting]} is now **${value}**.`)] });
      return;
    }

    if (sub === 'words') {
      const action = interaction.options.getString('action');
      const word = interaction.options.getString('word')?.trim();

      if (action === 'list') {
        await interaction.reply({
          embeds: [
            fieldsEmbed('Banned words', automod.bannedWords.length ? automod.bannedWords.map((entry) => `\`${entry}\``).join(', ').slice(0, 4000) : 'None configured.', [], COLORS.primary),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!word) {
        await interaction.reply({ embeds: [errorEmbed('Provide a word to add or remove.')], flags: MessageFlags.Ephemeral });
        return;
      }

      const words = new Set(automod.bannedWords);
      if (action === 'add') words.add(word.toLowerCase());
      else words.delete(word.toLowerCase());

      setGuild(interaction.guild.id, { automod: { bannedWords: [...words] } });
      await interaction.reply({ embeds: [okEmbed('Banned words updated', `\`${word}\` was ${action === 'add' ? 'added' : 'removed'}. ${words.size} total.`)] });
      return;
    }

    if (sub === 'exempt') {
      const action = interaction.options.getString('action');
      const type = interaction.options.getString('type') ?? 'user';
      const key = EXEMPT_TYPES[type];
      const list = [...automod[key]];

      if (action === 'list') {
        const mention = (id) => (type === 'role' ? `<@&${id}>` : type === 'channel' ? `<#${id}>` : `<@${id}>`);
        await interaction.reply({
          embeds: [
            fieldsEmbed(`Automod exemptions (${type})`, list.length ? list.map(mention).join(', ').slice(0, 4000) : 'None', [], COLORS.primary),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const rawId = parseId(interaction.options.getString('id'));
      if (!rawId) {
        await interaction.reply({ embeds: [errorEmbed('Provide an ID or mention.')], flags: MessageFlags.Ephemeral });
        return;
      }

      const next = action === 'add' ? [...new Set([...list, rawId])] : list.filter((id) => id !== rawId);
      setGuild(interaction.guild.id, { automod: { [key]: next } });
      await interaction.reply({ embeds: [okEmbed('Exemptions updated', `${type} \`${rawId}\` ${action === 'add' ? 'added' : 'removed'}.`)] });
    }
  },
};
