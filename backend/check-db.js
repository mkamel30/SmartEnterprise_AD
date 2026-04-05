const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const branchCount = await prisma.branch.count({ where: { isActive: true } });
    console.log('Active Branch Count:', branchCount);

    const saleCount = await prisma.machineSale.count();
    console.log('Total MachineSale Count:', saleCount);

    const installmentCount = await prisma.installment.count();
    console.log('Total Installment Count:', installmentCount);

    const firstSale = await prisma.machineSale.findFirst();
    if (firstSale) {
        console.log('First Sale Date:', firstSale.saleDate);
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
