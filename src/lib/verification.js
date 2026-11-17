import { createCaptcha } from './captcha.js';

export const CAPTCHA_TTL_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 3;

const challenges = new Map(); // key -> { code, expiresAt, attempts }

function prune(now = Date.now()) {
  for (const [key, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(key);
  }
}

/** Create a captcha for a user, replacing any previous one. */
export function issueChallenge(key) {
  prune();

  const { code, png } = createCaptcha(6);
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;
  challenges.set(key, { code, expiresAt, attempts: 0 });

  return { code, png, expiresAt };
}

export function getChallenge(key) {
  const challenge = challenges.get(key);
  if (!challenge) return null;
  if (challenge.expiresAt <= Date.now()) {
    challenges.delete(key);
    return null;
  }
  return challenge;
}

/**
 * Check an answer. Correct answers consume the challenge; three wrong answers
 * also consume it so a bot cannot brute force a single image.
 */
export function checkChallenge(key, answer) {
  const challenge = getChallenge(key);
  if (!challenge) return { status: 'missing' };

  challenge.attempts += 1;
  const submitted = String(answer ?? '').trim().toUpperCase();

  if (submitted === challenge.code) {
    challenges.delete(key);
    return { status: 'ok' };
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    challenges.delete(key);
    return { status: 'too_many' };
  }

  return { status: 'wrong', attemptsLeft: MAX_ATTEMPTS - challenge.attempts };
}

export function clearChallenge(key) {
  challenges.delete(key);
}

export function clearAllChallenges() {
  challenges.clear();
}
