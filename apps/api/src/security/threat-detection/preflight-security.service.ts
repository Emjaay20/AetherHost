import {
  Injectable,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelFactory } from '../../ai/model.factory';
import {
  KNOWN_BLOCKED_IDENTITIES,
  BUILTIN_HEURISTIC_RULES,
  ThreatIndicator,
  HeuristicThreatRule,
} from './known-threats';

export interface PreflightCheckResult {
  allowed: boolean;
  violation?: {
    category: string;
    ruleName: string;
    details: string;
    matchedPattern?: string;
  };
}

@Injectable()
export class PreflightSecurityService {
  private readonly logger = new Logger(PreflightSecurityService.name);
  private readonly inMemoryLearnedRules: HeuristicThreatRule[] = [];
  private readonly inMemoryBlockedIdentities = new Map<string, string>();

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly modelFactory?: ModelFactory,
  ) {
    for (const ind of KNOWN_BLOCKED_IDENTITIES) {
      this.inMemoryBlockedIdentities.set(ind.value.toLowerCase(), ind.reason);
    }
  }

  /**
   * Evaluates whether a given actor identity (email, GitHub username, GitHub ID)
   * is blocked from operating on the platform.
   */
  async isIdentityBlocked(identity: {
    email?: string;
    githubLogin?: string;
    githubId?: string;
    tenantId?: string;
    repo?: string;
  }): Promise<{ blocked: boolean; reason?: string }> {
    const candidates = [
      identity.email?.trim().toLowerCase(),
      identity.githubLogin?.trim().toLowerCase(),
      identity.githubId?.trim(),
      identity.tenantId?.trim(),
      identity.repo?.trim().toLowerCase(),
    ].filter((v): v is string => Boolean(v));

    for (const candidate of candidates) {
      const reason = this.inMemoryBlockedIdentities.get(candidate);
      if (reason) {
        this.logger.warn(`Blocked identity match (in-memory): ${candidate} -> ${reason}`);
        return { blocked: true, reason };
      }
    }

    if (identity.repo) {
      const repoLower = identity.repo.toLowerCase();
      for (const [val, reason] of this.inMemoryBlockedIdentities.entries()) {
        if (repoLower.includes(val)) {
          this.logger.warn(`Blocked repo match (in-memory substring): ${identity.repo} matches ${val} -> ${reason}`);
          return { blocked: true, reason };
        }
      }
    }

    if (this.prisma) {
      try {
        const matches = await (this.prisma as any).securityBlocklist.findMany({
          where: {
            value: {
              in: candidates,
              mode: 'insensitive',
            },
          },
        });
        if (matches && matches.length > 0) {
          const match = matches[0];
          this.inMemoryBlockedIdentities.set(match.value.toLowerCase(), match.reason);
          this.logger.warn(`Blocked identity match (database): ${match.value} -> ${match.reason}`);
          return { blocked: true, reason: match.reason };
        }
      } catch (err) {
        // Table may not yet be migrated in some environments; fallback gracefully
        this.logger.debug(`Database blocklist check error: ${err}`);
      }
    }

    return { blocked: false };
  }

  /**
   * Persists a newly identified threat identity or pattern so it is learned and
   * enforced continuously for all subsequent workload submissions.
   */
  async recordLearnedThreat(threat: {
    type: 'email' | 'github_user' | 'github_id' | 'repo' | 'domain';
    value: string;
    reason: string;
  }): Promise<void> {
    const val = threat.value.trim().toLowerCase();
    this.inMemoryBlockedIdentities.set(val, threat.reason);
    this.logger.log(`Security engine learned new blocked identity: [${threat.type}] ${val}`);

    if (this.prisma) {
      try {
        await (this.prisma as any).securityBlocklist.upsert({
          where: { value: val },
          create: {
            type: threat.type,
            value: val,
            reason: threat.reason,
          },
          update: {
            reason: threat.reason,
          },
        });
      } catch (err) {
        this.logger.debug(`Could not persist learned threat to database: ${err}`);
      }
    }
  }

  /**
   * Fast deterministic heuristic scanner inspecting files, file paths, and environment variables.
   */
  scanContentWithHeuristics(
    files: Array<{ path: string; content: string }>,
    envVars?: Record<string, string>,
  ): { safe: boolean; ruleName?: string; category?: string; details?: string } {
    const allRules = [...BUILTIN_HEURISTIC_RULES, ...this.inMemoryLearnedRules];

    // 1. Scan environment variables
    if (envVars) {
      for (const [key, val] of Object.entries(envVars)) {
        const line = `${key}=${val}`;
        for (const rule of allRules) {
          if (rule.regex.test(line)) {
            return {
              safe: false,
              ruleName: rule.name,
              category: rule.category,
              details: `Disallowed security pattern matched in environment variable ${key}: ${rule.description}`,
            };
          }
        }
      }
    }

    // 2. Scan file paths and contents
    for (const file of files) {
      const pathAndContent = `${file.path}\n${file.content}`;
      for (const rule of allRules) {
        if (rule.regex.test(pathAndContent)) {
          return {
            safe: false,
            ruleName: rule.name,
            category: rule.category,
            details: `Disallowed security pattern in "${file.path}": ${rule.description}`,
          };
        }
      }
    }

    return { safe: true };
  }

  /**
   * AI-powered deep pattern analysis using LLM when heuristics identify suspicious indicators
   * (e.g. unknown external binary downloads, dynamic IP lookup paired with background agent spawning).
   */
  async analyzeWithAi(
    files: Array<{ path: string; content: string }>,
    appName: string,
  ): Promise<{ isMalicious: boolean; reason: string; category?: string; learnedPatterns?: string[] }> {
    if (!this.modelFactory) {
      return { isMalicious: false, reason: 'AI model factory not available' };
    }

    // Identify files with suspicious activity (fetching remote executables, spawning child processes)
    const suspiciousFiles = files.filter((f) =>
      /(?:child_process|spawn|execFile|download|http\.get|fetch|chmod|\.tar\.gz|\.zip|github\.com\/.*\/releases)/i.test(
        f.content,
      ),
    );

    if (suspiciousFiles.length === 0) {
      return { isMalicious: false, reason: 'No suspicious execution primitives found' };
    }

    const snippetSummary = suspiciousFiles
      .slice(0, 3)
      .map((f) => `FILE: ${f.path}\nCONTENT:\n${f.content.slice(0, 1500)}`)
      .join('\n\n---\n\n');

    const prompt = `You are the AetherHost Application Security Sentinel.
Analyze the following workload code for malicious intent such as:
- Command and Control (C2) agents (e.g., Nezha, Cobalt Strike, RATs)
- Cryptocurrency miners (e.g., XMRig)
- Disguised background processes or disguised top/ps tools in /tmp
- Unauthorized reverse shells or tunnels

Workload Name: ${appName}
Code Excerpt:
${snippetSummary}

Respond ONLY with valid JSON in this exact structure:
{
  "isMalicious": true|false,
  "threatCategory": "c2_rat"|"crypto_miner"|"reverse_shell"|"benign",
  "reason": "Clear explanation of malicious behavior",
  "learnedPatterns": ["regex or keyword to remember"]
}`;

    try {
      const adapter = this.modelFactory.get();
      const response = await adapter.complete({
        tenantId: 'SYSTEM',
        prompt,
        purpose: 'security_preflight_analysis',
      });

      const parsed = JSON.parse(response.output.replace(/```json|```/g, '').trim());
      if (parsed.isMalicious) {
        if (Array.isArray(parsed.learnedPatterns)) {
          for (const patternStr of parsed.learnedPatterns) {
            try {
              const rule: HeuristicThreatRule = {
                name: `learned_${Date.now()}`,
                category: parsed.threatCategory || 'c2_rat',
                regex: new RegExp(patternStr, 'i'),
                description: `Learned threat pattern: ${parsed.reason}`,
                severity: 'CRITICAL',
              };
              this.inMemoryLearnedRules.push(rule);
            } catch {}
          }
        }
        return {
          isMalicious: true,
          reason: parsed.reason,
          category: parsed.threatCategory,
          learnedPatterns: parsed.learnedPatterns,
        };
      }
    } catch (err) {
      this.logger.debug(`AI security analysis skipped or failed: ${err}`);
    }

    return { isMalicious: false, reason: 'Passed AI inspection' };
  }

  /**
   * Main preflight gate called during workload creation or source update.
   */
  async enforcePreflight(
    tenantId: string,
    options: {
      name: string;
      runtime: string;
      githubRepo?: string;
      files?: Array<{ path: string; content: string }>;
      envVars?: Record<string, string>;
      dockerImage?: string;
      workerCommand?: string;
      actorIdentity?: { email?: string; githubLogin?: string; githubId?: string };
    },
  ): Promise<void> {
    // 1. Identity Check
    const identityCheck = await this.isIdentityBlocked({
      tenantId,
      email: options.actorIdentity?.email,
      githubLogin: options.actorIdentity?.githubLogin,
      githubId: options.actorIdentity?.githubId,
    });

    if (identityCheck.blocked) {
      this.logger.error(
        `Preflight rejected: Tenant ${tenantId} blocked by identity rule: ${identityCheck.reason}`,
      );
      if (this.prisma) {
        await this.prisma.tenant
          .update({
            where: { id: tenantId },
            data: { subscriptionStatus: 'suspended' },
          })
          .catch(() => {});
      }
      throw new ForbiddenException(
        `Security Policy Violation: Account identity is blocked (${identityCheck.reason})`,
      );
    }

    // 2. Check Repository URL against blocked patterns
    if (options.githubRepo) {
      const repoUrl = options.githubRepo.toLowerCase();
      for (const [blockedVal, reason] of this.inMemoryBlockedIdentities.entries()) {
        if (repoUrl.includes(blockedVal)) {
          this.logger.error(`Preflight rejected: Repo URL ${options.githubRepo} matches blocked value: ${blockedVal}`);
          throw new ForbiddenException(
            `Security Policy Violation: Connected repository is blocked (${reason})`,
          );
        }
      }
    }

    // 3. Heuristic Code & Content Screening
    if (options.files && options.files.length > 0) {
      const heuristicResult = this.scanContentWithHeuristics(options.files, options.envVars);
      if (!heuristicResult.safe) {
        this.logger.error(
          `Preflight rejected: Workload "${options.name}" failed heuristic security rule [${heuristicResult.ruleName}]: ${heuristicResult.details}`,
        );

        // Record audit violation
        if (this.prisma) {
          await this.prisma.auditLog
            .create({
              data: {
                tenantId,
                action: 'SECURITY_PREFLIGHT_VIOLATION',
                metadata: {
                  appName: options.name,
                  ruleName: heuristicResult.ruleName,
                  category: heuristicResult.category,
                  details: heuristicResult.details,
                  repo: options.githubRepo,
                },
              },
            })
            .catch(() => {});

          // Auto-suspend repeat offenders
          await this.prisma.tenant
            .update({
              where: { id: tenantId },
              data: { subscriptionStatus: 'suspended' },
            })
            .catch(() => {});
        }

        throw new ForbiddenException(
          `Security Policy Violation: ${heuristicResult.details}`,
        );
      }

      // 4. AI Deep Scan (if suspicious primitives exist)
      const aiResult = await this.analyzeWithAi(options.files, options.name);
      if (aiResult.isMalicious) {
        this.logger.error(
          `Preflight rejected: Workload "${options.name}" flagged malicious by AI analysis: ${aiResult.reason}`,
        );

        if (this.prisma) {
          await this.prisma.auditLog
            .create({
              data: {
                tenantId,
                action: 'SECURITY_AI_SCAN_VIOLATION',
                metadata: {
                  appName: options.name,
                  category: aiResult.category,
                  reason: aiResult.reason,
                  repo: options.githubRepo,
                },
              },
            })
            .catch(() => {});

          await this.prisma.tenant
            .update({
              where: { id: tenantId },
              data: { subscriptionStatus: 'suspended' },
            })
            .catch(() => {});
        }

        throw new ForbiddenException(
          `Security Policy Violation: Workload flagged for malicious remote-control activity (${aiResult.reason})`,
        );
      }
    }
  }
}
