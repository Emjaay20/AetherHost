import {
  Injectable,
  ForbiddenException,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelFactory } from '../../ai/model.factory';
import { redactSensitiveLogContent } from '../../applications/log-redaction';
import { normalizeRepoFullName, getGithubToken } from '../../applications/github-utils';
import {
  KNOWN_BLOCKED_IDENTITIES,
  BUILTIN_HEURISTIC_RULES,
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

export interface StagedThreatRule {
  name: string;
  category: string;
  pattern: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  source: 'AI_SENTINEL' | 'OPERATOR' | 'BUILTIN';
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

const BENIGN_VALIDATION_CORPUS = [
  'const express = require("express"); const app = express(); app.get("/health", (req, res) => res.send("OK")); app.listen(3000);',
  'import { NestFactory } from "@nestjs/core"; import { AppModule } from "./app.module"; async function bootstrap() { const app = await NestFactory.create(AppModule); await app.listen(3000); } bootstrap();',
  '{"name": "my-web-app", "version": "1.0.0", "scripts": {"start": "node dist/main.js", "build": "tsc"}, "dependencies": {"express": "^4.18.2"}}',
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Welcome</title></head><body><h1>Hello World</h1></body></html>',
  'FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]',
];

const REPO_INSPECTION_PATHS = [
  'Dockerfile',
  'docker-compose.yml',
  'package.json',
  'entrypoint.sh',
  'start.sh',
  'index.js',
  'server.js',
];

const SUSPICIOUS_LINE_REGEX =
  /(?:child_process|spawn|execFile|execSync|\bexec\b|download|http\.get|https\.get|fetch|chmod|curl|wget|nc\b|netcat|socat|\/tmp\/|\/dev\/tcp|\/dev\/shm|\.tar\.gz|\.zip|releases\/download|stratum|xmrig|nezha|base64)/i;

@Injectable()
export class PreflightSecurityService {
  private readonly logger = new Logger(PreflightSecurityService.name);
  private readonly inMemoryLearnedRules: HeuristicThreatRule[] = [];
  private readonly inMemoryStagedRules = new Map<string, StagedThreatRule>();
  private readonly inMemoryBlockedIdentities = new Map<string, string>();
  private dbLookupDegraded = false;
  private lastDbError: string | null = null;
  private lastRulesSyncAt = 0;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly modelFactory?: ModelFactory,
  ) {
    for (const ind of KNOWN_BLOCKED_IDENTITIES) {
      this.inMemoryBlockedIdentities.set(ind.value.toLowerCase(), ind.reason);
    }
  }

  /**
   * Reports operational health of the security subsystem, including whether
   * PostgreSQL blocklist lookups have experienced degraded connectivity.
   */
  getSecurityHealth() {
    return {
      status: this.dbLookupDegraded ? ('degraded' as const) : ('healthy' as const),
      dbLookupDegraded: this.dbLookupDegraded,
      lastDbError: this.lastDbError,
      activeHeuristicRules:
        BUILTIN_HEURISTIC_RULES.length + this.inMemoryLearnedRules.length,
      stagedRulesPendingReview: Array.from(this.inMemoryStagedRules.values()).filter(
        (r) => r.status === 'PENDING_REVIEW',
      ).length,
      blockedIdentityIndicators: this.inMemoryBlockedIdentities.size,
    };
  }

  /**
   * Evaluates whether a given actor identity (email, GitHub username, GitHub ID, repo)
   * is blocked from operating on the platform.
   * Supports explicit fail-closed enforcement for sensitive operations.
   */
  async isIdentityBlocked(identity: {
    email?: string;
    githubLogin?: string;
    githubId?: string;
    tenantId?: string;
    repo?: string;
    failClosed?: boolean;
  }): Promise<{ blocked: boolean; reason?: string; degraded?: boolean }> {
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
          this.logger.warn(
            `Blocked repo match (in-memory substring): ${identity.repo} matches ${val} -> ${reason}`,
          );
          return { blocked: true, reason };
        }
      }
    }

    if (this.prisma && candidates.length > 0) {
      try {
        const blocklistDelegate = (this.prisma as any).securityBlocklist;
        if (blocklistDelegate && typeof blocklistDelegate.findMany === 'function') {
          const matches = await blocklistDelegate.findMany({
            where: {
              value: {
                in: candidates,
                mode: 'insensitive',
              },
            },
          });
          this.dbLookupDegraded = false;
          this.lastDbError = null;
          if (matches && matches.length > 0) {
            const match = matches[0];
            this.inMemoryBlockedIdentities.set(match.value.toLowerCase(), match.reason);
            this.logger.warn(
              `Blocked identity match (database): ${match.value} -> ${match.reason}`,
            );
            return { blocked: true, reason: match.reason };
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.dbLookupDegraded = true;
        this.lastDbError = errMsg;
        this.logger.warn(`Database blocklist lookup degraded: ${errMsg}`);

        const enforceFailClosed =
          identity.failClosed === true ||
          process.env.SECURITY_FAIL_CLOSED === 'true';
        if (enforceFailClosed) {
          throw new ServiceUnavailableException(
            'Security verification database is temporarily unavailable (fail-closed policy active)',
          );
        }
        return { blocked: false, degraded: true };
      }
    }

    return { blocked: false };
  }

  /**
   * Persists a confirmed threat identity indicator to memory and PostgreSQL.
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
        await (this.prisma as any).securityBlocklist?.upsert({
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
        this.dbLookupDegraded = true;
        this.lastDbError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not persist learned threat to database: ${this.lastDbError}`);
      }
    }
  }

  /**
   * Validates a candidate regular expression pattern before staging or enforcement.
   * Prevents catastrophic backtracking (ReDoS), wildcard match-alls, and false positives
   * against standard benign application templates.
   */
  validateLearnedRegexPattern(patternStr: string): { valid: boolean; reason?: string } {
    const trimmed = (patternStr || '').trim();
    if (trimmed.length < 6) {
      return { valid: false, reason: 'Pattern is too short (minimum 6 characters required)' };
    }
    if (trimmed.length > 200) {
      return { valid: false, reason: 'Pattern exceeds maximum safe length (200 characters)' };
    }

    // Reject match-all or trivial wildcard patterns
    if (/^(?:\.\*|\.\+|\[\^[^\]]*\]\*|\[\^[^\]]*\]\+|\\s\*|\\S\*|\^|\$)+$/i.test(trimmed)) {
      return { valid: false, reason: 'Pattern is an overly broad wildcard' };
    }

    // Require at least 4 literal alphanumeric characters so rules remain specific
    const alphaNumCount = (trimmed.replace(/\\[a-zA-Z]/g, '').match(/[a-zA-Z0-9]/g) || []).length;
    if (alphaNumCount < 4) {
      return {
        valid: false,
        reason: 'Pattern lacks sufficient literal specificity (at least 4 alphanumeric characters required)',
      };
    }

    // Reject nested quantifiers that risk catastrophic backtracking (ReDoS)
    if (/(\+|\*|\{[0-9,]+\})\s*\)\s*(\+|\*|\?|\{[0-9,]+\})/.test(trimmed)) {
      return {
        valid: false,
        reason: 'Pattern contains nested quantifiers with catastrophic backtracking (ReDoS) risk',
      };
    }

    let compiled: RegExp;
    try {
      compiled = new RegExp(trimmed, 'i');
    } catch (err) {
      return {
        valid: false,
        reason: `Invalid regular expression syntax: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    for (const benignSample of BENIGN_VALIDATION_CORPUS) {
      if (compiled.test(benignSample)) {
        return {
          valid: false,
          reason: 'Pattern falsely matches benign application boilerplate corpus',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Stages a validated threat rule for operator approval (or immediately approves if verified).
   * Persists both the rule and an audit trail record when Prisma is available.
   */
  async stageLearnedRule(options: {
    name?: string;
    category: string;
    pattern: string;
    description: string;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    source?: 'AI_SENTINEL' | 'OPERATOR';
    autoApprove?: boolean;
    approvedBy?: string;
  }): Promise<{ staged: boolean; approved: boolean; ruleName?: string; reason?: string }> {
    const validation = this.validateLearnedRegexPattern(options.pattern);
    if (!validation.valid) {
      this.logger.warn(
        `Rejected unsafe candidate threat pattern "${options.pattern}": ${validation.reason}`,
      );
      return { staged: false, approved: false, reason: validation.reason };
    }

    const ruleName =
      options.name ||
      `learned_${options.category}_${Buffer.from(options.pattern).toString('hex').slice(0, 12)}`;
    const approved = options.autoApprove === true;
    const nowIso = new Date().toISOString();

    const stagedRule: StagedThreatRule = {
      name: ruleName,
      category: options.category,
      pattern: options.pattern.trim(),
      description: options.description,
      severity: options.severity || 'CRITICAL',
      status: approved ? 'APPROVED' : 'PENDING_REVIEW',
      source: options.source || 'AI_SENTINEL',
      createdAt: nowIso,
      ...(approved
        ? {
            approvedBy: options.approvedBy || 'SYSTEM_VERIFIED',
            approvedAt: nowIso,
          }
        : {}),
    };

    this.inMemoryStagedRules.set(ruleName, stagedRule);

    if (approved) {
      this.activateRuleInMemory(stagedRule);
    }

    if (this.prisma) {
      try {
        await (this.prisma as any).securityThreatRule?.upsert({
          where: { name: ruleName },
          create: {
            name: ruleName,
            category: stagedRule.category,
            pattern: stagedRule.pattern,
            severity: stagedRule.severity,
            description: stagedRule.description,
            enabled: approved,
            status: stagedRule.status,
            source: stagedRule.source,
            approvedBy: stagedRule.approvedBy ?? null,
            approvedAt: approved ? new Date() : null,
          },
          update: {
            pattern: stagedRule.pattern,
            description: stagedRule.description,
            enabled: approved,
            status: stagedRule.status,
            approvedBy: stagedRule.approvedBy ?? null,
            approvedAt: approved ? new Date() : null,
          },
        });
      } catch (err) {
        this.logger.debug(`Could not persist threat rule ${ruleName}: ${err}`);
      }
    }

    return { staged: true, approved, ruleName };
  }

  /**
   * Operator approval gate to promote a staged AI rule into active heuristic enforcement.
   */
  async approveLearnedRule(
    ruleNameOrPattern: string,
    approvedBy = 'operator',
  ): Promise<{ approved: boolean; ruleName?: string; reason?: string }> {
    let target = this.inMemoryStagedRules.get(ruleNameOrPattern);
    if (!target) {
      for (const candidate of this.inMemoryStagedRules.values()) {
        if (candidate.pattern === ruleNameOrPattern) {
          target = candidate;
          break;
        }
      }
    }

    if (!target) {
      return { approved: false, reason: `Staged rule "${ruleNameOrPattern}" not found` };
    }

    const validation = this.validateLearnedRegexPattern(target.pattern);
    if (!validation.valid) {
      target.status = 'REJECTED';
      return { approved: false, reason: validation.reason };
    }

    target.status = 'APPROVED';
    target.approvedBy = approvedBy;
    target.approvedAt = new Date().toISOString();
    this.activateRuleInMemory(target);

    if (this.prisma) {
      try {
        await (this.prisma as any).securityThreatRule?.update({
          where: { name: target.name },
          data: {
            enabled: true,
            status: 'APPROVED',
            approvedBy,
            approvedAt: new Date(),
          },
        });
      } catch (err) {
        this.logger.debug(`Could not update approved rule ${target.name} in DB: ${err}`);
      }
    }

    return { approved: true, ruleName: target.name };
  }

  getStagedRules(): StagedThreatRule[] {
    return Array.from(this.inMemoryStagedRules.values());
  }

  private activateRuleInMemory(rule: StagedThreatRule) {
    const exists = this.inMemoryLearnedRules.some(
      (r) => r.name === rule.name || r.regex.source === rule.pattern,
    );
    if (!exists) {
      this.inMemoryLearnedRules.push({
        name: rule.name,
        category: (rule.category as any) || 'c2_rat',
        regex: new RegExp(rule.pattern, 'i'),
        description: rule.description,
        severity: rule.severity,
      });
    }
  }

  /**
   * Synchronizes approved & enabled rules from PostgreSQL SecurityThreatRule table.
   */
  async syncPersistedRules(): Promise<void> {
    if (!this.prisma) return;
    const now = Date.now();
    if (now - this.lastRulesSyncAt < 30_000) return;
    this.lastRulesSyncAt = now;

    try {
      const ruleDelegate = (this.prisma as any).securityThreatRule;
      if (!ruleDelegate || typeof ruleDelegate.findMany !== 'function') return;
      const dbRules = await ruleDelegate.findMany({
        where: { enabled: true, status: 'APPROVED' },
      });
      if (Array.isArray(dbRules)) {
        for (const r of dbRules) {
          const check = this.validateLearnedRegexPattern(r.pattern);
          if (check.valid) {
            this.activateRuleInMemory({
              name: r.name,
              category: r.category,
              pattern: r.pattern,
              description: r.description,
              severity: r.severity || 'CRITICAL',
              status: 'APPROVED',
              source: r.source || 'OPERATOR',
              createdAt:
                r.createdAt instanceof Date
                  ? r.createdAt.toISOString()
                  : new Date().toISOString(),
            });
          }
        }
      }
    } catch (err) {
      this.logger.debug(`Failed to sync persisted threat rules: ${err}`);
    }
  }

  /**
   * Redacts secrets, credentials, private keys, and connection strings from source
   * code and extracts only minimal suspicious context windows before sending to an LLM.
   */
  redactAndMinimizeSourceForAi(content: string, maxChars = 1200): string {
    let redacted = redactSensitiveLogContent(content);

    // Redact PEM blocks
    redacted = redacted.replace(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
      '[REDACTED_PRIVATE_KEY]',
    );

    // Redact database & broker connection URIs
    redacted = redacted.replace(
      /\b(?:postgres|postgresql|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps):\/\/[^\s"'`]+/gi,
      '[REDACTED_CONNECTION_URI]',
    );

    // Redact common API token prefixes
    redacted = redacted.replace(
      /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|ghr|github_pat|xox[baprs]|AIza)[A-Za-z0-9_\-]{10,}\b/g,
      '[REDACTED_API_TOKEN]',
    );

    // Redact key=value secret assignments
    redacted = redacted.replace(
      /\b([A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET|AUTH_TOKEN)[A-Za-z0-9_]*)\s*([:=])\s*("[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '$1$2"[REDACTED_SECRET]"',
    );

    // Minimize to suspicious lines +/- 2 context lines
    const lines = redacted.split('\n');
    const selectedIndices = new Set<number>();
    lines.forEach((line, idx) => {
      if (SUSPICIOUS_LINE_REGEX.test(line)) {
        for (let c = Math.max(0, idx - 2); c <= Math.min(lines.length - 1, idx + 2); c++) {
          selectedIndices.add(c);
        }
      }
    });

    const excerpt =
      selectedIndices.size > 0
        ? Array.from(selectedIndices)
            .sort((a, b) => a - b)
            .map((i) => lines[i])
            .join('\n')
        : redacted;

    return excerpt.slice(0, maxChars);
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
   * AI-powered deep pattern analysis using LLM when heuristics identify suspicious indicators.
   * Performs secret redaction and data minimization before sending code excerpts,
   * and validates/stages any learned patterns instead of blindly executing unvalidated regexes.
   */
  async analyzeWithAi(
    files: Array<{ path: string; content: string }>,
    appName: string,
    options?: { autoApproveVerifiedRules?: boolean },
  ): Promise<{
    isMalicious: boolean;
    reason: string;
    category?: string;
    learnedPatterns?: string[];
    stagedRuleNames?: string[];
  }> {
    if (!this.modelFactory) {
      return { isMalicious: false, reason: 'AI model factory not available' };
    }

    const suspiciousFiles = files.filter((f) => SUSPICIOUS_LINE_REGEX.test(f.content));

    if (suspiciousFiles.length === 0) {
      return { isMalicious: false, reason: 'No suspicious execution primitives found' };
    }

    const snippetSummary = suspiciousFiles
      .slice(0, 3)
      .map(
        (f) =>
          `FILE: ${f.path}\nCONTENT:\n${this.redactAndMinimizeSourceForAi(f.content, 1200)}`,
      )
      .join('\n\n---\n\n');

    const prompt = `You are the AetherHost Application Security Sentinel.
Analyze the following redacted workload excerpt for malicious intent such as:
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
  "learnedPatterns": ["specific identifier or command pattern to stage for review"]
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
        const stagedRuleNames: string[] = [];
        if (Array.isArray(parsed.learnedPatterns)) {
          for (const patternStr of parsed.learnedPatterns) {
            const stagedResult = await this.stageLearnedRule({
              category: parsed.threatCategory || 'c2_rat',
              pattern: patternStr,
              description: `Learned threat pattern: ${parsed.reason}`,
              source: 'AI_SENTINEL',
              autoApprove: options?.autoApproveVerifiedRules === true,
            });
            if (stagedResult.staged && stagedResult.ruleName) {
              stagedRuleNames.push(stagedResult.ruleName);
            }
          }
        }
        return {
          isMalicious: true,
          reason: parsed.reason,
          category: parsed.threatCategory,
          learnedPatterns: parsed.learnedPatterns,
          stagedRuleNames,
        };
      }
    } catch (err) {
      this.logger.debug(`AI security analysis skipped or failed: ${err}`);
    }

    return { isMalicious: false, reason: 'Passed AI inspection' };
  }

  /**
   * Fetches key entrypoint/manifest files from a GitHub repository at the target revision
   * when inline files are not present, enabling pre-build source inspection.
   */
  async fetchRepositoryFilesForInspection(
    githubRepo: string,
    tenantId?: string,
    revision = 'HEAD',
  ): Promise<Array<{ path: string; content: string }>> {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_REMOTE_REPO_SCAN === 'true') {
      return [];
    }

    const normalized = normalizeRepoFullName(githubRepo);
    if (!normalized) return [];

    let token: string | null = null;
    if (tenantId) {
      try {
        token = await getGithubToken(tenantId);
      } catch {
        token = null;
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3.raw',
      'User-Agent': 'AetherHost-Security-Sentinel',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const fetched: Array<{ path: string; content: string }> = [];
    const refParam = revision && revision !== 'HEAD' ? `?ref=${encodeURIComponent(revision)}` : '';

    await Promise.all(
      REPO_INSPECTION_PATHS.map(async (filePath) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
          const url = `https://api.github.com/repos/${normalized}/contents/${filePath}${refParam}`;
          const res = await fetch(url, { headers, signal: controller.signal });
          if (res.ok) {
            const text = await res.text();
            if (text && text.length <= 64_000) {
              fetched.push({ path: filePath, content: text });
            }
          }
        } catch {
          // Best-effort network inspection; agent-go also verifies checked-out source on disk
        } finally {
          clearTimeout(timer);
        }
      }),
    );

    return fetched;
  }

  /**
   * Post-deployment runtime threat monitor.
   * Scans container runtime logs and process output for indicators of post-build compromise.
   */
  async inspectRuntimeOutput(
    tenantId: string,
    applicationId: string,
    output: string,
  ): Promise<{ safe: boolean; ruleName?: string; category?: string; details?: string }> {
    if (!output) return { safe: true };

    const result = this.scanContentWithHeuristics([{ path: 'runtime.log', content: output }]);
    if (!result.safe) {
      this.logger.error(
        `Runtime threat detected in application ${applicationId} (tenant ${tenantId}): [${result.ruleName}] ${result.details}`,
      );
      if (this.prisma) {
        await this.prisma.auditLog
          .create({
            data: {
              tenantId,
              action: 'SECURITY_RUNTIME_THREAT_DETECTED',
              resourceId: applicationId,
              metadata: {
                ruleName: result.ruleName,
                category: result.category,
                details: result.details,
                reviewStatus: 'PENDING_OPERATOR_ACTION',
              },
            },
          })
          .catch(() => {});
      }
    }
    return result;
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
      revision?: string;
      files?: Array<{ path: string; content: string }>;
      envVars?: Record<string, string>;
      dockerImage?: string;
      workerCommand?: string;
      actorIdentity?: { email?: string; githubLogin?: string; githubId?: string };
      failClosed?: boolean;
    },
  ): Promise<void> {
    await this.syncPersistedRules();

    // 1. Identity Check
    const identityCheck = await this.isIdentityBlocked({
      tenantId,
      email: options.actorIdentity?.email,
      githubLogin: options.actorIdentity?.githubLogin,
      githubId: options.actorIdentity?.githubId,
      failClosed: options.failClosed,
    });

    if (identityCheck.blocked) {
      this.logger.error(
        `Preflight rejected: Tenant ${tenantId} blocked by confirmed identity rule: ${identityCheck.reason}`,
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
          this.logger.error(
            `Preflight rejected: Repo URL ${options.githubRepo} matches blocked value: ${blockedVal}`,
          );
          throw new ForbiddenException(
            `Security Policy Violation: Connected repository is blocked (${reason})`,
          );
        }
      }
    }

    // 3. Gather files to inspect (inline files, or fetched from repository revision)
    let filesToScan = options.files && options.files.length > 0 ? [...options.files] : [];
    if (filesToScan.length === 0 && options.githubRepo) {
      filesToScan = await this.fetchRepositoryFilesForInspection(
        options.githubRepo,
        tenantId,
        options.revision,
      );
    }
    if (options.workerCommand) {
      filesToScan.push({ path: 'workerCommand', content: options.workerCommand });
    }

    // 4. Heuristic Code & Environment Variable Screening
    if (filesToScan.length > 0 || (options.envVars && Object.keys(options.envVars).length > 0)) {
      const heuristicResult = this.scanContentWithHeuristics(filesToScan, options.envVars);
      if (!heuristicResult.safe) {
        this.logger.error(
          `Preflight rejected: Workload "${options.name}" failed heuristic security rule [${heuristicResult.ruleName}]: ${heuristicResult.details}`,
        );

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
                  reviewStatus: 'WORKLOAD_BLOCKED',
                },
              },
            })
            .catch(() => {});
        }

        throw new ForbiddenException(`Security Policy Violation: ${heuristicResult.details}`);
      }

      // 5. AI Deep Scan (if suspicious primitives exist)
      // Blocks the flagged workload and queues an evidence-based human review record
      // rather than automatically suspending the entire tenant account.
      const aiResult = await this.analyzeWithAi(filesToScan, options.name);
      if (aiResult.isMalicious) {
        this.logger.error(
          `Preflight rejected (queued for operator review): Workload "${options.name}" flagged by AI analysis: ${aiResult.reason}`,
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
                  stagedRules: aiResult.stagedRuleNames ?? [],
                  reviewStatus: 'PENDING_HUMAN_REVIEW',
                },
              },
            })
            .catch(() => {});
        }

        throw new ForbiddenException(
          `Security Policy Violation: Workload flagged for operator security review (${aiResult.reason})`,
        );
      }
    }
  }
}
