import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ids = {
  activity: 'seed-activity-project-created',
  admin: 'seed-user-admin',
  iteration: 'seed-iteration-p0',
  project: 'seed-project-demo',
  requirement: 'seed-requirement-p0',
  task: 'seed-task-p0',
} as const;

// Generated with scrypt for local development only. No plaintext password is stored in Git.
const seedPasswordHash =
  'scrypt$1aadc15765285319acaa32f919f164a8$480b04c9d017ae2120f6260ec11684ab8a6ae0c69d3cfa7fd61601cdeb57f17293d1c91995fdc1a4d3955bd51a51f5106594684f01023e040369a515b22d07ac';

async function main(): Promise<void> {
  await prisma.user.upsert({
    where: { id: ids.admin },
    update: { nickname: '项目管理员', status: 'ACTIVE' },
    create: {
      id: ids.admin,
      nickname: '项目管理员',
      passwordHash: seedPasswordHash,
      username: 'admin',
    },
  });

  await prisma.project.upsert({
    where: { id: ids.project },
    update: { name: '课程项目协作系统', ownerId: ids.admin, status: 'ACTIVE' },
    create: {
      description: '用于本地开发和课程演示的示例项目',
      id: ids.project,
      name: '课程项目协作系统',
      ownerId: ids.admin,
      status: 'ACTIVE',
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: ids.project, userId: ids.admin },
    },
    update: { role: 'OWNER' },
    create: { projectId: ids.project, role: 'OWNER', userId: ids.admin },
  });

  await prisma.iteration.upsert({
    where: { id: ids.iteration },
    update: { name: 'P0 基础迭代', status: 'IN_PROGRESS' },
    create: {
      endDate: new Date('2026-10-02T23:59:59.000Z'),
      goal: '完成基础工程与契约',
      id: ids.iteration,
      name: 'P0 基础迭代',
      projectId: ids.project,
      startDate: new Date('2026-09-21T00:00:00.000Z'),
      status: 'IN_PROGRESS',
    },
  });

  await prisma.requirement.upsert({
    where: {
      projectId_number: { number: 'REQ-001', projectId: ids.project },
    },
    update: { title: '基础后端服务与数据模型', status: 'IN_PROGRESS' },
    create: {
      acceptanceCriteria: '服务可启动，Migration 和种子命令可重复执行。',
      creatorId: ids.admin,
      id: ids.requirement,
      number: 'REQ-001',
      priority: 'HIGH',
      projectId: ids.project,
      status: 'IN_PROGRESS',
      title: '基础后端服务与数据模型',
    },
  });

  await prisma.task.upsert({
    where: { id: ids.task },
    update: {
      iterationId: ids.iteration,
      requirementId: ids.requirement,
      status: 'IN_PROGRESS',
      title: '完成 Prisma Schema 与 Migration',
    },
    create: {
      createdById: ids.admin,
      dueDate: new Date('2026-10-01T23:59:59.000Z'),
      estimatedHours: 12,
      id: ids.task,
      iterationId: ids.iteration,
      priority: 'HIGH',
      projectId: ids.project,
      requirementId: ids.requirement,
      status: 'IN_PROGRESS',
      title: '完成 Prisma Schema 与 Migration',
    },
  });

  await prisma.activityLog.upsert({
    where: { id: ids.activity },
    update: {},
    create: {
      action: 'PROJECT_CREATED',
      actorId: ids.admin,
      afterValue: JSON.stringify({ name: '课程项目协作系统', status: 'ACTIVE' }),
      id: ids.activity,
      projectId: ids.project,
      targetId: ids.project,
      targetType: 'PROJECT',
    },
  });

  console.log('Seed data is ready.');
}

void main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
