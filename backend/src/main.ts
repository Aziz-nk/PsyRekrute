import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { configureTrustedProxies } from './modules/auth/ip-extractor.util';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. En-têtes HTTP de sécurité (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  configureTrustedProxies(app);

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 2. Swagger / OpenAPI : activé uniquement hors production pour protéger la surface d'attaque
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('PsyRekrute API')
      .setDescription(
        "API de mise en relation professionnelle – Psychologie de l'Éducation – Maroc",
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`Swagger docs enabled: http://localhost:${process.env.APP_PORT ?? 4000}/api/docs`);
  } else {
    logger.log('Swagger documentation is disabled in production mode.');
  }

  // 3. CORS : restriction stricte à l'origine autorisée (FRONTEND_URL)
  const allowedOrigin =
    process.env.FRONTEND_URL || (isProduction ? '' : 'http://localhost:3000');

  if (isProduction && !process.env.FRONTEND_URL) {
    logger.warn('FRONTEND_URL is not set in production. CORS may reject cross-origin requests.');
  }

  app.enableCors({
    origin: allowedOrigin
      ? allowedOrigin.split(',').map((origin) => origin.trim())
      : false,
    credentials: true,
  });

  const port = process.env.APP_PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  logger.log(`PsyRekrute Backend running on http://0.0.0.0:${port}/api/v1 (ENV: ${process.env.NODE_ENV || 'development'})`);
}
bootstrap();
