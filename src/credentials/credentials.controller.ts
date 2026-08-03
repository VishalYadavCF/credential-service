import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CredentialsService } from './services/credentials.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UpdateAuthDto, UpdateAuthSchema } from './dto/update-auth.dto';

/**
 * Stub of ap-executor's upstream credential service. Routes match
 * `DbEncryptedCredentialService` exactly (`GET|POST /v1/credentials/internal/:credentialId`)
 * so `CREDENTIAL_SERVICE_URL` needs no path rewriting — just point it at this service.
 */
@Controller('v1/credentials/internal')
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  // Registered before the ':credentialId' route so Nest doesn't try to parse "internal" list
  // calls as an id — literal routes are matched first in Express anyway, but keep it explicit.
  @Get()
  list() {
    return this.credentialsService.listCredentials();
  }

  @Get(':credentialId')
  getOne(@Param('credentialId', ParseIntPipe) credentialId: number) {
    return this.credentialsService.getCredential(credentialId);
  }

  @Post(':credentialId')
  update(
    @Param('credentialId', ParseIntPipe) credentialId: number,
    @Body(new ZodValidationPipe(UpdateAuthSchema)) body: UpdateAuthDto,
  ) {
    return this.credentialsService.updateCredential(credentialId, body as Record<string, unknown>);
  }
}
