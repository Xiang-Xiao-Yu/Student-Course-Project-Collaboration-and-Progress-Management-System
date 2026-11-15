# 学生课程项目协作与进度管理系统 API 接口说明书

| 项目     | 内容                                                                      |
| -------- | ------------------------------------------------------------------------- |
| 文档版本 | 1.1                                                                       |
| 编写日期 | 2026 年 11 月 14 日                                                       |
| 需求依据 | 《软件需求规格说明书》0.1.4                                               |
| 接口基线 | main `0932ae2` 加2026-11-14技术收尾修复；精确产品散列见最终交付清单       |
| 说明范围 | 61 个控制器接口、33 个请求 DTO、44 个返回接口类型（含公共类型与健康检查） |

## 本版更新

当前控制器接口61个、请求DTO33个、返回接口声明44个。新增用户管理两接口；PATCH验收日期省略保留、null清空。

本目录由原2026-11-12草稿修订，原D盘草稿保留。历史P0～P6记录仍绑定各自版本，不冒充本轮执行结果。

## 1. 通用约定

默认服务基地址为 `http://127.0.0.1:3000/api/v1`。普通请求体采用 JSON，头像采用 multipart 文件上传，CSV 下载直接返回文件内容。以下接口清单以固定版本控制器声明为依据，不表示执行了新一轮接口测试。

- 除健康检查、注册、登录外，均需有效的 Bearer 访问令牌。
- 路径中的项目和业务对象标识均由服务端返回，不能跨项目混用。
- 时间响应通常使用 ISO 8601 字符串；任务日期筛选使用 `YYYY-MM-DD`，按 `Asia/Shanghai` 业务日解释。
- 服务端启用 DTO 白名单和额外字段拒绝；类型、长度、枚举、日期及对象归属由 DTO 与 Service 共同校验。
- 本文只描述基线已有接口，不提供 GitHub 双向同步、通用附件或备份恢复接口。

## 2. 身份、权限与响应

### 2.1 身份与项目权限

| 操作范围                                           | 权限要求                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| 本人资料、本人任务、头像和密码                     | 有效账号，仅操作当前用户                                           |
| 项目读取、统计及过程资料查看                       | 管理员或具有对应读取权限的当前项目成员；观察者只读                 |
| 项目管理、成员角色、迭代安排、任务审核、验收和导出 | 按服务端管理权限检查，通常由负责人或管理员执行                     |
| 需求、任务、评论和会议写入                         | 按成员角色、目标对象和具体操作检查，普通成员不因此获得全部管理权限 |
| 评论修改与删除                                     | 检查本人评论权限；不能按对象可见性推断可修改他人评论               |

平台管理员使用独立标识，项目角色为 OWNER、MEMBER、OBSERVER。普通成员不能删除项目、移除成员、修改项目角色或代替负责人审核完成任务；导出由负责人或管理员执行。非项目成员访问时返回“不存在或无权访问”。项目暂停禁止新增，归档禁止业务写入。

退出登录和修改密码会轮换服务端 `tokenVersion`，旧版本令牌失效。接口调用方不能仅删除本地令牌就认定退出已在服务端完成。

### 2.2 普通响应

成功结构为 `success: true`、`data` 和 `meta`。`meta` 包含请求标识及时间；失败结构为 `success: false`、`error.code`、`error.message`、`error.details` 和 `meta`。第 3 节的返回列指 `data` 内容，`Promise` 是服务端 TypeScript 声明，不是 JSON 字段。

| HTTP 状态 | 含义                           |
| --------- | ------------------------------ |
| 200 / 201 | 操作成功，实际状态由路由定义   |
| 400       | 请求格式或参数错误             |
| 401       | 未认证或会话失效               |
| 403       | 权限不足或账号被禁用           |
| 404       | 对象不存在或项目不可访问       |
| 409       | 数据、角色、状态或并发操作冲突 |
| 413       | 上传或请求内容过大             |
| 422       | 业务校验失败                   |
| 500       | 服务端内部错误，返回安全提示   |

业务分支应按稳定错误码判断，不按中文消息匹配。未识别内部异常不直接回传堆栈、SQL 或绝对路径。

## 3. 接口清单

表中 Body 为 JSON 请求体，Query 为查询参数；字段详见第 4 节。所有路径已经包含 `/api/v1`，不要再重复拼接前缀。

### 3.1 健康检查

| 方法 | 完整路径         | 输入       | 返回 data / 文件 | 认证 |
| ---- | ---------------- | ---------- | ---------------- | ---- |
| GET  | `/api/v1/health` | 无请求 DTO | `HealthStatus`   | 公开 |

### 3.2 认证

| 方法 | 完整路径                | 输入              | 返回 data / 文件   | 认证                   |
| ---- | ----------------------- | ----------------- | ------------------ | ---------------------- |
| POST | `/api/v1/auth/register` | Body: RegisterDto | `RegisterResponse` | 公开                   |
| POST | `/api/v1/auth/login`    | Body: LoginDto    | `LoginResponse`    | 公开                   |
| POST | `/api/v1/auth/logout`   | 无请求 DTO        | `LogoutResponse`   | 需登录，并检查业务权限 |

### 3.3 个人资料

| 方法  | 完整路径                    | 输入                      | 返回 data / 文件         | 认证                   |
| ----- | --------------------------- | ------------------------- | ------------------------ | ---------------------- |
| GET   | `/api/v1/users/me`          | 无请求 DTO                | `UserProfileResponse`    | 需登录，并检查业务权限 |
| GET   | `/api/v1/users/me/tasks`    | 无请求 DTO                | `UserTaskItem[]`         | 需登录，并检查业务权限 |
| PATCH | `/api/v1/users/me`          | Body: UpdateProfileDto    | `UserProfileResponse`    | 需登录，并检查业务权限 |
| POST  | `/api/v1/users/me/avatar`   | multipart 文件字段 avatar | `UserProfileResponse`    | 需登录，并检查业务权限 |
| PATCH | `/api/v1/users/me/password` | Body: ChangePasswordDto   | `ChangePasswordResponse` | 需登录，并检查业务权限 |

### 3.4 项目

| 方法   | 完整路径                              | 输入                         | 返回 data / 文件    | 认证                   |
| ------ | ------------------------------------- | ---------------------------- | ------------------- | ---------------------- |
| GET    | `/api/v1/projects`                    | 无请求 DTO                   | `ProjectResponse[]` | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects`                    | Body: CreateProjectDto       | `ProjectResponse`   | 需登录，并检查业务权限 |
| GET    | `/api/v1/projects/:projectId`         | 无请求 DTO                   | `ProjectResponse`   | 需登录，并检查业务权限 |
| PATCH  | `/api/v1/projects/:projectId`         | Body: UpdateProjectDto       | `ProjectResponse`   | 需登录，并检查业务权限 |
| PATCH  | `/api/v1/projects/:projectId/status`  | Body: UpdateProjectStatusDto | `ProjectResponse`   | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects/:projectId/archive` | 无请求 DTO                   | `ProjectResponse`   | 需登录，并检查业务权限 |
| DELETE | `/api/v1/projects/:projectId`         | Body: DeleteProjectDto       | `{ deleted: true }` | 需登录，并检查业务权限 |

### 3.5 成员

| 方法   | 完整路径                                      | 输入                             | 返回 data / 文件          | 认证                   |
| ------ | --------------------------------------------- | -------------------------------- | ------------------------- | ---------------------- |
| GET    | `/api/v1/projects/:projectId/members`         | 无请求 DTO                       | `ProjectMemberResponse[]` | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects/:projectId/members`         | Body: InviteProjectMemberDto     | `ProjectMemberResponse`   | 需登录，并检查业务权限 |
| PATCH  | `/api/v1/projects/:projectId/members/:userId` | Body: UpdateProjectMemberRoleDto | `ProjectMemberResponse`   | 需登录，并检查业务权限 |
| DELETE | `/api/v1/projects/:projectId/members/:userId` | 无请求 DTO                       | `{ removed: true }`       | 需登录，并检查业务权限 |

### 3.6 活动记录

| 方法 | 完整路径                               | 输入                        | 返回 data / 文件     | 认证                   |
| ---- | -------------------------------------- | --------------------------- | -------------------- | ---------------------- |
| GET  | `/api/v1/projects/:projectId/activity` | Query: ListActivityQueryDto | `ActivityResponse[]` | 需登录，并检查业务权限 |

### 3.7 需求

| 方法   | 完整路径                                                  | 输入                            | 返回 data / 文件        | 认证                   |
| ------ | --------------------------------------------------------- | ------------------------------- | ----------------------- | ---------------------- |
| GET    | `/api/v1/projects/:projectId/requirements`                | Query: ListRequirementsQueryDto | `RequirementResponse[]` | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects/:projectId/requirements`                | Body: CreateRequirementDto      | `RequirementResponse`   | 需登录，并检查业务权限 |
| GET    | `/api/v1/projects/:projectId/requirements/:requirementId` | 无请求 DTO                      | `RequirementResponse`   | 需登录，并检查业务权限 |
| PATCH  | `/api/v1/projects/:projectId/requirements/:requirementId` | Body: UpdateRequirementDto      | `RequirementResponse`   | 需登录，并检查业务权限 |
| DELETE | `/api/v1/projects/:projectId/requirements/:requirementId` | 无请求 DTO                      | `{ deleted: true }`     | 需登录，并检查业务权限 |

### 3.8 任务

| 方法   | 完整路径                                           | 输入                      | 返回 data / 文件      | 认证                   |
| ------ | -------------------------------------------------- | ------------------------- | --------------------- | ---------------------- |
| GET    | `/api/v1/projects/:projectId/tasks`                | Query: ListTasksQueryDto  | `TaskResponse[]`      | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects/:projectId/tasks`                | Body: CreateTaskDto       | `TaskResponse`        | 需登录，并检查业务权限 |
| GET    | `/api/v1/projects/:projectId/tasks/export`         | Query: ListTasksQueryDto  | `CSV 文件（非 JSON）` | 需登录，并检查业务权限 |
| GET    | `/api/v1/projects/:projectId/tasks/:taskId`        | 无请求 DTO                | `TaskResponse`        | 需登录，并检查业务权限 |
| PATCH  | `/api/v1/projects/:projectId/tasks/:taskId`        | Body: UpdateTaskDto       | `TaskResponse`        | 需登录，并检查业务权限 |
| PATCH  | `/api/v1/projects/:projectId/tasks/:taskId/status` | Body: UpdateTaskStatusDto | `TaskResponse`        | 需登录，并检查业务权限 |
| DELETE | `/api/v1/projects/:projectId/tasks/:taskId`        | 无请求 DTO                | `{ deleted: true }`   | 需登录，并检查业务权限 |

### 3.9 迭代

| 方法   | 完整路径                                                            | 输入                      | 返回 data / 文件          | 认证                   |
| ------ | ------------------------------------------------------------------- | ------------------------- | ------------------------- | ---------------------- |
| GET    | `/api/v1/projects/:projectId/iterations`                            | 无请求 DTO                | `IterationResponse[]`     | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects/:projectId/iterations`                            | Body: CreateIterationDto  | `IterationDetailResponse` | 需登录，并检查业务权限 |
| GET    | `/api/v1/projects/:projectId/iterations/:iterationId`               | 无请求 DTO                | `IterationDetailResponse` | 需登录，并检查业务权限 |
| PATCH  | `/api/v1/projects/:projectId/iterations/:iterationId`               | Body: UpdateIterationDto  | `IterationDetailResponse` | 需登录，并检查业务权限 |
| DELETE | `/api/v1/projects/:projectId/iterations/:iterationId`               | 无请求 DTO                | `{ deleted: true }`       | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects/:projectId/iterations/:iterationId/tasks`         | Body: AddIterationTaskDto | `IterationDetailResponse` | 需登录，并检查业务权限 |
| DELETE | `/api/v1/projects/:projectId/iterations/:iterationId/tasks/:taskId` | 无请求 DTO                | `IterationDetailResponse` | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects/:projectId/iterations/:iterationId/close`         | Body: CloseIterationDto   | `IterationDetailResponse` | 需登录，并检查业务权限 |
| GET    | `/api/v1/projects/:projectId/iterations/:iterationId/stats`         | 无请求 DTO                | `IterationStatsResponse`  | 需登录，并检查业务权限 |

### 3.10 评论

| 方法   | 完整路径                                          | 输入                        | 返回 data / 文件    | 认证                   |
| ------ | ------------------------------------------------- | --------------------------- | ------------------- | ---------------------- |
| GET    | `/api/v1/projects/:projectId/comments`            | Query: ListCommentsQueryDto | `CommentResponse[]` | 需登录，并检查业务权限 |
| POST   | `/api/v1/projects/:projectId/comments`            | Body: CreateCommentDto      | `CommentResponse`   | 需登录，并检查业务权限 |
| PATCH  | `/api/v1/projects/:projectId/comments/:commentId` | Body: UpdateCommentDto      | `CommentResponse`   | 需登录，并检查业务权限 |
| DELETE | `/api/v1/projects/:projectId/comments/:commentId` | 无请求 DTO                  | `{ deleted: true }` | 需登录，并检查业务权限 |

### 3.11 会议与行动项

| 方法  | 完整路径                                                                    | 输入                          | 返回 data / 文件                  | 认证                   |
| ----- | --------------------------------------------------------------------------- | ----------------------------- | --------------------------------- | ---------------------- |
| GET   | `/api/v1/projects/:projectId/meetings`                                      | 无请求 DTO                    | `MeetingSummaryResponse[]`        | 需登录，并检查业务权限 |
| POST  | `/api/v1/projects/:projectId/meetings`                                      | Body: CreateMeetingDto        | `MeetingDetailResponse`           | 需登录，并检查业务权限 |
| GET   | `/api/v1/projects/:projectId/meetings/:meetingId`                           | 无请求 DTO                    | `MeetingDetailResponse`           | 需登录，并检查业务权限 |
| PATCH | `/api/v1/projects/:projectId/meetings/:meetingId`                           | Body: UpdateMeetingDto        | `MeetingDetailResponse`           | 需登录，并检查业务权限 |
| POST  | `/api/v1/projects/:projectId/meetings/:meetingId/actions`                   | Body: CreateMeetingActionDto  | `MeetingActionResponse`           | 需登录，并检查业务权限 |
| PATCH | `/api/v1/projects/:projectId/meetings/:meetingId/actions/:actionId`         | Body: UpdateMeetingActionDto  | `MeetingActionResponse`           | 需登录，并检查业务权限 |
| POST  | `/api/v1/projects/:projectId/meetings/:meetingId/actions/:actionId/convert` | Body: ConvertMeetingActionDto | `MeetingActionConversionResponse` | 需登录，并检查业务权限 |

### 3.12 阶段验收

| 方法  | 完整路径                                                | 输入                      | 返回 data / 文件              | 认证                   |
| ----- | ------------------------------------------------------- | ------------------------- | ----------------------------- | ---------------------- |
| GET   | `/api/v1/projects/:projectId/acceptances`               | 无请求 DTO                | `AcceptanceSummaryResponse[]` | 需登录，并检查业务权限 |
| POST  | `/api/v1/projects/:projectId/acceptances`               | Body: CreateAcceptanceDto | `AcceptanceDetailResponse`    | 需登录，并检查业务权限 |
| GET   | `/api/v1/projects/:projectId/acceptances/:acceptanceId` | 无请求 DTO                | `AcceptanceDetailResponse`    | 需登录，并检查业务权限 |
| PATCH | `/api/v1/projects/:projectId/acceptances/:acceptanceId` | Body: UpdateAcceptanceDto | `AcceptanceDetailResponse`    | 需登录，并检查业务权限 |

### 3.13 仪表盘与进度报告

| 方法 | 完整路径                                       | 输入       | 返回 data / 文件      | 认证                   |
| ---- | ---------------------------------------------- | ---------- | --------------------- | ---------------------- |
| GET  | `/api/v1/projects/:projectId/dashboard`        | 无请求 DTO | `DashboardResponse`   | 需登录，并检查业务权限 |
| GET  | `/api/v1/projects/:projectId/reports/progress` | 无请求 DTO | `CSV 文件（非 JSON）` | 需登录，并检查业务权限 |

## 4. 请求字段与校验

下表列出 DTO 中的字段及主要校验。可省略不等于可以清空：使用 `value !== undefined` 条件校验的字段传入 `null` 时仍会继续校验；`IsOptional` 会跳过 null，但具体业务处理仍由 Service 决定。字符串裁剪、数组去重及其他转换按对应 DTO 和 Service 实施。

`expectedIterationId` 明确允许 null，用于说明任务原本未关联迭代。活动查询 `limit` 默认 50、范围 1～100。大部分业务列表返回数组，当前接口没有统一的页码分页协议；活动记录使用 cursor 查询。

### 4.1 CreateAcceptanceDto

| 字段             | 类型               | 必填性（DTO） | 约束                                                                        |
| ---------------- | ------------------ | ------------- | --------------------------------------------------------------------------- |
| `stageName`      | `string`           | 必填          | 字符串；长度 1, 100                                                         |
| `goal`           | `string`           | 可省略        | 字符串；最大长度 5000                                                       |
| `acceptanceDate` | `string`           | 可省略        | ISO 日期字符串，严格日期校验                                                |
| `standards`      | `string`           | 必填          | 字符串；长度 1, 5000                                                        |
| `participantIds` | `string[]`         | 可省略        | 数组；数组最多 100 项；字符串（{ each: true }）；长度 1, 64, { each: true } |
| `result`         | `AcceptanceResult` | 可省略        | 限定值 ACCEPTANCE_RESULTS                                                   |
| `failureReason`  | `string`           | 可省略        | 字符串；最大长度 5000                                                       |

### 4.2 UpdateAcceptanceDto

| 字段             | 类型               | 必填性（DTO） | 约束                                                                        |
| ---------------- | ------------------ | ------------- | --------------------------------------------------------------------------- |
| `stageName`      | `string`           | 可省略        | 字符串；长度 1, 100                                                         |
| `goal`           | `string`           | 可省略        | 字符串；最大长度 5000                                                       |
| `acceptanceDate` | `string` 或 `null` | 可省略        | 省略保留；null清空；字符串进行严格日期校验                                  |
| `standards`      | `string`           | 可省略        | 字符串；长度 1, 5000                                                        |
| `participantIds` | `string[]`         | 可省略        | 数组；数组最多 100 项；字符串（{ each: true }）；长度 1, 64, { each: true } |
| `result`         | `AcceptanceResult` | 可省略        | 限定值 ACCEPTANCE_RESULTS                                                   |
| `failureReason`  | `string`           | 可省略        | 字符串；最大长度 5000                                                       |

### 4.3 ChangePasswordDto

| 字段              | 类型     | 必填性（DTO） | 约束                             |
| ----------------- | -------- | ------------- | -------------------------------- |
| `currentPassword` | `string` | 必填          | 字符串；长度 1, 128              |
| `newPassword`     | `string` | 必填          | 字符串；最小长度 8；最大长度 128 |

### 4.4 LoginDto

| 字段       | 类型     | 必填性（DTO） | 约束                |
| ---------- | -------- | ------------- | ------------------- |
| `username` | `string` | 必填          | 字符串；长度 1, 64  |
| `password` | `string` | 必填          | 字符串；长度 1, 128 |

### 4.5 RegisterDto

| 字段       | 类型     | 必填性（DTO） | 约束                             |
| ---------- | -------- | ------------- | -------------------------------- |
| `username` | `string` | 必填          | 字符串；长度 1, 64               |
| `password` | `string` | 必填          | 字符串；最小长度 8；最大长度 128 |
| `nickname` | `string` | 必填          | 字符串；长度 1, 50               |

### 4.6 CreateCommentDto

| 字段         | 类型                | 必填性（DTO） | 约束                        |
| ------------ | ------------------- | ------------- | --------------------------- |
| `targetType` | `CommentTargetType` | 必填          | 限定值 COMMENT_TARGET_TYPES |
| `targetId`   | `string`            | 必填          | 字符串；长度 1, 64          |
| `content`    | `string`            | 必填          | 字符串；长度 1, 2000        |

### 4.7 ListCommentsQueryDto

| 字段         | 类型                | 必填性（DTO） | 约束                        |
| ------------ | ------------------- | ------------- | --------------------------- |
| `targetType` | `CommentTargetType` | 必填          | 限定值 COMMENT_TARGET_TYPES |
| `targetId`   | `string`            | 必填          | 字符串；长度 1, 64          |

### 4.8 UpdateCommentDto

| 字段      | 类型     | 必填性（DTO） | 约束                 |
| --------- | -------- | ------------- | -------------------- |
| `content` | `string` | 必填          | 字符串；长度 1, 2000 |

### 4.9 AddIterationTaskDto

| 字段                  | 类型             | 必填性（DTO） | 约束               |
| --------------------- | ---------------- | ------------- | ------------------ |
| `taskId`              | `string`         | 必填          | 字符串；长度 1, 64 |
| `expectedIterationId` | `string \| null` | 可省略        | 字符串；长度 1, 64 |

### 4.10 CloseIterationDto

| 字段              | 类型     | 必填性（DTO） | 约束               |
| ----------------- | -------- | ------------- | ------------------ |
| `nextIterationId` | `string` | 可省略        | 字符串；长度 1, 64 |

### 4.11 CreateIterationDto

| 字段        | 类型     | 必填性（DTO） | 约束                         |
| ----------- | -------- | ------------- | ---------------------------- |
| `name`      | `string` | 必填          | 字符串；长度 1, 100          |
| `goal`      | `string` | 可省略        | 字符串；最大长度 1000        |
| `startDate` | `string` | 必填          | ISO 日期字符串，严格日期校验 |
| `endDate`   | `string` | 必填          | ISO 日期字符串，严格日期校验 |

### 4.12 UpdateIterationDto

| 字段        | 类型              | 必填性（DTO） | 约束                         |
| ----------- | ----------------- | ------------- | ---------------------------- |
| `name`      | `string`          | 可省略        | 字符串；长度 1, 100          |
| `goal`      | `string`          | 可省略        | 字符串；最大长度 1000        |
| `startDate` | `string`          | 可省略        | ISO 日期字符串，严格日期校验 |
| `endDate`   | `string`          | 可省略        | ISO 日期字符串，严格日期校验 |
| `status`    | `IterationStatus` | 可省略        | 限定值 ITERATION_STATUSES    |

### 4.13 ConvertMeetingActionDto

| 字段            | 类型           | 必填性（DTO） | 约束                   |
| --------------- | -------------- | ------------- | ---------------------- |
| `description`   | `string`       | 可省略        | 字符串；最大长度 5000  |
| `priority`      | `TaskPriority` | 可省略        | 限定值 TASK_PRIORITIES |
| `requirementId` | `string`       | 可省略        | 字符串；长度 1, 64     |

### 4.14 CreateMeetingActionDto

| 字段         | 类型     | 必填性（DTO） | 约束                         |
| ------------ | -------- | ------------- | ---------------------------- |
| `title`      | `string` | 必填          | 字符串；长度 1, 100          |
| `assigneeId` | `string` | 可省略        | 字符串；长度 1, 64           |
| `dueDate`    | `string` | 可省略        | ISO 日期字符串，严格日期校验 |

### 4.15 CreateMeetingDto

| 字段             | 类型       | 必填性（DTO） | 约束                                                                        |
| ---------------- | ---------- | ------------- | --------------------------------------------------------------------------- |
| `title`          | `string`   | 必填          | 字符串；长度 1, 120                                                         |
| `scheduledAt`    | `string`   | 必填          | ISO 日期字符串，严格日期校验                                                |
| `agenda`         | `string`   | 可省略        | 字符串；最大长度 10000                                                      |
| `minutes`        | `string`   | 可省略        | 字符串；最大长度 10000                                                      |
| `decisions`      | `string`   | 可省略        | 字符串；最大长度 10000                                                      |
| `participantIds` | `string[]` | 可省略        | 数组；数组最多 100 项；字符串（{ each: true }）；长度 1, 64, { each: true } |

### 4.16 UpdateMeetingActionDto

| 字段         | 类型                  | 必填性（DTO） | 约束                           |
| ------------ | --------------------- | ------------- | ------------------------------ |
| `title`      | `string`              | 可省略        | 字符串；长度 1, 100            |
| `assigneeId` | `string`              | 可省略        | 字符串；长度 1, 64             |
| `dueDate`    | `string`              | 可省略        | ISO 日期字符串，严格日期校验   |
| `status`     | `MeetingActionStatus` | 可省略        | 限定值 MEETING_ACTION_STATUSES |

### 4.17 UpdateMeetingDto

| 字段             | 类型       | 必填性（DTO） | 约束                                                                        |
| ---------------- | ---------- | ------------- | --------------------------------------------------------------------------- |
| `title`          | `string`   | 可省略        | 字符串；长度 1, 120                                                         |
| `scheduledAt`    | `string`   | 可省略        | ISO 日期字符串，严格日期校验                                                |
| `agenda`         | `string`   | 可省略        | 字符串；最大长度 10000                                                      |
| `minutes`        | `string`   | 可省略        | 字符串；最大长度 10000                                                      |
| `decisions`      | `string`   | 可省略        | 字符串；最大长度 10000                                                      |
| `participantIds` | `string[]` | 可省略        | 数组；数组最多 100 项；字符串（{ each: true }）；长度 1, 64, { each: true } |

### 4.18 CreateProjectDto

| 字段          | 类型     | 必填性（DTO） | 约束                  |
| ------------- | -------- | ------------- | --------------------- |
| `name`        | `string` | 必填          | 字符串；长度 1, 100   |
| `description` | `string` | 可省略        | 字符串；最大长度 1000 |
| `startDate`   | `string` | 可省略        | ISO 日期字符串        |
| `endDate`     | `string` | 可省略        | ISO 日期字符串        |

### 4.19 DeleteProjectDto

| 字段          | 类型     | 必填性（DTO） | 约束                |
| ------------- | -------- | ------------- | ------------------- |
| `confirmName` | `string` | 必填          | 字符串；长度 1, 100 |

### 4.20 InviteProjectMemberDto

| 字段       | 类型                     | 必填性（DTO） | 约束                          |
| ---------- | ------------------------ | ------------- | ----------------------------- |
| `username` | `string`                 | 必填          | 字符串；长度 1, 64            |
| `role`     | `'MEMBER' \| 'OBSERVER'` | 必填          | 限定值 ['MEMBER', 'OBSERVER'] |

### 4.21 ListActivityQueryDto

| 字段         | 类型     | 必填性（DTO） | 约束                                            |
| ------------ | -------- | ------------- | ----------------------------------------------- |
| `cursor`     | `string` | 可省略        | 字符串；长度 1, 64                              |
| `targetType` | `string` | 可省略        | 字符串；长度 1, 32                              |
| `targetId`   | `string` | 可省略        | 字符串；长度 1, 64                              |
| `limit`      | `number` | 可省略        | 转换为数字；整数；最小值 1；最大值 100；默认 50 |

### 4.22 UpdateProjectMemberRoleDto

| 字段   | 类型          | 必填性（DTO） | 约束                 |
| ------ | ------------- | ------------- | -------------------- |
| `role` | `ProjectRole` | 必填          | 限定值 PROJECT_ROLES |

### 4.23 UpdateProjectStatusDto

| 字段     | 类型            | 必填性（DTO） | 约束                    |
| -------- | --------------- | ------------- | ----------------------- |
| `status` | `ProjectStatus` | 必填          | 限定值 PROJECT_STATUSES |

### 4.24 UpdateProjectDto

| 字段          | 类型     | 必填性（DTO） | 约束                  |
| ------------- | -------- | ------------- | --------------------- |
| `name`        | `string` | 可省略        | 字符串；长度 1, 100   |
| `description` | `string` | 可省略        | 字符串；最大长度 1000 |
| `startDate`   | `string` | 可省略        | ISO 日期字符串        |
| `endDate`     | `string` | 可省略        | ISO 日期字符串        |

### 4.25 CreateRequirementDto

| 字段                 | 类型                  | 必填性（DTO） | 约束                          |
| -------------------- | --------------------- | ------------- | ----------------------------- |
| `title`              | `string`              | 必填          | 字符串；长度 1, 100           |
| `description`        | `string`              | 可省略        | 字符串；最大长度 5000         |
| `priority`           | `RequirementPriority` | 必填          | 限定值 REQUIREMENT_PRIORITIES |
| `acceptanceCriteria` | `string`              | 必填          | 字符串；长度 1, 5000          |

### 4.26 ListRequirementsQueryDto

| 字段     | 类型     | 必填性（DTO） | 约束                |
| -------- | -------- | ------------- | ------------------- |
| `search` | `string` | 可省略        | 字符串；长度 1, 100 |

### 4.27 UpdateRequirementDto

| 字段                 | 类型                  | 必填性（DTO） | 约束                          |
| -------------------- | --------------------- | ------------- | ----------------------------- |
| `title`              | `string`              | 可省略        | 字符串；长度 1, 100           |
| `description`        | `string`              | 可省略        | 字符串；最大长度 5000         |
| `priority`           | `RequirementPriority` | 可省略        | 限定值 REQUIREMENT_PRIORITIES |
| `acceptanceCriteria` | `string`              | 可省略        | 字符串；长度 1, 5000          |
| `status`             | `RequirementStatus`   | 可省略        | 限定值 REQUIREMENT_STATUSES   |

### 4.28 CreateTaskDto

| 字段             | 类型           | 必填性（DTO） | 约束                                                                       |
| ---------------- | -------------- | ------------- | -------------------------------------------------------------------------- |
| `title`          | `string`       | 必填          | 字符串；长度 1, 100                                                        |
| `description`    | `string`       | 可省略        | 字符串；最大长度 5000                                                      |
| `assigneeId`     | `string`       | 可省略        | 字符串；长度 1, 100                                                        |
| `requirementId`  | `string`       | 可省略        | 字符串；长度 1, 100                                                        |
| `acceptanceId`   | `string`       | 可省略        | 字符串；长度 1, 100                                                        |
| `priority`       | `TaskPriority` | 必填          | 限定值 TASK_PRIORITIES                                                     |
| `dueDate`        | `string`       | 可省略        | ISO 日期字符串，严格日期校验                                               |
| `estimatedHours` | `number`       | 可省略        | 数值，{ maxDecimalPlaces: 2 }；最小值 0；最大值 10000                      |
| `tagNames`       | `string[]`     | 可省略        | 数组；数组最多 20 项；字符串（{ each: true }）；长度 1, 50, { each: true } |

### 4.29 ListTasksQueryDto

| 字段          | 类型           | 必填性（DTO） | 约束                   |
| ------------- | -------------- | ------------- | ---------------------- |
| `search`      | `string`       | 可省略        | 字符串；长度 1, 100    |
| `assigneeId`  | `string`       | 可省略        | 字符串；长度 1, 64     |
| `status`      | `TaskStatus`   | 可省略        | 限定值 TASK_STATUSES   |
| `priority`    | `TaskPriority` | 可省略        | 限定值 TASK_PRIORITIES |
| `tag`         | `string`       | 可省略        | 字符串；长度 1, 50     |
| `iterationId` | `string`       | 可省略        | 字符串；长度 1, 64     |
| `dueDateFrom` | `string`       | 可省略        | YYYY-MM-DD 格式        |
| `dueDateTo`   | `string`       | 可省略        | YYYY-MM-DD 格式        |

### 4.30 UpdateTaskStatusDto

| 字段              | 类型         | 必填性（DTO） | 约束                  |
| ----------------- | ------------ | ------------- | --------------------- |
| `status`          | `TaskStatus` | 必填          | 限定值 TASK_STATUSES  |
| `completionNote`  | `string`     | 可省略        | 字符串；最大长度 5000 |
| `reopenReason`    | `string`     | 可省略        | 字符串；最大长度 2000 |
| `rejectionReason` | `string`     | 可省略        | 字符串；最大长度 2000 |

### 4.31 UpdateTaskDto

| 字段             | 类型           | 必填性（DTO） | 约束                                                                       |
| ---------------- | -------------- | ------------- | -------------------------------------------------------------------------- |
| `title`          | `string`       | 可省略        | 字符串；长度 1, 100                                                        |
| `description`    | `string`       | 可省略        | 字符串；最大长度 5000                                                      |
| `assigneeId`     | `string`       | 可省略        | 字符串；长度 1, 100                                                        |
| `requirementId`  | `string`       | 可省略        | 字符串；长度 1, 100                                                        |
| `acceptanceId`   | `string`       | 可省略        | 字符串；长度 1, 100                                                        |
| `priority`       | `TaskPriority` | 可省略        | 限定值 TASK_PRIORITIES                                                     |
| `dueDate`        | `string`       | 可省略        | ISO 日期字符串，严格日期校验                                               |
| `estimatedHours` | `number`       | 可省略        | 数值，{ maxDecimalPlaces: 2 }；最小值 0；最大值 10000                      |
| `tagNames`       | `string[]`     | 可省略        | 数组；数组最多 20 项；字符串（{ each: true }）；长度 1, 50, { each: true } |

### 4.32 UpdateProfileDto

| 字段        | 类型             | 必填性（DTO） | 约束                                            |
| ----------- | ---------------- | ------------- | ----------------------------------------------- |
| `nickname`  | `string`         | 可省略        | 字符串；长度 1, 50                              |
| `avatarUrl` | `string \| null` | 可省略        | 字符串；最大长度 2048；HTTP/HTTPS URL，要求协议 |

### 4.33 枚举与特殊输入

| 类型或规则名                                         | 允许值                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| ProjectRole / PROJECT_ROLES                          | OWNER、MEMBER、OBSERVER                                                |
| ProjectAccessRole                                    | 项目角色及 ADMIN（平台管理访问上下文）                                 |
| ProjectStatus / PROJECT_STATUSES                     | PLANNING、ACTIVE、PAUSED、COMPLETED、ARCHIVED                          |
| RequirementStatus / REQUIREMENT_STATUSES             | DRAFT、CONFIRMED、IN_PROGRESS、PENDING_ACCEPTANCE、COMPLETED、REJECTED |
| TaskStatus / TASK_STATUSES                           | BACKLOG、TODO、IN_PROGRESS、PENDING_REVIEW、COMPLETED、BLOCKED         |
| RequirementPriority / TaskPriority 及对应 PRIORITIES | HIGH、MEDIUM、LOW                                                      |
| IterationStatus / ITERATION_STATUSES                 | NOT_STARTED、IN_PROGRESS、COMPLETED、CANCELED                          |
| CommentTargetType / COMMENT_TARGET_TYPES             | REQUIREMENT、TASK、MEETING                                             |
| MeetingActionStatus / MEETING_ACTION_STATUSES        | PENDING、IN_PROGRESS、COMPLETED、CANCELED                              |
| AcceptanceResult / ACCEPTANCE_RESULTS                | NOT_STARTED、IN_PROGRESS、PASSED、FAILED                               |

`UpdateProfileDto.avatarUrl` 是基线 API 仍保留的兼容字段；个人资料界面按 FR-01/AC-11 仅提供文件选择自动上传，不提供 URL 输入。数据库可空也不代表接口支持清空，更新验收时日期可通过 `null` 明确清空，省略该字段则保留原值。

## 5. 关键业务调用规则

1. 创建任务时 `title` 和 `priority` 必填；状态默认待规划，迭代安排通过迭代接口执行，不向任务创建接口增加 `iterationId` 等未声明字段。
2. 提交待审核或完成任务前应有完成说明。审核通过仅限负责人或管理员；拒绝审核保留 PENDING_REVIEW 并提交原因；重新打开已完成任务需原因。
3. 删除项目提交 `confirmName`，由服务端核对确认名称；不要将客户端弹窗当成服务端删除授权。
4. 成员邀请使用已有用户名和 MEMBER / OBSERVER。将已有成员角色更新为 OWNER 会走负责人移交规则，不能直接移除或降级唯一负责人。
5. 需求和任务的标题搜索采用字面匹配，`%`、`_` 不作为通配符。日期筛选覆盖上海业务日的首尾，起始日期不得晚于结束日期。
6. 行动项转换成功后保留转换任务引用，不能重复转换。后续加入迭代失败时，恢复已有任务的后续操作，不重复创建任务。
7. 关闭迭代及迁移任务检查项目、状态和已有归属；加入迭代时使用预期原迭代标识检测陈旧选择。
8. 验收未通过时必须填写原因；整改任务通过创建任务时的 `acceptanceId` 关联，可再安排迭代，不存在独立的通用整改创建路由。

## 6. 上传、导出与示例

### 6.1 头像上传

`POST /api/v1/users/me/avatar` 使用一个名为 `avatar` 的文件字段，不提交额外表单字段，单文件不超过 10 MiB。支持 JPEG/JPG、PNG、WebP；服务端检查文件签名、长度及 MIME，成功返回更新后的 UserProfileResponse。错误时保留原头像并给出安全提示，不返回文件绝对路径。

### 6.2 CSV 下载

任务导出复用 ListTasksQueryDto，进度报告复用仪表盘统计。两个接口直接返回 UTF-8 BOM 的 CSV，设置 `Content-Type: text/csv; charset=utf-8`、附件文件名和 `Cache-Control: no-store`。使用引号转义及公式开头防护。错误返回统一 JSON，调用方应检查状态和类型后再保存文件。

### 6.3 创建任务示例

以下为 JSON 请求体示例，实际调用路径中的项目标识和身份由运行环境提供：

```json
{
  "title": "编写项目报告",
  "priority": "MEDIUM"
}
```

成功后 `data` 为 TaskResponse，创建时间和标识由服务端提供。查看单个任务、变更状态和加入迭代使用返回的任务标识继续调用。

## 7. 返回类型字典

本节保留基线接口声明的字段及类型。类型中的 `null` 表示值可为空，`?` 表示字段可缺省；接口继承的字段同时适用。DateTime 由服务端序列化为字符串，数据库字段和 API 响应字段不能混用。匿名嵌套类型在表内压成单行，仅改变排版。

### 7.1 ApiMeta

| 字段        | 类型     | 可缺省 |
| ----------- | -------- | ------ |
| `requestId` | `string` | 否     |
| `timestamp` | `string` | 否     |

### 7.2 `ApiSuccessResponse<T>`

| 字段      | 类型      | 可缺省 |
| --------- | --------- | ------ |
| `data`    | `T`       | 否     |
| `meta`    | `ApiMeta` | 否     |
| `success` | `true`    | 否     |

### 7.3 ApiErrorResponse

| 字段      | 类型                                                                 | 可缺省 |
| --------- | -------------------------------------------------------------------- | ------ |
| `error`   | `{     code: string;     details: unknown;     message: string;   }` | 否     |
| `meta`    | `ApiMeta`                                                            | 否     |
| `success` | `false`                                                              | 否     |

### 7.4 HealthStatus

| 字段      | 类型         | 可缺省 |
| --------- | ------------ | ------ |
| `service` | `'scpc-api'` | 否     |
| `status`  | `'ok'`       | 否     |

### 7.5 AcceptanceParticipantResponse

| 字段        | 类型             | 可缺省 |
| ----------- | ---------------- | ------ |
| `avatarUrl` | `string \| null` | 否     |
| `id`        | `string`         | 否     |
| `nickname`  | `string`         | 否     |
| `userId`    | `string`         | 否     |
| `username`  | `string`         | 否     |

### 7.6 AcceptanceRemediationTaskResponse

| 字段         | 类型             | 可缺省 |
| ------------ | ---------------- | ------ |
| `assigneeId` | `string \| null` | 否     |
| `id`         | `string`         | 否     |
| `status`     | `string`         | 否     |
| `title`      | `string`         | 否     |

### 7.7 AcceptanceSummaryResponse

| 字段                   | 类型                              | 可缺省 |
| ---------------------- | --------------------------------- | ------ |
| `acceptanceDate`       | `string \| null`                  | 否     |
| `createdAt`            | `string`                          | 否     |
| `createdById`          | `string`                          | 否     |
| `failureReason`        | `string \| null`                  | 否     |
| `goal`                 | `string \| null`                  | 否     |
| `id`                   | `string`                          | 否     |
| `participants`         | `AcceptanceParticipantResponse[]` | 否     |
| `projectId`            | `string`                          | 否     |
| `remediationTaskCount` | `number`                          | 否     |
| `result`               | `AcceptanceResult`                | 否     |
| `stageName`            | `string`                          | 否     |
| `standards`            | `string`                          | 否     |
| `updatedAt`            | `string`                          | 否     |

### 7.8 AcceptanceDetailResponse

继承 `AcceptanceSummaryResponse` 的全部字段；下表为新增字段。

| 字段               | 类型                                  | 可缺省 |
| ------------------ | ------------------------------------- | ------ |
| `remediationTasks` | `AcceptanceRemediationTaskResponse[]` | 否     |

### 7.9 ChangePasswordResponse

| 字段          | 类型       | 可缺省 |
| ------------- | ---------- | ------ |
| `accessToken` | `string`   | 否     |
| `expiresIn`   | `string`   | 否     |
| `tokenType`   | `'Bearer'` | 否     |

### 7.10 LoginResponse

| 字段          | 类型                | 可缺省 |
| ------------- | ------------------- | ------ |
| `accessToken` | `string`            | 否     |
| `expiresIn`   | `string`            | 否     |
| `tokenType`   | `'Bearer'`          | 否     |
| `user`        | `AuthenticatedUser` | 否     |

### 7.11 LogoutResponse

| 字段        | 类型   | 可缺省 |
| ----------- | ------ | ------ |
| `loggedOut` | `true` | 否     |

### 7.12 RegisterResponse

| 字段        | 类型     | 可缺省 |
| ----------- | -------- | ------ |
| `createdAt` | `string` | 否     |
| `id`        | `string` | 否     |
| `nickname`  | `string` | 否     |
| `username`  | `string` | 否     |

### 7.13 CommentResponse

| 字段         | 类型                                                                                               | 可缺省 |
| ------------ | -------------------------------------------------------------------------------------------------- | ------ |
| `author`     | `{     avatarUrl: string \| null;     id: string;     nickname: string;     username: string;   }` | 否     |
| `content`    | `string`                                                                                           | 否     |
| `createdAt`  | `string`                                                                                           | 否     |
| `id`         | `string`                                                                                           | 否     |
| `targetType` | `CommentTargetType`                                                                                | 否     |
| `updatedAt`  | `string`                                                                                           | 否     |

### 7.14 DashboardProjectResponse

| 字段                        | 类型             | 可缺省 |
| --------------------------- | ---------------- | ------ |
| `endDate`                   | `string \| null` | 否     |
| `id`                        | `string`         | 否     |
| `name`                      | `string`         | 否     |
| `requirementCompletionRate` | `number`         | 否     |
| `startDate`                 | `string \| null` | 否     |
| `status`                    | `string`         | 否     |
| `taskCompletionRate`        | `number`         | 否     |

### 7.15 DashboardSummaryResponse

| 字段                        | 类型     | 可缺省 |
| --------------------------- | -------- | ------ |
| `blockedTasks`              | `number` | 否     |
| `completedRequirements`     | `number` | 否     |
| `completedTasks`            | `number` | 否     |
| `inProgressTasks`           | `number` | 否     |
| `overdueTasks`              | `number` | 否     |
| `pendingReviewTasks`        | `number` | 否     |
| `requirementCompletionRate` | `number` | 否     |
| `taskCompletionRate`        | `number` | 否     |
| `totalRequirements`         | `number` | 否     |
| `totalTasks`                | `number` | 否     |

### 7.16 DashboardTaskStatusDistributionItem

| 字段     | 类型         | 可缺省 |
| -------- | ------------ | ------ |
| `count`  | `number`     | 否     |
| `status` | `TaskStatus` | 否     |

### 7.17 DashboardMemberTaskItem

| 字段              | 类型             | 可缺省 |
| ----------------- | ---------------- | ------ |
| `avatarUrl`       | `string \| null` | 否     |
| `blockedTasks`    | `number`         | 否     |
| `completedTasks`  | `number`         | 否     |
| `inProgressTasks` | `number`         | 否     |
| `nickname`        | `string`         | 否     |
| `overdueTasks`    | `number`         | 否     |
| `totalTasks`      | `number`         | 否     |
| `userId`          | `string`         | 否     |
| `username`        | `string`         | 否     |

### 7.18 DashboardIterationCompletionItem

| 字段             | 类型     | 可缺省 |
| ---------------- | -------- | ------ |
| `completedTasks` | `number` | 否     |
| `completionRate` | `number` | 否     |
| `id`             | `string` | 否     |
| `name`           | `string` | 否     |
| `status`         | `string` | 否     |
| `totalTasks`     | `number` | 否     |

### 7.19 DashboardActivityItem

| 字段          | 类型                                                                        | 可缺省 |
| ------------- | --------------------------------------------------------------------------- | ------ |
| `action`      | `string`                                                                    | 否     |
| `actor`       | `{     id: string;     nickname: string;     username: string;   } \| null` | 否     |
| `afterValue`  | `unknown`                                                                   | 否     |
| `beforeValue` | `unknown`                                                                   | 否     |
| `createdAt`   | `string`                                                                    | 否     |
| `id`          | `string`                                                                    | 否     |
| `targetId`    | `string`                                                                    | 否     |
| `targetType`  | `string`                                                                    | 否     |

### 7.20 DashboardUpcomingTaskItem

| 字段       | 类型                                                                        | 可缺省 |
| ---------- | --------------------------------------------------------------------------- | ------ |
| `assignee` | `{     id: string;     nickname: string;     username: string;   } \| null` | 否     |
| `dueDate`  | `string`                                                                    | 否     |
| `id`       | `string`                                                                    | 否     |
| `priority` | `TaskPriority`                                                              | 否     |
| `status`   | `TaskStatus`                                                                | 否     |
| `title`    | `string`                                                                    | 否     |

### 7.21 DashboardCompletionTrendPoint

| 字段                  | 类型     | 可缺省 |
| --------------------- | -------- | ------ |
| `completed`           | `number` | 否     |
| `cumulativeCompleted` | `number` | 否     |
| `date`                | `string` | 否     |

### 7.22 DashboardBurndownPoint

| 字段                  | 类型     | 可缺省 |
| --------------------- | -------- | ------ |
| `completedTasks`      | `number` | 否     |
| `date`                | `string` | 否     |
| `idealRemainingTasks` | `number` | 否     |
| `remainingTasks`      | `number` | 否     |

### 7.23 DashboardResponse

| 字段                     | 类型                                    | 可缺省 |
| ------------------------ | --------------------------------------- | ------ |
| `asOf`                   | `string`                                | 否     |
| `burndown`               | `DashboardBurndownPoint[]`              | 否     |
| `completionTrend`        | `DashboardCompletionTrendPoint[]`       | 否     |
| `iterationCompletion`    | `DashboardIterationCompletionItem[]`    | 否     |
| `memberTaskDistribution` | `DashboardMemberTaskItem[]`             | 否     |
| `project`                | `DashboardProjectResponse`              | 否     |
| `recentActivities`       | `DashboardActivityItem[]`               | 否     |
| `summary`                | `DashboardSummaryResponse`              | 否     |
| `taskStatusDistribution` | `DashboardTaskStatusDistributionItem[]` | 否     |
| `upcomingTaskDays`       | `number`                                | 否     |
| `upcomingTasks`          | `DashboardUpcomingTaskItem[]`           | 否     |

### 7.24 IterationTaskSummary

| 字段          | 类型             | 可缺省 |
| ------------- | ---------------- | ------ |
| `completedAt` | `string \| null` | 否     |
| `dueDate`     | `string \| null` | 否     |
| `id`          | `string`         | 否     |
| `status`      | `TaskStatus`     | 否     |
| `title`       | `string`         | 否     |

### 7.25 IterationResponse

| 字段        | 类型              | 可缺省 |
| ----------- | ----------------- | ------ |
| `createdAt` | `string`          | 否     |
| `endDate`   | `string`          | 否     |
| `goal`      | `string \| null`  | 否     |
| `id`        | `string`          | 否     |
| `name`      | `string`          | 否     |
| `projectId` | `string`          | 否     |
| `startDate` | `string`          | 否     |
| `status`    | `IterationStatus` | 否     |
| `taskCount` | `number`          | 否     |
| `updatedAt` | `string`          | 否     |

### 7.26 IterationDetailResponse

继承 `IterationResponse` 的全部字段；下表为新增字段。

| 字段    | 类型                     | 可缺省 |
| ------- | ------------------------ | ------ |
| `tasks` | `IterationTaskSummary[]` | 否     |

### 7.27 IterationStatsResponse

| 字段             | 类型     | 可缺省 |
| ---------------- | -------- | ------ |
| `asOf`           | `string` | 否     |
| `blocked`        | `number` | 否     |
| `completed`      | `number` | 否     |
| `completionRate` | `number` | 否     |
| `inProgress`     | `number` | 否     |
| `overdue`        | `number` | 否     |
| `total`          | `number` | 否     |

### 7.28 MeetingParticipantResponse

| 字段        | 类型             | 可缺省 |
| ----------- | ---------------- | ------ |
| `avatarUrl` | `string \| null` | 否     |
| `id`        | `string`         | 否     |
| `nickname`  | `string`         | 否     |
| `userId`    | `string`         | 否     |
| `username`  | `string`         | 否     |

### 7.29 MeetingUserResponse

| 字段        | 类型             | 可缺省 |
| ----------- | ---------------- | ------ |
| `avatarUrl` | `string \| null` | 否     |
| `id`        | `string`         | 否     |
| `nickname`  | `string`         | 否     |
| `userId`    | `string`         | 否     |
| `username`  | `string`         | 否     |

### 7.30 MeetingActionResponse

| 字段              | 类型                  | 可缺省 |
| ----------------- | --------------------- | ------ |
| `assigneeId`      | `string \| null`      | 否     |
| `convertedTaskId` | `string \| null`      | 否     |
| `createdAt`       | `string`              | 否     |
| `dueDate`         | `string \| null`      | 否     |
| `id`              | `string`              | 否     |
| `meetingId`       | `string`              | 否     |
| `status`          | `MeetingActionStatus` | 否     |
| `title`           | `string`              | 否     |
| `updatedAt`       | `string`              | 否     |

### 7.31 MeetingSummaryResponse

| 字段               | 类型                  | 可缺省 |
| ------------------ | --------------------- | ------ |
| `actionCount`      | `number`              | 否     |
| `agenda`           | `string \| null`      | 否     |
| `createdAt`        | `string`              | 否     |
| `createdBy`        | `MeetingUserResponse` | 否     |
| `createdById`      | `string`              | 否     |
| `decisions`        | `string \| null`      | 否     |
| `id`               | `string`              | 否     |
| `minutes`          | `string \| null`      | 否     |
| `participantCount` | `number`              | 否     |
| `projectId`        | `string`              | 否     |
| `scheduledAt`      | `string`              | 否     |
| `title`            | `string`              | 否     |
| `updatedAt`        | `string`              | 否     |

### 7.32 MeetingDetailResponse

继承 `MeetingSummaryResponse` 的全部字段；下表为新增字段。

| 字段           | 类型                           | 可缺省 |
| -------------- | ------------------------------ | ------ |
| `actions`      | `MeetingActionResponse[]`      | 否     |
| `participants` | `MeetingParticipantResponse[]` | 否     |

### 7.33 ConvertedTaskResponse

| 字段            | 类型             | 可缺省 |
| --------------- | ---------------- | ------ |
| `assigneeId`    | `string \| null` | 否     |
| `dueDate`       | `string \| null` | 否     |
| `id`            | `string`         | 否     |
| `priority`      | `TaskPriority`   | 否     |
| `projectId`     | `string`         | 否     |
| `requirementId` | `string \| null` | 否     |
| `status`        | `TaskStatus`     | 否     |
| `title`         | `string`         | 否     |

### 7.34 MeetingActionConversionResponse

继承 `MeetingActionResponse` 的全部字段；下表为新增字段。

| 字段     | 类型                    | 可缺省 |
| -------- | ----------------------- | ------ |
| `action` | `MeetingActionResponse` | 否     |
| `task`   | `ConvertedTaskResponse` | 否     |

### 7.35 ActivityActorResponse

| 字段       | 类型     | 可缺省 |
| ---------- | -------- | ------ |
| `id`       | `string` | 否     |
| `nickname` | `string` | 否     |
| `username` | `string` | 否     |

### 7.36 ActivityResponse

| 字段          | 类型                            | 可缺省 |
| ------------- | ------------------------------- | ------ |
| `action`      | `string`                        | 否     |
| `actor`       | `ActivityActorResponse \| null` | 否     |
| `afterValue`  | `unknown`                       | 否     |
| `beforeValue` | `unknown`                       | 否     |
| `createdAt`   | `string`                        | 否     |
| `id`          | `string`                        | 否     |
| `targetId`    | `string`                        | 否     |
| `targetType`  | `string`                        | 否     |

### 7.37 ProjectMemberResponse

| 字段        | 类型             | 可缺省 |
| ----------- | ---------------- | ------ |
| `avatarUrl` | `string \| null` | 否     |
| `id`        | `string`         | 否     |
| `joinedAt`  | `string`         | 否     |
| `nickname`  | `string`         | 否     |
| `role`      | `ProjectRole`    | 否     |
| `userId`    | `string`         | 否     |
| `username`  | `string`         | 否     |

### 7.38 ProjectResponse

| 字段          | 类型                | 可缺省 |
| ------------- | ------------------- | ------ |
| `accessRole`  | `ProjectAccessRole` | 否     |
| `createdAt`   | `string`            | 否     |
| `description` | `string \| null`    | 否     |
| `endDate`     | `string \| null`    | 否     |
| `id`          | `string`            | 否     |
| `name`        | `string`            | 否     |
| `ownerId`     | `string`            | 否     |
| `startDate`   | `string \| null`    | 否     |
| `status`      | `ProjectStatus`     | 否     |
| `updatedAt`   | `string`            | 否     |

### 7.39 RequirementTaskSummary

| 字段         | 类型             | 可缺省 |
| ------------ | ---------------- | ------ |
| `assigneeId` | `string \| null` | 否     |
| `id`         | `string`         | 否     |
| `status`     | `string`         | 否     |
| `title`      | `string`         | 否     |

### 7.40 RequirementResponse

| 字段                 | 类型                       | 可缺省 |
| -------------------- | -------------------------- | ------ |
| `acceptanceCriteria` | `string`                   | 否     |
| `createdAt`          | `string`                   | 否     |
| `creatorId`          | `string`                   | 否     |
| `description`        | `string \| null`           | 否     |
| `id`                 | `string`                   | 否     |
| `number`             | `string`                   | 否     |
| `priority`           | `RequirementPriority`      | 否     |
| `projectId`          | `string`                   | 否     |
| `status`             | `RequirementStatus`        | 否     |
| `tasks`              | `RequirementTaskSummary[]` | 否     |
| `title`              | `string`                   | 否     |
| `updatedAt`          | `string`                   | 否     |

### 7.41 TaskResponse

| 字段              | 类型             | 可缺省 |
| ----------------- | ---------------- | ------ |
| `acceptanceId`    | `string \| null` | 否     |
| `assigneeId`      | `string \| null` | 否     |
| `completedAt`     | `string \| null` | 否     |
| `completionNote`  | `string \| null` | 否     |
| `createdAt`       | `string`         | 否     |
| `createdById`     | `string`         | 否     |
| `description`     | `string \| null` | 否     |
| `dueDate`         | `string \| null` | 否     |
| `estimatedHours`  | `number \| null` | 否     |
| `id`              | `string`         | 否     |
| `priority`        | `TaskPriority`   | 否     |
| `projectId`       | `string`         | 否     |
| `requirementId`   | `string \| null` | 否     |
| `rejectionReason` | `string \| null` | 否     |
| `status`          | `TaskStatus`     | 否     |
| `tagNames`        | `string[]`       | 否     |
| `title`           | `string`         | 否     |
| `updatedAt`       | `string`         | 否     |

### 7.42 UserProfileResponse

| 字段        | 类型             | 可缺省 |
| ----------- | ---------------- | ------ |
| `avatarUrl` | `string \| null` | 否     |
| `createdAt` | `string`         | 否     |
| `id`        | `string`         | 否     |
| `nickname`  | `string`         | 否     |
| `status`    | `string`         | 否     |
| `updatedAt` | `string`         | 否     |
| `username`  | `string`         | 否     |

### 7.43 UserTaskItem

| 字段          | 类型             | 可缺省 |
| ------------- | ---------------- | ------ |
| `dueDate`     | `string \| null` | 否     |
| `id`          | `string`         | 否     |
| `priority`    | `string`         | 否     |
| `projectId`   | `string`         | 否     |
| `projectName` | `string`         | 否     |
| `status`      | `string`         | 否     |
| `title`       | `string`         | 否     |
| `updatedAt`   | `string`         | 否     |

## 8. 版本、来源与验收边界

接口清单核对 `apps/api/src` 中控制器；请求字段核对各 `dto/*.dto.ts`；返回字典核对 `interfaces/*response.ts`、公共响应定义及 HealthStatus。需求要求仍以正式基线为准，代码接口清单不构成新增功能授权。

这些类型描述固定版本的契约，不保证每个异常或并发场景已完成 P7 最终验收。缺失能力与已知边界见[技术架构书](技术架构书.md)，数据关系见[数据库设计说明书](数据库设计说明书.md)，历史证据及最终验证清单见[测试计划与阶段验证汇总](测试计划与阶段验证汇总.md)。P7 如果修订接口、DTO 或返回字段，应同步更新本文基线和相应表格。

## 9. 最终接口增补

| 方法 | 路径                            | 权限与输入                                                           | 返回                |
| ---- | ------------------------------- | -------------------------------------------------------------------- | ------------------- |
| GET  | `/api/v1/users/admin`           | ACTIVE平台管理员                                                     | AdminUserResponse[] |
| POST | `/api/v1/users/:userId/disable` | ACTIVE平台管理员；DisableUserDto.confirmUsername必须与目标用户名一致 | AdminUserResponse   |

管理员账号不能禁用。重复禁用幂等；状态更新、tokenVersion递增和独立审计在事务中完成。普通成员、负责人、观察者和非成员均不能调用管理接口。既有历史与任务不删除。

DisableUserDto仅含confirmUsername:string，长度1～100。AdminUserResponse含id、username、nickname、status、isPlatformAdmin及updatedAt，不返回密码哈希或tokenVersion。UserProfileResponse新增isPlatformAdmin:boolean供导航展示，权限仍由后端判断。

最终状态与结果：[最终测试报告](最终测试报告.md)、[项目验收报告](项目验收报告.md)、[最终交付清单](最终交付清单.md)。
