import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LineTokenPayload {
  sub: string;
  name?: string;
  picture?: string;
  email?: string;
  aud: string;
  iss: string;
  exp: number;
}

export interface ILineIdentityVerifier {
  verifyIdToken(idToken: string): Promise<LineTokenPayload>;
}

@Injectable()
export class LineIdentityVerifier implements ILineIdentityVerifier {
  private readonly logger = new Logger(LineIdentityVerifier.name);
  private readonly verifyEndpoint = 'https://api.line.me/oauth2/v2.1/verify';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Verifies raw LINE ID token with LINE official verify endpoint.
   * Validates audience, issuer, expiration, and extracts trusted `sub`.
   */
  async verifyIdToken(idToken: string): Promise<LineTokenPayload> {
    if (!idToken || typeof idToken !== 'string') {
      throw new UnauthorizedException('ID token is missing or invalid');
    }

    const expectedChannelId = this.configService.get<string>('LINE_MINI_APP_CHANNEL_ID');
    if (!expectedChannelId) {
      this.logger.error('LINE_MINI_APP_CHANNEL_ID is not configured');
      throw new UnauthorizedException('Server LINE configuration missing');
    }

    try {
      const response = await fetch(this.verifyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: expectedChannelId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(`LINE token verification rejected by LINE API: HTTP ${response.status} - ${errText}`);
        throw new UnauthorizedException('LINE token verification failed');
      }

      const data = (await response.json()) as any;

      // 1. Verify audience matches CareLink MINI App Channel ID
      if (data.aud !== expectedChannelId) {
        this.logger.warn(`Token audience mismatch: expected ${expectedChannelId}, got ${data.aud}`);
        throw new UnauthorizedException('Token audience does not match CareLink channel');
      }

      // 2. Verify issuer is LINE
      if (data.iss !== 'https://access.line.me') {
        this.logger.warn(`Token issuer mismatch: expected https://access.line.me, got ${data.iss}`);
        throw new UnauthorizedException('Token issuer is untrusted');
      }

      // 3. Verify expiry
      const nowSec = Math.floor(Date.now() / 1000);
      if (data.exp && data.exp <= nowSec) {
        this.logger.warn('Token has expired');
        throw new UnauthorizedException('Token has expired');
      }

      // 4. Ensure sub exists
      if (!data.sub) {
        throw new UnauthorizedException('Token payload missing subject identifier (sub)');
      }

      return {
        sub: data.sub,
        name: data.name,
        picture: data.picture,
        email: data.email,
        aud: data.aud,
        iss: data.iss,
        exp: data.exp,
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.error(`Network or unexpected error while verifying LINE ID token: ${err.message}`);
      throw new UnauthorizedException('LINE token verification could not be completed');
    }
  }
}
