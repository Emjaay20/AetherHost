import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { SecretVaultService } from '../../common/crypto/secret-vault.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacefastClient, SpacefastIdentity } from './spacefast.client';

const PROVIDER = 'spacefast';
const OAUTH_BASE_URL = 'https://api.spacefast.com/v1/auth';
const REQUESTED_SCOPES = ['teams:read', 'spaces:read', 'spaces:write', 'publish:write', 'offline_access'];
const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthTokens = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
type Team = { id: string; slug?: string; name?: string };

@Injectable()
export class SpacefastOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: SecretVaultService,
    private readonly config: ConfigService,
  ) {}

  isConfigured() {
    return Boolean(
      this.clientId()
      && this.clientSecret()
      && this.redirectUri()?.startsWith('https://')
      && this.config.get<string>('SPACEFAST_OAUTH_SUCCESS_REDIRECT')?.trim().startsWith('https://'),
    );
  }

  async status(tenantId: string) {
    const connection = await this.prisma.externalProviderConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: PROVIDER } },
      select: { teamId: true, status: true, expiresAt: true, connectedAt: true, updatedAt: true, grantedScopes: true },
    });
    if (!this.isConfigured()) {
      return { configured: false, connected: false, needsTeam: false, message: 'Customer-owned Spacefast connections are not configured yet.' };
    }
    if (!connection) {
      return { configured: true, connected: false, needsTeam: false, message: 'Connect your Spacefast account to publish using your own team.' };
    }
    return {
      configured: true,
      connected: connection.status === 'connected',
      needsTeam: connection.status === 'needs_team',
      teamId: connection.teamId,
      expiresAt: connection.expiresAt,
      connectedAt: connection.connectedAt,
      updatedAt: connection.updatedAt,
      grantedScopes: connection.grantedScopes,
      message: connection.status === 'needs_team' ? 'Choose which Spacefast team to use for private publishing.' : 'Your Spacefast connection is active.',
    };
  }

  async begin(tenantId: string) {
    this.requireConfiguration();
    await this.prisma.externalProviderOAuthState.deleteMany({
      where: { tenantId, provider: PROVIDER },
    });
    const state = base64Url(randomBytes(32));
    const verifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash('sha256').update(verifier).digest());
    await this.prisma.externalProviderOAuthState.create({
      data: {
        tenantId,
        provider: PROVIDER,
        stateHash: sha256(state),
        codeVerifierPayload: this.vault.encrypt({ verifier }) as object,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    await this.audit(tenantId, 'EXTERNAL_PROVIDER_OAUTH_STARTED', { provider: PROVIDER });
    const url = new URL(`${OAUTH_BASE_URL}/oauth2/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId()!);
    url.searchParams.set('redirect_uri', this.redirectUri()!);
    url.searchParams.set('scope', REQUESTED_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { authorizationUrl: url.toString() };
  }

  async complete(input: { state?: string; code?: string; error?: string; errorDescription?: string }) {
    const state = input.state?.trim();
    if (!state) throw new BadRequestException('Missing OAuth state');
    const pending = await this.prisma.externalProviderOAuthState.findUnique({ where: { stateHash: sha256(state) } });
    if (!pending || pending.provider !== PROVIDER || pending.expiresAt.getTime() < Date.now()) {
      if (pending) await this.prisma.externalProviderOAuthState.delete({ where: { id: pending.id } });
      throw new BadRequestException('This connection request has expired or was already used. Start again from AetherHost.');
    }
    await this.prisma.externalProviderOAuthState.delete({ where: { id: pending.id } });
    if (input.error || !input.code) {
      await this.audit(pending.tenantId, 'EXTERNAL_PROVIDER_OAUTH_DENIED', { provider: PROVIDER, error: input.error ?? 'missing_code' });
      throw new BadRequestException('Spacefast did not approve the connection.');
    }
    try {
      const verifier = this.vault.decrypt(pending.codeVerifierPayload).verifier;
      if (!verifier) throw new Error('OAuth verifier unavailable');
      const tokens = await this.exchangeCode(input.code, verifier);
      const identity = await this.identity(tokens.access_token);
      const teams = identity.teams ?? [];
      const teamId = teams.length === 1 ? teams[0].id : null;
      await this.prisma.externalProviderConnection.upsert({
        where: { tenantId_provider: { tenantId: pending.tenantId, provider: PROVIDER } },
        create: {
          tenantId: pending.tenantId, provider: PROVIDER, teamId,
          status: teamId ? 'connected' : 'needs_team',
          tokenPayload: this.encryptTokens(tokens) as object,
          expiresAt: expiry(tokens), grantedScopes: scopes(tokens),
        },
        update: {
          teamId, status: teamId ? 'connected' : 'needs_team',
          tokenPayload: this.encryptTokens(tokens) as object,
          expiresAt: expiry(tokens), grantedScopes: scopes(tokens), connectedAt: new Date(),
        },
      });
      await this.audit(pending.tenantId, 'EXTERNAL_PROVIDER_OAUTH_CONNECTED', { provider: PROVIDER, teamSelected: Boolean(teamId) });
      return this.successRedirect(teamId ? 'connected' : 'choose-team');
    } catch (error) {
      await this.audit(pending.tenantId, 'EXTERNAL_PROVIDER_OAUTH_FAILED', { provider: PROVIDER, error: 'token_exchange_failed' });
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('Spacefast could not complete the connection. Start again from AetherHost.');
    }
  }

  async teams(tenantId: string): Promise<Team[]> {
    const { client } = await this.clientForTenant(tenantId);
    return (await client.getIdentity()).teams ?? [];
  }

  async selectTeam(tenantId: string, teamId: string) {
    if (!teamId.trim()) throw new BadRequestException('A Spacefast team is required');
    const teams = await this.teams(tenantId);
    if (!teams.some((team) => team.id === teamId)) throw new BadRequestException('The selected team is not available to this Spacefast connection');
    await this.prisma.externalProviderConnection.update({
      where: { tenantId_provider: { tenantId, provider: PROVIDER } },
      data: { teamId, status: 'connected' },
    });
    await this.audit(tenantId, 'EXTERNAL_PROVIDER_TEAM_SELECTED', { provider: PROVIDER, teamId });
    return this.status(tenantId);
  }

  async disconnect(tenantId: string) {
    const connection = await this.prisma.externalProviderConnection.findUnique({ where: { tenantId_provider: { tenantId, provider: PROVIDER } } });
    if (!connection) return;
    await this.prisma.externalProviderConnection.delete({ where: { id: connection.id } });
    await this.audit(tenantId, 'EXTERNAL_PROVIDER_OAUTH_DISCONNECTED', { provider: PROVIDER });
  }

  async publisherForTenant(tenantId: string): Promise<{ client: SpacefastClient; teamId: string } | null> {
    const connection = await this.prisma.externalProviderConnection.findUnique({ where: { tenantId_provider: { tenantId, provider: PROVIDER } } });
    if (!connection || connection.status !== 'connected' || !connection.teamId) return null;
    const { client } = await this.clientForTenant(tenantId, connection);
    return { client, teamId: connection.teamId };
  }

  private async clientForTenant(tenantId: string, existing?: { id: string; tokenPayload: unknown; expiresAt: Date | null }) {
    const connection = existing ?? await this.prisma.externalProviderConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: PROVIDER } },
    });
    if (!connection) throw new NotFoundException('No Spacefast connection exists for this tenant');
    let tokens = this.decryptTokens(connection.tokenPayload);
    if (!tokens.access_token) throw new ServiceUnavailableException('The stored Spacefast connection is invalid. Reconnect it from AetherHost.');
    if (connection.expiresAt && connection.expiresAt.getTime() < Date.now() + 60_000) {
      if (!tokens.refresh_token) throw new ServiceUnavailableException('The Spacefast connection has expired. Reconnect it from AetherHost.');
      const refreshed = await this.refresh(tokens.refresh_token);
      // OAuth servers may omit refresh_token when the existing token remains
      // valid; retain it unless the provider explicitly rotates it.
      tokens = { ...refreshed, refresh_token: refreshed.refresh_token ?? tokens.refresh_token };
      await this.prisma.externalProviderConnection.update({
        where: { id: connection.id },
        data: { tokenPayload: this.encryptTokens(tokens) as object, expiresAt: expiry(tokens), grantedScopes: scopes(tokens) },
      });
    }
    return { client: SpacefastClient.fromAccessToken(tokens.access_token, this.apiBaseUrl()) };
  }

  private async exchangeCode(code: string, codeVerifier: string): Promise<OAuthTokens> {
    return this.tokenRequest({
      grant_type: 'authorization_code', code, code_verifier: codeVerifier,
      redirect_uri: this.redirectUri()!,
    });
  }

  private async refresh(refreshToken: string): Promise<OAuthTokens> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async tokenRequest(parameters: Record<string, string>): Promise<OAuthTokens> {
    this.requireConfiguration();
    const body = new URLSearchParams({
      ...parameters, client_id: this.clientId()!, client_secret: this.clientSecret()!,
    });
    const response = await fetch(`${OAUTH_BASE_URL}/oauth2/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body,
    });
    if (!response.ok) throw new Error(`Spacefast OAuth token endpoint returned ${response.status}`);
    const payload = await response.json() as OAuthTokens;
    if (!payload.access_token) throw new Error('Spacefast OAuth response did not include an access token');
    return payload;
  }

  private identity(accessToken: string): Promise<SpacefastIdentity> {
    return SpacefastClient.fromAccessToken(accessToken, this.apiBaseUrl()).getIdentity();
  }

  private encryptTokens(tokens: OAuthTokens) {
    return this.vault.encrypt({
      access_token: tokens.access_token,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      ...(tokens.expires_in ? { expires_in: String(tokens.expires_in) } : {}),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
    });
  }

  private decryptTokens(payload: unknown): OAuthTokens {
    const tokens = this.vault.decrypt(payload);
    return { access_token: tokens.access_token ?? '', refresh_token: tokens.refresh_token, expires_in: Number(tokens.expires_in) || undefined, scope: tokens.scope };
  }

  private clientId() { return this.config.get<string>('SPACEFAST_OAUTH_CLIENT_ID')?.trim(); }
  private clientSecret() { return this.config.get<string>('SPACEFAST_OAUTH_CLIENT_SECRET')?.trim(); }
  private redirectUri() { return this.config.get<string>('SPACEFAST_OAUTH_REDIRECT_URI')?.trim(); }
  private apiBaseUrl() { return this.config.get<string>('SPACEFAST_API_BASE_URL')?.trim() || 'https://api.spacefast.com'; }
  private requireConfiguration() {
    if (!this.isConfigured()) throw new ServiceUnavailableException('Customer-owned Spacefast connections are not configured by the operator.');
  }
  private successRedirect(status: string) {
    const configured = this.config.get<string>('SPACEFAST_OAUTH_SUCCESS_REDIRECT')?.trim();
    if (!configured?.startsWith('https://')) throw new ServiceUnavailableException('Spacefast OAuth success redirect is not configured.');
    const url = new URL(configured);
    url.searchParams.set('spacefast', status);
    return url.toString();
  }
  private async audit(tenantId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({ data: { tenantId, action, metadata: JSON.parse(JSON.stringify(metadata)) } });
  }
}

function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
function base64Url(value: Buffer) { return value.toString('base64url'); }
function expiry(tokens: OAuthTokens) { return tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null; }
function scopes(tokens: OAuthTokens) { return (tokens.scope?.split(/\s+/).filter(Boolean) ?? REQUESTED_SCOPES); }
