export interface ThreatIndicator {
  type: 'email' | 'github_user' | 'github_id' | 'repo' | 'domain';
  value: string;
  reason: string;
}

export interface HeuristicThreatRule {
  name: string;
  category: 'c2_rat' | 'crypto_miner' | 'reverse_shell' | 'masqueraded_process' | 'malicious_download';
  regex: RegExp;
  description: string;
  severity: 'HIGH' | 'CRITICAL' | 'MEDIUM';
}

export const KNOWN_BLOCKED_IDENTITIES: ThreatIndicator[] = [
  {
    type: 'email',
    value: 'zxy1715x@gmail.com',
    reason: 'Repeated deployment of unauthorized Nezha C2 agents',
  },
  {
    type: 'github_user',
    value: 'zx1447',
    reason: 'Repeated deployment of unauthorized Nezha C2 agents and RAT binaries',
  },
  {
    type: 'github_id',
    value: '216457174',
    reason: 'GitHub OAuth ID linked to confirmed C2 deployments',
  },
  {
    type: 'domain',
    value: 'vip1715.dpdns.org',
    reason: 'Active Nezha command-and-control dashboard',
  },
  {
    type: 'domain',
    value: 'maike.fadehost.app',
    reason: 'Active Nezha command-and-control reporting endpoint',
  },
  {
    type: 'domain',
    value: 'cdn-9vr.pages.dev',
    reason: 'Malicious payload distribution CDN',
  },
];

export const BUILTIN_HEURISTIC_RULES: HeuristicThreatRule[] = [
  {
    name: 'nezha_agent_detection',
    category: 'c2_rat',
    regex: /(?:nezha-agent|nezhahq|vip1715\.dpdns\.org|nezha\.vip\d*|maike\.fadehost|cdn-9vr\.pages\.dev|nezha-agent-host)/i,
    description: 'Detects Nezha remote monitoring / administration agent artifacts or C2 domains',
    severity: 'CRITICAL',
  },
  {
    name: 'masqueraded_sysmon_process',
    category: 'masqueraded_process',
    regex: /(?:\/tmp\/\.sysmon|\/tmp\/\.X11-unix|\/dev\/shm\/\.)/i,
    description: 'Detects execution of disguised binaries masquerading as system monitors in temporary paths',
    severity: 'CRITICAL',
  },
  {
    name: 'crypto_currency_miner',
    category: 'crypto_miner',
    regex: /(?:xmrig|stratum\+tcp:\/\/|stratum\+ssl:\/\/|moneroocean|cryptonight|pool\.minexmr)/i,
    description: 'Detects cryptocurrency mining software or stratum mining pool connections',
    severity: 'CRITICAL',
  },
  {
    name: 'reverse_shell_payload',
    category: 'reverse_shell',
    regex: /(?:\/dev\/tcp\/\d+\.\d+\.\d+\.\d+\/\d+|nc\s+(?:-e|--exec)\s+\/(?:bin|usr))/i,
    description: 'Detects interactive reverse shell socket redirections',
    severity: 'CRITICAL',
  },
  {
    name: 'obfuscated_pipe_to_shell',
    category: 'malicious_download',
    regex: /(?:curl\s+-[^\n|]*\|\s*(?:bash|sh)|wget\s+-[^\n|]*\|\s*(?:bash|sh))/i,
    description: 'Detects downloading untrusted remote scripts directly piped into a shell interpreter',
    severity: 'HIGH',
  },
];
