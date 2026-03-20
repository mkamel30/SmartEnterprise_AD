const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const logger = require('./utils/logger');
const prisma = new PrismaClient();

async function main() {
  logger.info('--- Seeding Central Admin Portal ---');

  // Create Super Admin with exact credentials as specified
  const adminPassword = 'Mk@351762';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const recoveryKey = Math.random().toString(36).substring(2, 10).toUpperCase();

  try {
    const admin = await prisma.adminUser.upsert({
      where: { username: 'Admin@' },
      update: {
        passwordHash: hashedPassword,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        recoveryKey: recoveryKey
      },
      create: {
        username: 'Admin@',
        passwordHash: hashedPassword,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        recoveryKey: recoveryKey
      }
    });

    let finalAdmin = await prisma.adminUser.findUnique({ where: { username: 'Admin@' } });
    if (!finalAdmin.recoveryKey) {
      finalAdmin = await prisma.adminUser.update({
        where: { username: 'Admin@' },
        data: { recoveryKey: recoveryKey }
      });
    }
    
    logger.info({ 
      username: admin.username, 
      recoveryKey: finalAdmin.recoveryKey 
    }, 'Super Admin created/verified');

    console.log('==========================================');
    console.log('SUPER ADMIN: Admin@ / ' + adminPassword);
    console.log('RECOVERY KEY: ' + finalAdmin.recoveryKey);
    console.log('==========================================');
  } catch (error) {
    logger.error({ err: error }, 'Seeding failed (continuing anyway...)');
    process.exit(0);
  }
}

main()
  .catch((e) => {
    logger.error({ err: e }, 'Seeding failed (continuing anyway...)');
    process.exit(0);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
