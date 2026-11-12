import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AvatarStorageService } from './avatar-storage.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersRepository } from './repositories/admin-users.repository';

@Module({
  controllers: [UsersController, AdminUsersController],
  imports: [AuthModule],
  exports: [AvatarStorageService],
  providers: [
    AvatarStorageService,
    UsersRepository,
    UsersService,
    AdminUsersRepository,
    AdminUsersService,
  ],
})
export class UsersModule {}
