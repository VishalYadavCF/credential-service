import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';

const WARNING_BANNER = `
================================================================================
  ⚠️  credential-service — LOCAL DEV STUB. DO NOT DEPLOY. DO NOT USE IN PROD. ⚠️

  - No encryption. No authentication. Secrets are stored in plaintext JSON.
  - Exists only so ap-executor can be tested locally with real OAuth2 tokens /
    API keys, standing in for the production Vault-backed credential store
    (which needs a Kubernetes service-account JWT and cannot run on a laptop).
  - Binds to 127.0.0.1 by default. If you override HOST, you are on your own.
================================================================================
`;

async function bootstrap() {
  console.warn(WARNING_BANNER);

  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  app.setGlobalPrefix(config.globalPrefix);

  await app.listen(config.port, config.host);

  const logger = new Logger('bootstrap');
  logger.warn('credential-service is a LOCAL DEV STUB — never deploy this. See README.md.');
  logger.log(
    `credential-service listening on http://${config.host}:${config.port}/${config.globalPrefix}`,
  );
  logger.log(`Seed file: ${config.seedFilePath}`);
}

bootstrap();
