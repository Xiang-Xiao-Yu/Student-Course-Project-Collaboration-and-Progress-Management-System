import assert from 'node:assert/strict';
import { relative, resolve, sep } from 'node:path';

import { PrismaClient } from '@prisma/client';

// Only the gate runner's newly created database may receive fixture data.
export async function prepareComments({ projectId, taskId, authorId, content }) {
  const dataRoot = process.env.P3_GATE_DATA_ROOT;
  const databaseUrl = process.env.DATABASE_URL;
  assert(dataRoot && databaseUrl?.startsWith('file:'), 'Isolated gate database is required');
  const path = relative(resolve(dataRoot), resolve(databaseUrl.slice(5)));
  assert(
    path && path !== '..' && !path.startsWith(`..${sep}`),
    'Database must stay in gate data root',
  );
  assert(path === 'p3.sqlite', 'Only the gate fixture database is allowed');
  const prisma = new PrismaClient();
  try {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    assert.equal(task.projectId, projectId);
    const member = await prisma.projectMember.findFirst({ where: { projectId, userId: authorId } });
    assert(member, 'Comment author must belong to the fixture project');
    const comment = await prisma.comment.create({
      data: { projectId, taskId, authorId, content, targetType: 'TASK' },
      include: { author: { select: { nickname: true } } },
    });
    return { id: comment.id, content: comment.content, authorNickname: comment.author.nickname };
  } finally {
    await prisma.$disconnect();
  }
}
