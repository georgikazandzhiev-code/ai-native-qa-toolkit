// config/env.ts — the only module that reads process.env, validated once at load.
import { z } from 'zod';

const EnvSchema = z.strictObject({
  API_URL: z.string().url(),
});

export const env = EnvSchema.parse({ API_URL: process.env.API_URL });
