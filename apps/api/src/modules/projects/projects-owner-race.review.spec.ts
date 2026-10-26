import 'reflect-metadata';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsRepository } from './repositories/projects.repository';
import { ProjectAccessService } from './project-access.service';
import { ProjectMembersService } from './project-members.service';
import { AvatarStorageService } from '../users/avatar-storage.service';

it.each(['remove', 'demote'] as const)(
  'preserves the new owner when %s resumes after ownership transfer',
  async (operation) => {
    const directory = mkdtempSync(join(tmpdir(), 'scpc-owner-race-review-'));
    const prisma = new PrismaService({
      datasources: { db: { url: `file:${join(directory, 'review.db').replace(/\\/g, '/')}` } },
    });
    try {
      const migrations = resolve(__dirname, '../../../../../prisma/migrations');
      for (const entry of readdirSync(migrations, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))) {
        for (const sql of readFileSync(join(migrations, entry.name, 'migration.sql'), 'utf8')
          .split(';')
          .filter((sql) => sql.trim()))
          await prisma.$executeRawUnsafe(sql);
      }
      const owner = await prisma.user.create({
        data: { username: 'owner', nickname: 'owner', passwordHash: 'test' },
      });
      const target = await prisma.user.create({
        data: { username: 'target', nickname: 'target', passwordHash: 'test' },
      });
      const repository = new ProjectsRepository(prisma);
      const project = await repository.createProject(owner.id, { name: 'race' });
      await repository.addMember(project.id, owner.id, target.id, 'MEMBER');
      const originalFind = repository.findMemberByUserId.bind(repository);
      repository.findMemberByUserId = async (projectId, userId) => {
        const snapshot = await originalFind(projectId, userId);
        await repository.transferOwnership(projectId, owner.id, owner.id, target.id);
        return snapshot;
      };
      const service = new ProjectMembersService(
        new ProjectAccessService(repository),
        repository,
        new AvatarStorageService(),
      );
      const mutation =
        operation === 'remove'
          ? service.removeMember(owner.id, project.id, target.id)
          : service.updateMemberRole(owner.id, project.id, target.id, { role: 'OBSERVER' });
      await expect(mutation).rejects.toMatchObject({
        status: 403,
        response: { code: 'PROJECT_PERMISSION_DENIED' },
      });
      const finalProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      const owners = await prisma.projectMember.findMany({
        where: { projectId: project.id, role: 'OWNER' },
        select: { userId: true },
      });
      expect(owners).toEqual([{ userId: finalProject.ownerId }]);
      expect(
        await prisma.activityLog.count({
          where: {
            projectId: project.id,
            action: { in: ['PROJECT_MEMBER_REMOVED', 'PROJECT_MEMBER_ROLE_CHANGED'] },
          },
        }),
      ).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

it.each(
  (['remove', 'demote'] as const).flatMap((operation) =>
    (
      ['normal', 'admin', 'archived', 'stale-role', 'lost-permission', 'admin-new-owner'] as const
    ).map((scenario) => ({ operation, scenario })),
  ),
)('$operation checks current state for $scenario', async ({ operation, scenario }) => {
  const directory = mkdtempSync(join(tmpdir(), 'scpc-member-mutation-review-'));
  const prisma = new PrismaService({
    datasources: { db: { url: `file:${join(directory, 'review.db').replace(/\\/g, '/')}` } },
  });
  try {
    const migrations = resolve(__dirname, '../../../../../prisma/migrations');
    for (const entry of readdirSync(migrations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      for (const sql of readFileSync(join(migrations, entry.name, 'migration.sql'), 'utf8')
        .split(';')
        .filter((sql) => sql.trim()))
        await prisma.$executeRawUnsafe(sql);
    }
    const createUser = (username: string, isPlatformAdmin = false) =>
      prisma.user.create({
        data: { username, nickname: username, passwordHash: 'test', isPlatformAdmin },
      });
    const owner = await createUser('owner');
    const target = await createUser('target');
    const other = await createUser('other');
    const admin = await createUser('admin', true);
    const repository = new ProjectsRepository(prisma);
    const project = await repository.createProject(owner.id, { name: 'race' });
    await repository.addMember(project.id, owner.id, target.id, 'MEMBER');
    await repository.addMember(project.id, owner.id, other.id, 'MEMBER');
    const actor = scenario === 'admin' || scenario === 'admin-new-owner' ? admin : owner;
    const originalFind = repository.findMemberByUserId.bind(repository);
    repository.findMemberByUserId = async (projectId, userId) => {
      const snapshot = await originalFind(projectId, userId);
      if (scenario === 'archived') {
        await prisma.project.update({ where: { id: project.id }, data: { status: 'ARCHIVED' } });
      } else if (scenario === 'stale-role') {
        await repository.updateMemberRole(project.id, owner.id, target.id, 'OBSERVER', 'MEMBER');
      } else if (scenario === 'lost-permission' || scenario === 'admin-new-owner') {
        await repository.transferOwnership(
          project.id,
          owner.id,
          owner.id,
          scenario === 'lost-permission' ? other.id : target.id,
        );
      }
      return snapshot;
    };
    const service = new ProjectMembersService(
      new ProjectAccessService(repository),
      repository,
      new AvatarStorageService(),
    );
    const mutation =
      operation === 'remove'
        ? service.removeMember(actor.id, project.id, target.id)
        : service.updateMemberRole(actor.id, project.id, target.id, { role: 'OBSERVER' });
    if (scenario === 'normal' || scenario === 'admin') {
      await expect(mutation).resolves.toBeDefined();
      const member = await originalFind(project.id, target.id);
      if (operation === 'remove') expect(member).toBeNull();
      else expect(member?.role).toBe('OBSERVER');
      const event = await prisma.activityLog.findFirstOrThrow({
        where: {
          projectId: project.id,
          action: operation === 'remove' ? 'PROJECT_MEMBER_REMOVED' : 'PROJECT_MEMBER_ROLE_CHANGED',
        },
      });
      expect(event.actorId).toBe(actor.id);
      expect(JSON.parse(event.beforeValue ?? '{}')).toEqual({ role: 'MEMBER', userId: target.id });
    } else {
      const code =
        scenario === 'archived'
          ? 'PROJECT_ARCHIVED'
          : scenario === 'stale-role'
            ? 'PROJECT_OWNER_TRANSFER_CONFLICT'
            : scenario === 'lost-permission'
              ? 'PROJECT_PERMISSION_DENIED'
              : operation === 'remove'
                ? 'PROJECT_OWNER_CANNOT_BE_REMOVED'
                : 'PROJECT_OWNER_TRANSFER_REQUIRED';
      await expect(mutation).rejects.toMatchObject({ response: { code } });
      expect((await originalFind(project.id, target.id))?.role).toBe(
        scenario === 'admin-new-owner'
          ? 'OWNER'
          : scenario === 'stale-role'
            ? 'OBSERVER'
            : 'MEMBER',
      );
      expect(
        await prisma.activityLog.count({
          where: {
            projectId: project.id,
            action: { in: ['PROJECT_MEMBER_REMOVED', 'PROJECT_MEMBER_ROLE_CHANGED'] },
          },
        }),
      ).toBe(scenario === 'stale-role' ? 1 : 0);
    }
    const finalProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(
      await prisma.projectMember.findMany({
        where: { projectId: project.id, role: 'OWNER' },
        select: { userId: true },
      }),
    ).toEqual([{ userId: finalProject.ownerId }]);
  } finally {
    await prisma.$disconnect();
  }
});
