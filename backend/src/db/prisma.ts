import { PrismaClient } from '@prisma/client';

/**
 * One client for the process. Prisma pools connections itself; constructing a second
 * client is how you exhaust a Postgres connection limit.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type Db = PrismaClient;

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
