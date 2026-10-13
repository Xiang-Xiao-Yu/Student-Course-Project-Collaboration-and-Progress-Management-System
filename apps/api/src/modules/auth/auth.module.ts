import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './repositories/auth.repository';
import { PasswordHasherService } from './services/password-hasher.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, PasswordHasherService],
})
export class AuthModule {}
