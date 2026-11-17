import { MessageFlags } from 'discord.js';
import { getGuild } from '../lib/store.js';

export async function handleComponent(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.guildId || !interaction.member) return;

  if (interaction.customId === 'verify') {
    const config = getGuild(interaction.guildId);
    const { verification } = config;

    if (!verification.enabled || !verification.roleId) {
      await interaction.reply({
        content: 'Verification is not configured on this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.member.roles.cache.has(verification.roleId)) {
      await interaction.reply({ content: 'You are already verified.', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await interaction.member.roles.add(verification.roleId, 'Verification');
      await interaction.reply({ content: '✅ You are now verified. Welcome in!', flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Could not assign the verification role:', error);
      await interaction.reply({
        content: 'I could not give you the verified role — my role is probably too low.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
