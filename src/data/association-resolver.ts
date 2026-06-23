import type { TopicRecord } from '@/domain/models';
import type { VaultGateway } from '@/ports/vault-gateway';
import type { DashboardSettings } from '@/settings';

export class AssociationResolver {
  constructor(
    private readonly vault: VaultGateway,
    private readonly settings: DashboardSettings,
  ) {}

  resolve(topic: TopicRecord): TopicRecord {
    return {
      ...topic,
      scriptPath:
        topic.scriptPath ?? this.unique(this.candidates(this.settings.scriptDir, topic.issue)),
      assetPath:
        topic.assetPath ?? this.unique(this.candidates(this.settings.assetDir, topic.issue, true)),
      reviewPath:
        topic.reviewPath ?? this.unique(this.candidates(this.settings.reviewDir, topic.issue)),
    };
  }

  candidates(directory: string, issue: number, includeFolders = false): string[] {
    const normalizedDirectory = normalizePath(directory);
    const prefix = normalizedDirectory.length === 0 ? '' : `${normalizedDirectory}/`;
    const issuePattern = new RegExp(`^(?:第)?0*${issue}(?:期|-|_|$)`);
    const paths = includeFolders
      ? [...this.vault.listPaths(), ...this.vault.listFolders()]
      : this.vault.listPaths();

    return [...new Set(paths.map(normalizePath))]
      .filter((path) => path.startsWith(prefix))
      .filter((path) => issuePattern.test(basename(path)))
      .sort(comparePaths);
  }

  private unique(candidates: string[]): string | null {
    return candidates.length === 1 ? (candidates[0] ?? null) : null;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function basename(path: string): string {
  return (path.split('/').at(-1) ?? '').replace(/\.[^.]+$/, '');
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
