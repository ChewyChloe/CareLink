import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LineIdentityVerifier } from './line-identity-verifier.service';
import { SessionService } from './session.service';
import { AuthGuard } from './guards/auth.guard';
import { CsrfOriginGuard } from '../../common/guards/csrf-origin.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    LineIdentityVerifier,
    SessionService,
    AuthGuard,
    CsrfOriginGuard,
  ],
  exports: [
    AuthService,
    SessionService,
    AuthGuard,
    CsrfOriginGuard,
    LineIdentityVerifier,
  ],
})
export class AuthModule {}
