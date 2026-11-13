import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { userInput } from './validation.js';
import { hashPassword } from './security.js';

const input = userInput.parse({ email: process.env.ADMIN_EMAIL, name: process.env.ADMIN_NAME, password: process.env.ADMIN_PASSWORD });
const db = new PrismaClient();
try {
  // No public registration or default credentials; existing accounts are never overwritten.
  await db.user.create({ data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password), role: 'ADMIN' }, select: { id: true } });
  console.log('Administrator yaratildi. ADMIN_PASSWORD muhit qiymatini o‘chiring.');
} finally { await db.$disconnect(); }
