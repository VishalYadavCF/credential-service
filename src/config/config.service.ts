import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { EnvConfigType } from './env.schema';
import { EnvConsts } from './env.consts';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<EnvConfigType, true>) {}

  get port(): number {
    return this.configService.get(EnvConsts.PORT);
  }

  get host(): string {
    return this.configService.get(EnvConsts.HOST);
  }

  get globalPrefix(): string {
    return this.configService.get(EnvConsts.GLOBAL_PREFIX);
  }

  get nodeEnv(): string {
    return this.configService.get(EnvConsts.NODE_ENV);
  }

  get logLevel(): string {
    return this.configService.get(EnvConsts.LOG_LEVEL);
  }

  /** Absolute path to the seed JSON file, resolved against process.cwd(). */
  get seedFilePath(): string {
    const configured = this.configService.get(EnvConsts.SEED_FILE_PATH);
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
}
