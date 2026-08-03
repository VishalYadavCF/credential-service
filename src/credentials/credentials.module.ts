import { Module } from '@nestjs/common';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './services/credentials.service';
import { SeedStoreService } from './services/seed-store.service';

@Module({
  controllers: [CredentialsController],
  providers: [CredentialsService, SeedStoreService],
  exports: [SeedStoreService],
})
export class CredentialsModule {}
