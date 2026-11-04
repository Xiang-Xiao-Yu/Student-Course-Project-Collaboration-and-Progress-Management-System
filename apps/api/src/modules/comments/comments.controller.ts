import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createComment(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    return this.commentsService.createComment(this.requireUserId(request), projectId, dto);
  }

  @Patch(':commentId')
  updateComment(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ): Promise<CommentResponse> {
    return this.commentsService.updateComment(
      this.requireUserId(request),
      projectId,
      commentId,
      dto,
    );
  }

  @Delete(':commentId')
  deleteComment(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
  ): Promise<{ deleted: true }> {
    return this.commentsService.deleteComment(this.requireUserId(request), projectId, commentId);
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
