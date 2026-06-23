import type { DashboardSettings } from '@/settings';

export type VaultChangeKind = 'create' | 'modify' | 'delete' | 'rename' | 'metadata';

export interface VaultChange {
  kind: VaultChangeKind;
  path: string;
  oldPath?: string;
}

export function normalizeObservedPaths(paths: Iterable<string>): ReadonlySet<string> {
  return new Set([...paths].map(normalizeDataPath).filter((path) => path.length > 0));
}

export function isRelevantVaultChange(
  change: VaultChange,
  settings: DashboardSettings,
  observedPaths: ReadonlySet<string>,
): boolean {
  const paths = change.kind === 'rename' && change.oldPath !== undefined
    ? [change.path, change.oldPath]
    : [change.path];

  return paths.map(normalizeDataPath).some((path) => {
    if (path.length === 0) return false;
    if (observedPaths.has(path)) return true;
    if (
      change.kind !== 'metadata' &&
      normalizeDataPath(settings.backgroundPath) === path
    ) {
      return true;
    }
    if (isInside(path, settings.topicDir) || isInside(path, settings.reviewDir)) return true;
    if (!['create', 'delete', 'rename'].includes(change.kind)) return false;
    return isInside(path, settings.scriptDir) || isInside(path, settings.assetDir);
  });
}

function normalizeDataPath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isInside(path: string, directory: string): boolean {
  const normalizedDirectory = normalizeDataPath(directory);
  return normalizedDirectory.length > 0 &&
    (path === normalizedDirectory || path.startsWith(`${normalizedDirectory}/`));
}
