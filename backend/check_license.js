const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const license = await prisma.license.findFirst({
    where: { branchCode: 'BR001' }
  });
  console.log(JSON.stringify(license, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
