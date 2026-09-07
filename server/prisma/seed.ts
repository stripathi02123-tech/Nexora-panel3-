import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@nexora.local';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log('Admin user already exists, skipping seed.');
    return;
  }

  const password = await bcrypt.hash('admin123', 12);

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      password,
      name: 'Admin',
      role: 'ADMIN',
      isActive: true,
    },
  });

  await prisma.plan.createMany({
    data: [
      {
        name: 'Starter',
        description: '1 vCPU, 1GB RAM, 20GB SSD',
        price: 5.99,
        vmCpuLimit: 1,
        vmRamLimit: 1024,
        vmDiskLimit: 20,
        containerCpuLimit: 1,
        containerRamLimit: 1024,
        containerDiskLimit: 20,
        dockerLimit: 3,
        bandwidthLimit: 1024,
        backupLimit: 2,
        snapshotLimit: 3,
        features: JSON.stringify(['backups', 'snapshots', 'firewall', 'monitoring']),
        isActive: true,
      },
      {
        name: 'Pro',
        description: '2 vCPU, 4GB RAM, 80GB SSD',
        price: 19.99,
        vmCpuLimit: 2,
        vmRamLimit: 4096,
        vmDiskLimit: 80,
        containerCpuLimit: 2,
        containerRamLimit: 4096,
        containerDiskLimit: 80,
        dockerLimit: 10,
        bandwidthLimit: 5120,
        backupLimit: 5,
        snapshotLimit: 10,
        features: JSON.stringify(['backups', 'snapshots', 'firewall', 'monitoring', 'migration', 'auto-backup']),
        isActive: true,
      },
      {
        name: 'Enterprise',
        description: '4 vCPU, 16GB RAM, 320GB SSD',
        price: 49.99,
        vmCpuLimit: 4,
        vmRamLimit: 16384,
        vmDiskLimit: 320,
        containerCpuLimit: 4,
        containerRamLimit: 16384,
        containerDiskLimit: 320,
        dockerLimit: 25,
        bandwidthLimit: 20480,
        backupLimit: 20,
        snapshotLimit: 30,
        features: JSON.stringify(['backups', 'snapshots', 'firewall', 'monitoring', 'migration', 'auto-backup', 'dedicated-ip', 'priority-support']),
        isActive: true,
      },
    ],
  });

  await prisma.subscription.create({
    data: {
      userId: admin.id,
      planId: (await prisma.plan.findFirst({ where: { name: 'Enterprise' } }))!.id,
      status: 'ACTIVE',
      startDate: new Date(),
      autoRenew: true,
    },
  });

  console.log(`Seed complete. Admin created: ${adminEmail} / admin123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
