import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';
import { UpdateAuthSchema } from '../../credentials/dto/update-auth.dto';

describe('ZodValidationPipe', () => {
  it('ZVP-001: returns the parsed value when validation succeeds', () => {
    const pipe = new ZodValidationPipe(z.object({ a: z.number() }));
    expect(pipe.transform({ a: 1 }, {} as any)).toEqual({ a: 1 });
  });

  it('ZVP-002: throws BadRequestException with issue details when validation fails', () => {
    const pipe = new ZodValidationPipe(z.object({ a: z.number() }));
    expect(() => pipe.transform({ a: 'not-a-number' }, {} as any)).toThrow(BadRequestException);
  });

  it('ZVP-003 (UpdateAuthSchema): rejects a body missing the type field', () => {
    const pipe = new ZodValidationPipe(UpdateAuthSchema);
    expect(() => pipe.transform({ access_token: 'x' }, {} as any)).toThrow(BadRequestException);
  });

  it('ZVP-004 (UpdateAuthSchema): rejects a body with an empty-string type', () => {
    const pipe = new ZodValidationPipe(UpdateAuthSchema);
    expect(() => pipe.transform({ type: '   ' }, {} as any)).toThrow(BadRequestException);
  });

  it('ZVP-005 (UpdateAuthSchema): accepts a body with a valid type field', () => {
    const pipe = new ZodValidationPipe(UpdateAuthSchema);
    const value = { type: 'OAUTH2', access_token: 'x' };
    expect(pipe.transform(value, {} as any)).toEqual(value);
  });
});
