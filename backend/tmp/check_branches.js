const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const branches = await prisma.branch.findMany({
        select: { id: true, code: true, name: true, status: true, lastSeen: true }
    });
    console.log(JSON.stringify(branches, null, 2));
    await prisma.$disconnect();
}

main().catch(console.error);
