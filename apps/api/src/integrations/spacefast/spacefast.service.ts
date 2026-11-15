import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpacefastClient } from './spacefast.client';

export type SpacefastConnectionStatus = {
  enabled: boolean;
  configured: boolean;
  teamIdConfigured: boolean;
  authenticated?: boolean;
  providerRequestId?: string;
  errorCode?: string;
  message: string;
};

/**
 * Operator-owned Spacefast connection.
 *
 * Provider credentials stay operator-owned. Tenant consent and artifact
 * selection are recorded separately by SpacefastTenantService.
 */
@Injectable()
export class SpacefastService {
  private readonly logger = new Logger(SpacefastService.name);

  constructor(private readonly config: ConfigService) {}

  getStatus(): SpacefastConnectionStatus {
    const enabled = this.config.get<string>('SPACEFAST_ENABLED') === 'true';
    const keyPresent = Boolean(this.config.get<string>('SPACEFAST_API_KEY')?.trim());
    const teamIdConfigured = Boolean(this.config.get<string>('SPACEFAST_TEAM_ID')?.trim());
    return {
      enabled,
      configured: enabled && keyPresent,
      teamIdConfigured,
      message: !enabled
        ? 'Spacefast is disabled.'
        : !keyPresent
          ? 'Spacefast is enabled but no server-side credential is configured.'
          : !teamIdConfigured
            ? 'Spacefast credential is configured; choose the target team before publishing.'
            : 'Spacefast is configured. Publishing remains opt-in per external frontend.',
    };
  }

  async verifyConnection(): Promise<SpacefastConnectionStatus> {
    const status = this.getStatus();
    if (!status.configured) {
      return status;
    }

    try {
      const identity = await this.client().getIdentity();
      const teamId = this.config.get<string>('SPACEFAST_TEAM_ID')?.trim();
      const teamFound = !teamId || identity.teams?.some((team) => team.id === teamId);
      return {
        ...status,
        authenticated: true,
        message: teamFound
          ? 'Spacefast credential verified.'
          : 'Spacefast credential verified, but it cannot access the configured team.',
      };
    } catch (error) {
      const provider = error as { requestId?: string; code?: string; message?: string };
      this.logger.warn(`Spacefast credential verification failed: ${provider.code ?? 'unknown_error'}`);
      return {
        ...status,
        authenticated: false,
        providerRequestId: provider.requestId,
        errorCode: provider.code,
        message: 'Spacefast credential could not be verified. Check its scope, expiry, or configured team.',
      };
    }
  }

  publisher(): { client: SpacefastClient; teamId: string } {
    const status = this.getStatus();
    const teamId = this.config.get<string>('SPACEFAST_TEAM_ID')?.trim();
    if (!status.configured || !teamId) {
      throw new Error('Spacefast publishing is not configured');
    }
    return { client: this.client(), teamId };
  }

  private client(): SpacefastClient {
    const client = SpacefastClient.fromEnvironment({
      SPACEFAST_ENABLED: this.config.get<string>('SPACEFAST_ENABLED'),
      SPACEFAST_API_KEY: this.config.get<string>('SPACEFAST_API_KEY'),
      SPACEFAST_API_BASE_URL: this.config.get<string>('SPACEFAST_API_BASE_URL'),
    });
    if (!client) {
      throw new Error('Spacefast is disabled');
    }
    return client;
  }
}
