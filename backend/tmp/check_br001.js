const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const branch = await prisma.branch.findFirst({
        where: { code: 'BR001' },
        select: { id: true, code: true, name: true, apiKey: true, status: true }
    });
    console.log(JSON.stringify(branch, null, 2));
    await prisma.$disconnect();
}

main().catch(console.error);
