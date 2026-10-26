import 'reflect-metadata';

import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ProjectAccessService } from './project-access.service';
import { ProjectsRepository } from './repositories/projects.repository';
import { ProjectsService } from './projects.service';

interface ProjectFixture {
  ownerId: string;
  projectId: string;
  username: string;
}

interface AuditRecord {
  actorId: string;
  actorUsername: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
}

describe('P2 project repository regressions with isolated SQLite', () => {
  let prisma: PrismaService;
  let repository: ProjectsRepository;
  let projectsService: ProjectsService;
  let databasePath: string;
  let testDirectory: string;

  beforeAll(async () => {
    testDirectory = mkdtempSync(join(tmpdir(), 'scpc-project-p2-'));
    databasePath = join(testDirectory, 'projects.db');
    prisma = new PrismaService({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, '/')}` } },
    });

    const migrationsPath = resolve(__dirname, '../../../../../prisma/migrations');
    for (const entry of readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const sql = readFileSync(resolve(migrationsPath, entry.name, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter((statement) => statement.trim())) {
        await prisma.$executeRawUnsafe(statement);
      }
    }

    repository = new ProjectsRepository(prisma);
    projectsService = new ProjectsService(new ProjectAccessService(repository), repository);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (databasePath && existsSync(databasePath)) unlinkSync(databasePath);
    if (testDirectory && existsSync(testDirectory)) rmdirSync(testDirectory);
  });

  async function createProjectFixture(label: string): Promise<ProjectFixture> {
    const username = `${label}-${randomUUID()}`;
    const owner = await prisma.user.create({
      data: {
        nickname: label,
        passwordHash: 'test-only-password-hash',
        username,
      },
      select: { id: true, username: true },
    });
    const project = await prisma.project.create({
      data: {
        name: `${label} 课程项目`,
        ownerId: owner.id,
        status: 'ACTIVE',
      },
      select: { id: true, name: true },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, role: 'OWNER', userId: owner.id },
    });

    return { ownerId: owner.id, projectId: project.id, username: owner.username };
  }

  async function addMember(projectId: string, label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        nickname: label,
        passwordHash: 'test-only-password-hash',
        username: `${label}-${randomUUID()}`,
      },
      select: { id: true },
    });
    await prisma.projectMember.create({
      data: { projectId, role: 'MEMBER', userId: user.id },
    });
    return user.id;
  }

  async function auditRows(projectId: string): Promise<AuditRecord[]> {
    return prisma.$queryRaw<AuditRecord[]>`
      SELECT "projectId", "projectName", "projectStatus", "actorId", "actorUsername"
      FROM "ProjectDeletionAudit"
      WHERE "projectId" = ${projectId}
    `;
  }

  it('keeps exactly one owner when two transfers use the same previous-owner snapshot', async () => {
    const { ownerId, projectId } = await createProjectFixture('并发负责人');
    const firstTargetId = await addMember(projectId, '目标甲');
    const secondTargetId = await addMember(projectId, '目标乙');

    const outcomes = await Promise.allSettled([
      repository.transferOwnership(projectId, ownerId, ownerId, firstTargetId),
      repository.transferOwnership(projectId, ownerId, ownerId, secondTargetId),
    ]);
    const successfulTransfers = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { ownerId: true },
    });
    const owners = await prisma.projectMember.findMany({
      where: { projectId, role: 'OWNER' },
      select: { userId: true },
    });
    const transferEvents = await prisma.activityLog.count({
      where: { action: 'PROJECT_OWNER_TRANSFERRED', projectId },
    });

    expect(successfulTransfers).toHaveLength(1);
    expect(owners).toEqual([{ userId: project.ownerId }]);
    expect(transferEvents).toBe(1);

    await expect(
      repository.transferOwnership(projectId, ownerId, ownerId, secondTargetId),
    ).rejects.toMatchObject({ code: 'PROJECT_OWNER_TRANSFER_CONFLICT' });
    expect(await prisma.projectMember.count({ where: { projectId, role: 'OWNER' } })).toBe(1);
  });

  it('rolls back a transfer when the actor is not the owner or a platform admin', async () => {
    const { ownerId, projectId } = await createProjectFixture('越权移交');
    const targetId = await addMember(projectId, '目标成员');
    const actorId = await addMember(projectId, '无权限成员');

    await expect(
      repository.transferOwnership(projectId, actorId, ownerId, targetId),
    ).rejects.toMatchObject({ code: 'PROJECT_PERMISSION_DENIED' });

    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({
      ownerId,
    });
    expect(await prisma.projectMember.count({ where: { projectId, role: 'OWNER' } })).toBe(1);
    expect(
      await prisma.activityLog.count({ where: { action: 'PROJECT_OWNER_TRANSFERRED', projectId } }),
    ).toBe(0);
  });

  it('leaves a durable actor and project snapshot after a confirmed deletion', async () => {
    const { ownerId, projectId, username } = await createProjectFixture('删除审计');
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    });

    await expect(
      projectsService.deleteProject(ownerId, projectId, { confirmName: project.name }),
    ).resolves.toEqual({ deleted: true });

    expect(await prisma.project.findUnique({ where: { id: projectId } })).toBeNull();
    await expect(auditRows(projectId)).resolves.toEqual([
      {
        actorId: ownerId,
        actorUsername: username,
        projectId,
        projectName: project.name,
        projectStatus: 'ACTIVE',
      },
    ]);
  });

  it('does not write a deletion audit after a bad confirmation or forbidden request', async () => {
    const { ownerId, projectId } = await createProjectFixture('拒绝删除');
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    });
    const memberId = await addMember(projectId, '普通成员');

    await expect(
      projectsService.deleteProject(ownerId, projectId, { confirmName: '错误名称' }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      projectsService.deleteProject(memberId, projectId, { confirmName: project.name }),
    ).rejects.toMatchObject({ status: 403 });

    expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull();
    await expect(auditRows(projectId)).resolves.toEqual([]);
  });

  it('does not delete the project if the deletion audit insert fails', async () => {
    const { ownerId, projectId } = await createProjectFixture('审计回滚');
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    });
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER "fail_project_deletion_audit" BEFORE INSERT ON "ProjectDeletionAudit" BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END`,
    );

    await expect(
      projectsService.deleteProject(ownerId, projectId, { confirmName: project.name }),
    ).rejects.toBeDefined();
    expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull();
    await expect(auditRows(projectId)).resolves.toEqual([]);
  });
});
