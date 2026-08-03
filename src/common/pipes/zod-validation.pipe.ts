import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * Validates/transforms a request body against a Zod schema. On failure throws a 400 with a
 * flattened, readable error message — this is a dev tool, verbose errors are a feature.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
