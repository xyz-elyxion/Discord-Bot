import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getGuild } from '../lib/store.js';
import { CAPTCHA_TTL_MS, checkChallenge, getChallenge, issueChallenge, MAX_ATTEMPTS } from '../lib/verification.js';

const cooldowns = new Map(); // userId -> timestamp
const COOLDOWN_MS = 15_000;

function challengeKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function verificationConfig(interaction) {
  const { verification } = getGuild(interaction.guildId);
  return verification?.enabled && verification.roleId ? verification : null;
}

function reply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function startVerification(interaction) {
  const config = verificationConfig(interaction);
  if (!config) {
    await reply(interaction, 'Verification is not configured on this server.');
    return;
  }

  if (interaction.member.roles.cache.has(config.roleId)) {
    await reply(interaction, 'You are already verified.');
    return;
  }

  const lastIssued = cooldowns.get(interaction.user.id) ?? 0;
  if (Date.now() - lastIssued < COOLDOWN_MS) {
    await reply(interaction, 'Hold on a few seconds before requesting another captcha.');
    return;
  }
  cooldowns.set(interaction.user.id, Date.now());

  const { png } = issueChallenge(challengeKey(interaction));
  const minutes = Math.round(CAPTCHA_TTL_MS / 60_000);

  await interaction.reply({
    content: [
      '**Verification**',
      'Type the 6 characters shown in the image below.',
      `${minutes} minutes and ${MAX_ATTEMPTS} attempts — not case sensitive.`,
    ].join('\n'),
    files: [new AttachmentBuilder(png, { name: 'captcha.png' })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_answer').setLabel('Enter answer').setStyle(ButtonStyle.Primary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function openAnswerModal(interaction) {
  if (!getChallenge(challengeKey(interaction))) {
    await reply(interaction, 'That captcha expired. Press Verify to get a new one.');
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('verify_modal')
    .setTitle('Verification')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('answer')
          .setLabel('Characters in the image')
          .setStyle(TextInputStyle.Short)
          .setMinLength(4)
          .setMaxLength(8)
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

async function submitAnswer(interaction) {
  const config = verificationConfig(interaction);
  if (!config) {
    await reply(interaction, 'Verification is not configured on this server.');
    return;
  }

  let answer = '';
  try {
    answer = interaction.fields.getTextInputValue('answer');
  } catch {
    answer = '';
  }

  const result = checkChallenge(challengeKey(interaction), answer);

  if (result.status === 'ok') {
    try {
      await interaction.member.roles.add(config.roleId, 'Captcha verification');
    } catch (error) {
      console.error('Could not assign the verification role:', error);
      await reply(interaction, 'That was correct, but I could not give you the role — my role is probably too low.');
      return;
    }

    await reply(interaction, '✅ Solved. You are verified — welcome in!');
    return;
  }

  if (result.status === 'wrong') {
    await reply(interaction, `Not quite. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`);
    return;
  }

  if (result.status === 'too_many') {
    await reply(interaction, 'Too many wrong attempts. Press Verify to get a fresh captcha.');
    return;
  }

  await reply(interaction, 'That captcha expired. Press Verify to get a new one.');
}

export async function handleComponent(interaction) {
  if (!interaction.guildId || !interaction.member) return;

  const customId = interaction.customId;

  if (interaction.isButton()) {
    if (customId === 'verify_start' || customId === 'verify') {
      await startVerification(interaction);
      return;
    }
    if (customId === 'verify_answer') {
      await openAnswerModal(interaction);
    }
    return;
  }

  if (interaction.isModalSubmit() && customId === 'verify_modal') {
    await submitAnswer(interaction);
  }
}
