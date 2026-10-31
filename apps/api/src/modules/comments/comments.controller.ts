import { Controller, Get, HttpStatus, Param, Query, Req, UseGuards } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { CommentsService } from './comments.service';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';
import type { CommentResponse } from './interfaces/comment-response';

@Controller('projects/:projectId/comments')
@UseGuards(AuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  listComments(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query() query: ListCommentsQueryDto,
  ): Promise<CommentResponse[]> {
    return this.commentsService.listComments(
      this.requireUserId(request),
      projectId,
      query.targetType,
      query.targetId,
    );
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const userId = request.authUser?.id;

    if (!userId) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_SESSION_EXPIRED',
        '登录会话已失效，请重新登录',
      );
    }

    return userId;
  }
}
