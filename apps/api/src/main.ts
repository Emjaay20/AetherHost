import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { 
    rawBody: true,
    logger: process.env.NODE_ENV === 'production' 
      ? ['error', 'warn', 'log'] 
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // 1. Enable Graceful Shutdown (Universal Gap #7)
  app.enableShutdownHooks();

  // 2. Global Exception Filter for normalized { statusCode, message, error } responses
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? [
      'http://localhost:3002',
      'http://127.0.0.1:3002',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 3. Swagger / OpenAPI Setup (Universal Gap #4)
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true'
  ) {
    const config = new DocumentBuilder()
      .setTitle('AetherHost API')
      .setDescription('The multi-tenant control plane for AetherHost.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('v1/docs', app, documentFactory);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
