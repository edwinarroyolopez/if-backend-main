import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from 'src/platform/http/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);

  configureApp(app, configService);

  await app.listen(configService.getOrThrow<number>('app.port'));
}

void bootstrap();
