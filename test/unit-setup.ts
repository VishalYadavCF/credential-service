// Loaded via jest.config.ts setupFiles — silences NestJS Logger output in unit tests
// so `npm test` output stays readable. Individual specs that assert on log calls
// use jest.spyOn(Logger.prototype, ...) which still works against the muted logger.
import { Logger } from '@nestjs/common';

Logger.overrideLogger(false);
