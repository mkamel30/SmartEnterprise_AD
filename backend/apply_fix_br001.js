const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hwid = "00c250952890760ac1aa4bf185adbea785e909ff71f696ffab4695afa974a96d";
  
  // 1. Authorize HWID
  const updatedBranch = await prisma.branch.update({
    where: { code: 'BR001' },
    data: { authorizedHWID: hwid }
  });
  console.log('Branch Updated:', updatedBranch.code);

  // 2. Create License
  const licenseKey = "BR001-" + Math.random().toString(36).substring(2, 12).toUpperCase();
  const expirationDate = new Date();
  expirationDate.setFullYear(expirationDate.getFullYear() + 1); // 1 year expiry

  const license = await prisma.license.upsert({
    where: { licenseKey: licenseKey },
    update: {
      status: 'ACTIVE',
      expirationDate: expirationDate,
      hwid: hwid,
      branchCode: 'BR001'
    },
    create: {
      licenseKey: licenseKey,
      branchCode: 'BR001',
      branchName: updatedBranch.name,
      hwid: hwid,
      type: 'BRANCH',
      status: 'ACTIVE',
      expirationDate: expirationDate,
      maxActivations: 1,
      activationCount: 1,
      activationDate: new Date()
    }
  });
  console.log('License Created:', license.licenseKey);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
