export type RepositoryFile = { path: string; content: string };

export type RepositoryInspection = {
  framework: string;
  runtime: 'nodejs' | 'python' | 'go' | 'rust' | 'php' | 'docker' | 'static';
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null;
  dockerfile: boolean;
  monorepo: boolean;
  suggestedPort: number | null;
  detectedFiles: string[];
  notes: string[];
};

const PORT_BY_FRAMEWORK: Record<string, number> = {
  'Next.js': 3000,
  'Vite': 4173,
  'Node.js': 3000,
  'Python': 8000,
  'Go': 8080,
  'Rust': 3000,
  'PHP': 8080,
};

function hasPath(paths: Set<string>, matcher: RegExp): boolean {
  return [...paths].some((path) => matcher.test(path));
}

function packageJsonContents(files: RepositoryFile[]): string {
  return files
    .filter((file) => /(^|\/)package\.json$/i.test(file.path))
    .map((file) => file.content)
    .join('\n');
}

/**
 * Derives only display and preflight hints from a bounded repository file list.
 * It never changes a repository or invents build commands: the checked-in
 * Dockerfile and source remain authoritative during deployment.
 */
export function inspectRepositoryFiles(files: RepositoryFile[]): RepositoryInspection {
  const paths = new Set(files.map((file) => file.path));
  const packageJson = packageJsonContents(files);
  const detectedFiles = [...paths]
    .filter((path) => /(^|\/)(Dockerfile|package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|go\.mod|Cargo\.toml|requirements\.txt|pyproject\.toml|composer\.json|turbo\.json)$/i.test(path))
    .sort()
    .slice(0, 12);

  const dockerfile = hasPath(paths, /(^|\/)Dockerfile(?:\.[^/]+)?$/i);
  const monorepo = hasPath(paths, /(^|\/)(turbo\.json|pnpm-workspace\.yaml|lerna\.json)$/i) ||
    hasPath(paths, /^(apps|packages|services)\/[^/]+\/package\.json$/i);

  let framework = 'Static site';
  let runtime: RepositoryInspection['runtime'] = 'static';

  if (dockerfile) {
    framework = 'Docker';
    runtime = 'docker';
  }
  if (hasPath(paths, /(^|\/)Cargo\.toml$/i)) {
    framework = 'Rust';
    runtime = 'rust';
  } else if (hasPath(paths, /(^|\/)go\.mod$/i)) {
    framework = 'Go';
    runtime = 'go';
  } else if (hasPath(paths, /(^|\/)(requirements\.txt|pyproject\.toml|Pipfile)$/i)) {
    framework = 'Python';
    runtime = 'python';
  } else if (hasPath(paths, /(^|\/)composer\.json$/i) || hasPath(paths, /(^|\/)wp-config\.php$/i)) {
    framework = 'PHP';
    runtime = 'php';
  } else if (hasPath(paths, /(^|\/)package\.json$/i)) {
    framework = 'Node.js';
    runtime = 'nodejs';
    if (/"next"\s*:/i.test(packageJson) || hasPath(paths, /(^|\/)(next\.config\.|app\/|pages\/)/i)) {
      framework = 'Next.js';
    } else if (/"vite"\s*:/i.test(packageJson) || hasPath(paths, /(^|\/)vite\.config\./i)) {
      framework = 'Vite';
    }
  }

  const packageManager: RepositoryInspection['packageManager'] = hasPath(paths, /(^|\/)pnpm-lock\.yaml$/i)
    ? 'pnpm'
    : hasPath(paths, /(^|\/)yarn\.lock$/i)
      ? 'yarn'
      : hasPath(paths, /(^|\/)bun\.lockb?$/i)
        ? 'bun'
        : hasPath(paths, /(^|\/)package-lock\.json$/i)
          ? 'npm'
          : null;

  const notes = [
    monorepo
      ? 'Monorepo markers found. Confirm the deployment root before releasing.'
      : 'Repository layout looks single-project.',
    dockerfile
      ? 'A checked-in Dockerfile will remain authoritative during deployment.'
      : 'No Dockerfile found. AetherHost can use its supported runtime profile; review the generated plan before deploying.',
  ];

  return {
    framework,
    runtime,
    packageManager,
    dockerfile,
    monorepo,
    suggestedPort: PORT_BY_FRAMEWORK[framework] ?? null,
    detectedFiles,
    notes,
  };
}
