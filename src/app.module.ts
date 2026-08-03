import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { CredentialsModule } from './credentials/credentials.module';

@Module({
  imports: [ConfigModule, CredentialsModule],
})
export class AppModule {}
