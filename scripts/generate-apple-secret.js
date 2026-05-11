#!/usr/bin/env node
/**
 * Generates the Apple client_secret JWT that Supabase's Apple auth provider
 * requires. Apple capping this at 6 months means it has to be rotated twice
 * a year — that's what this script is for.
 *
 * Usage (all four env vars required; .p8 path can be anywhere on disk):
 *
 *   APPLE_P8_PATH=~/path/to/AuthKey_XXX.p8 \
 *   APPLE_TEAM_ID=5V7H8A99J4 \
 *   APPLE_KEY_ID=KJPM35A6U7 \
 *   APPLE_SERVICES_ID=com.zhoueverwin.golfmatchapp.signin \
 *   node scripts/generate-apple-secret.js | pbcopy
 *
 * Then paste the JWT into Supabase → Auth → Providers → Apple → Secret Key (JWT).
 *
 * The .p8 file is the private signing key Apple gives you once when you
 * register a Sign-In-with-Apple key. Keep it out of git and out of chat.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const required = ['APPLE_P8_PATH', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_SERVICES_ID'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required env vars: ' + missing.join(', '));
  process.exit(1);
}

const p8Path = process.env.APPLE_P8_PATH.replace(/^~/, process.env.HOME || '');
const privateKey = fs.readFileSync(path.resolve(p8Path));

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  audience: 'https://appleid.apple.com',
  issuer: process.env.APPLE_TEAM_ID,
  subject: process.env.APPLE_SERVICES_ID,
  keyid: process.env.APPLE_KEY_ID,
});

process.stdout.write(token);
