import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthGuard } from '../auth/auth.guard';
import { ConvertMeetingActionDto } from './dto/convert-meeting-action.dto';
import { CreateMeetingActionDto } from './dto/create-meeting-action.dto';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingActionDto } from './dto/update-meeting-action.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import type {
  MeetingActionConversionResponse,
  MeetingActionResponse,
  MeetingDetailResponse,
  MeetingSummaryResponse,
} from './interfaces/meeting-response';
import { MeetingsService } from './meetings.service';

@Controller('projects/:projectId/meetings')
@UseGuards(AuthGuard)
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get()
  listMeetings(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ): Promise<MeetingSummaryResponse[]> {
    return this.meetingsService.listMeetings(this.requireUserId(request), projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createMeeting(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateMeetingDto,
  ): Promise<MeetingDetailResponse> {
    return this.meetingsService.createMeeting(this.requireUserId(request), projectId, dto);
  }

  @Get(':meetingId')
  getMeeting(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
  ): Promise<MeetingDetailResponse> {
    return this.meetingsService.getMeeting(this.requireUserId(request), projectId, meetingId);
  }

  @Patch(':meetingId')
  updateMeeting(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Body() dto: UpdateMeetingDto,
  ): Promise<MeetingDetailResponse> {
    return this.meetingsService.updateMeeting(
      this.requireUserId(request),
      projectId,
      meetingId,
      dto,
    );
  }

  @Post(':meetingId/actions')
  @HttpCode(HttpStatus.CREATED)
  createAction(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Body() dto: CreateMeetingActionDto,
  ): Promise<MeetingActionResponse> {
    return this.meetingsService.createAction(
      this.requireUserId(request),
      projectId,
      meetingId,
      dto,
    );
  }

  @Patch(':meetingId/actions/:actionId')
  updateAction(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateMeetingActionDto,
  ): Promise<MeetingActionResponse> {
    return this.meetingsService.updateAction(
      this.requireUserId(request),
      projectId,
      meetingId,
      actionId,
      dto,
    );
  }

  @Post(':meetingId/actions/:actionId/convert')
  @HttpCode(HttpStatus.OK)
  convertAction(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Param('actionId') actionId: string,
    @Body() dto: ConvertMeetingActionDto,
  ): Promise<MeetingActionConversionResponse> {
    return this.meetingsService.convertAction(
      this.requireUserId(request),
      projectId,
      meetingId,
      actionId,
      dto,
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
