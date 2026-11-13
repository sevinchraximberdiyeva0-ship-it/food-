import 'dotenv/config';
import { z } from 'zod';

export const config = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ORIGIN: z.url().default('http://127.0.0.1:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
}).parse(process.env);
