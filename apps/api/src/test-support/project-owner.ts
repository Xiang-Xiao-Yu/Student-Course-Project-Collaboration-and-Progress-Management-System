import type { PrismaService } from '../prisma/prisma.service';

// Give the fixture a genuine OWNER membership without granting platform privileges.
export function seedOwnedProject(prisma: PrismaService, ownerId: string) {
  return prisma.project.create({
    data: {
      name: '已有负责项目',
      ownerId,
      members: { create: { userId: ownerId, role: 'OWNER' } },
    },
    select: { id: true },
  });
}
