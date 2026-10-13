import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthRepository } from './repositories/auth.repository';
import { PasswordHasherService } from './services/password-hasher.service';

@Module({
  controllers: [AuthController],
  exports: [AuthGuard, AuthService],
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const signOptions = {
          expiresIn: configService.getOrThrow<string>('JWT_EXPIRES_IN'),
        } as NonNullable<JwtModuleOptions['signOptions']>;

        return {
          secret: configService.getOrThrow<string>('JWT_SECRET'),
          signOptions,
        };
      },
    }),
  ],
  providers: [AuthService, AuthGuard, AuthRepository, PasswordHasherService],
})
export class AuthModule {}
