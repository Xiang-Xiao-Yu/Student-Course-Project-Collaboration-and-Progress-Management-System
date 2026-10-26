import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AvatarStorageService } from './avatar-storage.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  imports: [AuthModule],
  exports: [AvatarStorageService],
  providers: [AvatarStorageService, UsersRepository, UsersService],
})
export class UsersModule {}
