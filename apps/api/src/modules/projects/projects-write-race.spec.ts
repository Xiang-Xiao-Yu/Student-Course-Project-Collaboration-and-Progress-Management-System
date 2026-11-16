import 'reflect-metadata';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

import { PrismaService } from '../../prisma/prisma.service';
import { AvatarStorageService } from '../users/avatar-storage.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './repositories/projects.repository';

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'scpc-project-write-race-'));
  const prisma = new PrismaService({
    datasources: { db: { url: `file:${join(directory, 'test.db').replaceAll('\\', '/')}` } },
  });
  const migrations = resolve(__dirname, '../../../../../prisma/migrations');
  for (const entry of readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    for (const sql of readFileSync(join(migrations, entry.name, 'migration.sql'), 'utf8')
      .split(';')
      .filter((sql) => sql.trim())) {
      await prisma.$executeRawUnsafe(sql);
    }
  }
  const user = (username: string, isPlatformAdmin = false) =>
    prisma.user.create({
      data: { username, nickname: username, passwordHash: 'test', isPlatformAdmin },
    });
  const owner = await user('owner');
  const successor = await user('successor');
  const invitee = await user('invitee');
  const admin = await user('admin', true);
  const repository = new ProjectsRepository(prisma);
  const project = await repository.createProject(owner.id, {
    name: '课程项目',
    startDate: new Date('2026-11-01'),
    endDate: new Date('2026-12-31'),
  });
  await repository.addMember(project.id, owner.id, successor.id, 'MEMBER');
  const access = new ProjectAccessService(repository);
  const service = new ProjectsService(access, repository);
  const members = new ProjectMembersService(access, repository, new AvatarStorageService());
  const afterAccess = (change: () => Promise<unknown>) => {
    const original = access.requirePermission.bind(access);
    vi.spyOn(access, 'requirePermission').mockImplementationOnce(async (...args) => {
      const snapshot = await original(...args);
      await change();
      return snapshot;
    });
  };
  return {
    prisma,
    repository,
    service,
    members,
    owner,
    successor,
    invitee,
    admin,
    project,
    afterAccess,
  };
}

it.each(['edit', 'delete', 'invite', 'status'] as const)(
  'rejects a former owner’s stale %s request after transfer without writing data or audit',
  async (operation) => {
    const f = await fixture();
    try {
      const beforeLogs = await f.prisma.activityLog.count({ where: { projectId: f.project.id } });
      f.afterAccess(() =>
        f.repository.transferOwnership(f.project.id, f.owner.id, f.owner.id, f.successor.id),
      );
      const request =
        operation === 'edit'
          ? f.service.updateProject(f.owner.id, f.project.id, { name: '失权请求' })
          : operation === 'delete'
            ? f.service.deleteProject(f.owner.id, f.project.id, { confirmName: f.project.name })
            : operation === 'invite'
              ? f.members.inviteMember(f.owner.id, f.project.id, {
                  username: f.invitee.username,
                  role: 'MEMBER',
                })
              : f.service.updateStatus(f.owner.id, f.project.id, { status: 'ACTIVE' });
      await expect(request).rejects.toMatchObject({
        response: { code: 'PROJECT_PERMISSION_DENIED' },
      });
      expect(await f.prisma.project.findUnique({ where: { id: f.project.id } })).toMatchObject({
        ownerId: f.successor.id,
        name: f.project.name,
        status: 'PLANNING',
      });
      expect(
        await f.prisma.projectMember.count({
          where: { projectId: f.project.id, userId: f.invitee.id },
        }),
      ).toBe(0);
      expect(await f.prisma.projectDeletionAudit.count()).toBe(0);
      expect(await f.prisma.activityLog.count({ where: { projectId: f.project.id } })).toBe(
        beforeLogs + 1,
      );
    } finally {
      await f.prisma.$disconnect();
    }
  },
);

it.each(['edit', 'invite', 'status'] as const)(
  'preserves archival when a stale %s request resumes',
  async (operation) => {
    const f = await fixture();
    try {
      await f.repository.updateProjectStatus(f.project.id, f.owner.id, 'ACTIVE', 'PLANNING');
      f.afterAccess(async () => {
        await f.repository.updateProjectStatus(f.project.id, f.owner.id, 'COMPLETED', 'ACTIVE');
        await f.repository.updateProjectStatus(f.project.id, f.owner.id, 'ARCHIVED', 'COMPLETED');
      });
      const request =
        operation === 'edit'
          ? f.service.updateProject(f.owner.id, f.project.id, { name: '旧编辑' })
          : operation === 'invite'
            ? f.members.inviteMember(f.owner.id, f.project.id, {
                username: f.invitee.username,
                role: 'MEMBER',
              })
            : f.service.updateStatus(f.owner.id, f.project.id, { status: 'PAUSED' });
      await expect(request).rejects.toMatchObject({ response: { code: 'PROJECT_ARCHIVED' } });
      expect(await f.repository.findProjectById(f.project.id)).toMatchObject({
        status: 'ARCHIVED',
        name: f.project.name,
      });
      expect(
        await f.prisma.projectMember.count({
          where: { projectId: f.project.id, userId: f.invitee.id },
        }),
      ).toBe(0);
    } finally {
      await f.prisma.$disconnect();
    }
  },
);

it('rejects a stale status snapshot before it can skip the allowed transition', async () => {
  const f = await fixture();
  try {
    await f.repository.updateProjectStatus(f.project.id, f.owner.id, 'ACTIVE', 'PLANNING');
    f.afterAccess(() =>
      f.repository.updateProjectStatus(f.project.id, f.owner.id, 'COMPLETED', 'ACTIVE'),
    );
    await expect(
      f.service.updateStatus(f.owner.id, f.project.id, { status: 'PAUSED' }),
    ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect((await f.repository.findProjectById(f.project.id))?.status).toBe('COMPLETED');
  } finally {
    await f.prisma.$disconnect();
  }
});

it('requires the current project name for deletion after a concurrent rename', async () => {
  const f = await fixture();
  try {
    f.afterAccess(() =>
      f.service.updateProject(f.owner.id, f.project.id, { name: '更新后的名称' }),
    );
    await expect(
      f.service.deleteProject(f.owner.id, f.project.id, { confirmName: f.project.name }),
    ).rejects.toMatchObject({ response: { code: 'PROJECT_DELETE_CONFIRMATION_MISMATCH' } });
    expect((await f.repository.findProjectById(f.project.id))?.name).toBe('更新后的名称');
    expect(await f.prisma.projectDeletionAudit.count()).toBe(0);
  } finally {
    await f.prisma.$disconnect();
  }
});

it('validates a partial date update against the dates currently stored in the transaction', async () => {
  const f = await fixture();
  try {
    f.afterAccess(() =>
      f.service.updateProject(f.owner.id, f.project.id, { startDate: '2026-12-20' }),
    );
    await expect(
      f.service.updateProject(f.owner.id, f.project.id, { endDate: '2026-12-10' }),
    ).rejects.toMatchObject({ response: { code: 'PROJECT_DATE_RANGE_INVALID' } });
    expect(await f.repository.findProjectById(f.project.id)).toMatchObject({
      startDate: new Date('2026-12-20'),
      endDate: new Date('2026-12-31'),
    });
  } finally {
    await f.prisma.$disconnect();
  }
});

it('records the actual before and after fields when another edit completed after the access snapshot', async () => {
  const f = await fixture();
  try {
    f.afterAccess(() =>
      f.service.updateProject(f.owner.id, f.project.id, { name: '已更新的名称' }),
    );
    await f.service.updateProject(f.owner.id, f.project.id, { description: '本次更新' });
    const events = await f.prisma.activityLog.findMany({
      where: { projectId: f.project.id, action: 'PROJECT_UPDATED' },
    });
    const event = events.find(
      (entry) => JSON.parse(entry.afterValue ?? '{}').description === '本次更新',
    );
    expect(JSON.parse(event?.beforeValue ?? '{}')).toMatchObject({
      name: '已更新的名称',
      description: null,
    });
    expect(JSON.parse(event?.afterValue ?? '{}')).toMatchObject({
      name: '已更新的名称',
      description: '本次更新',
    });
  } finally {
    await f.prisma.$disconnect();
  }
});

it('still lets the platform administrator delete an archived project with current-name confirmation', async () => {
  const f = await fixture();
  try {
    await f.service.updateStatus(f.owner.id, f.project.id, { status: 'ACTIVE' });
    await f.service.updateStatus(f.owner.id, f.project.id, { status: 'COMPLETED' });
    await f.service.archiveProject(f.owner.id, f.project.id);
    await expect(
      f.service.deleteProject(f.admin.id, f.project.id, { confirmName: f.project.name }),
    ).resolves.toEqual({ deleted: true });
    expect(await f.repository.findProjectById(f.project.id)).toBeNull();
    expect(await f.prisma.projectDeletionAudit.findFirst()).toMatchObject({
      actorId: f.admin.id,
      projectName: f.project.name,
      projectStatus: 'ARCHIVED',
    });
  } finally {
    await f.prisma.$disconnect();
  }
});
