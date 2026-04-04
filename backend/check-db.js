const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

(async () => {
    const [branches, payments, sales, customers, requests, machines, simCards, stockMovements, installments] = await Promise.all([
        db.branch.count(),
        db.payment.count(),
        db.machineSale.count(),
        db.customer.count(),
        db.maintenanceRequest.count(),
        db.warehouseMachine.count(),
        db.simCard.count(),
        db.stockMovement.count(),
        db.installment.count()
    ]);

    console.log('=== DATABASE CONTENTS ===');
    console.log('Branches:', branches);
    console.log('Payments:', payments);
    console.log('Sales:', sales);
    console.log('Customers:', customers);
    console.log('Requests:', requests);
    console.log('Machines:', machines);
    console.log('SIM Cards:', simCards);
    console.log('Stock Movements:', stockMovements);
    console.log('Installments:', installments);

    if (branches > 0) {
        const b = await db.branch.findMany({ select: { id: true, code: true, name: true, status: true, lastSeen: true } });
        console.log('\n=== BRANCHES ===');
        b.forEach(x => console.log(`  ${x.code} | ${x.name} | ${x.status} | lastSeen: ${x.lastSeen}`));
    }

    if (payments > 0) {
        const p = await db.payment.findMany({ take: 3, select: { id: true, amount: true, branchId: true, customerId: true, type: true, createdAt: true } });
        console.log('\n=== SAMPLE PAYMENTS ===');
        p.forEach(x => console.log(`  ${x.id} | ${x.amount} | branch: ${x.branchId} | type: ${x.type} | ${x.createdAt}`));
    }

    if (customers > 0) {
        const c = await db.customer.findMany({ take: 3, select: { id: true, client_name: true, bkcode: true, branchId: true } });
        console.log('\n=== SAMPLE CUSTOMERS ===');
        c.forEach(x => console.log(`  ${x.bkcode} | ${x.client_name} | branch: ${x.branchId}`));
    }

    await db.$disconnect();
})();
