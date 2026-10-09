import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as cookieParserModule from 'cookie-parser';
import { HTTP_PREFIX_OPTIONS } from './http-prefix';
import { AppModule } from './app.module';

const cookieParser = (cookieParserModule as any).default || cookieParserModule;

async function bootstrap() {
  const logger = new Logger('CareLinkBootstrap');
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for LINE Webhook signature verification (Stage 2)
  });

  app.use(cookieParser());
  (app.getHttpAdapter().getInstance() as any)?.set?.('trust proxy', 1);

  const rawFrontend = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173';
  if (process.env.NODE_ENV === 'production' && (!process.env.FRONTEND_ORIGIN || /localhost|127\.0\.0\.1|trycloudflare/i.test(rawFrontend) || !rawFrontend.split(',').every(o => o.trim().startsWith('https://')))) throw new Error('Production requires explicit permanent HTTPS FRONTEND_ORIGIN');
  const splitOrigins = rawFrontend.split(',').map((s) => s.trim().replace(/\/$/, ''));
  const staticOrigins = new Set([
    ...splitOrigins,
    ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']),
  ]);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const clean = origin.replace(/\/$/, '');
      if (staticOrigins.has(clean)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api', HTTP_PREFIX_OPTIONS);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`CareLink Backend running on http://localhost:${port}`);
  logger.log(`Health check available at http://localhost:${port}/api/health and http://localhost:${port}/health`);
}

bootstrap();
