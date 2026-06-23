import type { Frontmatter, VaultGateway } from '@/ports/vault-gateway';

export class FakeVaultGateway implements VaultGateway {
  readonly files = new Map<string, string>();
  readonly metadata = new Map<string, Frontmatter>();
  readonly directories = new Set<string>();

  listPaths(): string[] {
    return [...this.files.keys()].map((path) => this.normalize(path));
  }

  listMarkdownPaths(): string[] {
    return this.listPaths().filter((path) => path.endsWith('.md'));
  }

  listFolders(): string[] {
    return [...this.directories].map((path) => this.normalize(path));
  }

  getFrontmatter(path: string): Frontmatter | null {
    const normalizedPath = this.normalize(path);
    if (this.findMapKey(this.files, normalizedPath) === null) {
      throw new Error(`Missing file: ${normalizedPath}`);
    }
    const metadataKey = this.findMapKey(this.metadata, normalizedPath);
    return metadataKey === null ? null : (this.metadata.get(metadataKey) ?? null);
  }

  async read(path: string): Promise<string> {
    const normalizedPath = this.normalize(path);
    const fileKey = this.findMapKey(this.files, normalizedPath);
    if (fileKey === null) throw new Error(`Missing file: ${normalizedPath}`);
    const value = this.files.get(fileKey);
    if (value === undefined) throw new Error(`Missing file: ${normalizedPath}`);
    return value;
  }

  async process(path: string, transform: (content: string) => string): Promise<void> {
    const normalizedPath = this.normalize(path);
    const fileKey = this.findMapKey(this.files, normalizedPath);
    const content = await this.read(normalizedPath);
    if (fileKey !== null && fileKey !== normalizedPath) this.files.delete(fileKey);
    this.files.set(normalizedPath, transform(content));
  }

  async updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void> {
    const normalizedPath = this.normalize(path);
    await this.read(normalizedPath);
    const metadataKey = this.findMapKey(this.metadata, normalizedPath);
    const frontmatter = { ...(metadataKey === null ? {} : (this.metadata.get(metadataKey) ?? {})) };
    mutate(frontmatter);
    if (metadataKey !== null && metadataKey !== normalizedPath) this.metadata.delete(metadataKey);
    this.metadata.set(normalizedPath, frontmatter);
  }

  async create(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalize(path);
    if (this.exists(normalizedPath)) throw new Error(`File exists: ${normalizedPath}`);
    this.files.set(normalizedPath, content);
  }

  exists(path: string): boolean {
    const normalizedPath = this.normalize(path);
    return (
      this.findMapKey(this.files, normalizedPath) !== null ||
      [...this.directories].some((directory) => this.normalize(directory) === normalizedPath)
    );
  }

  resourceUrl(path: string): string | null {
    const normalizedPath = this.normalize(path);
    return this.findMapKey(this.files, normalizedPath) !== null
      ? `app://vault/${encodeURIComponent(normalizedPath)}`
      : null;
  }

  private normalize(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  private findMapKey<Value>(map: Map<string, Value>, normalizedPath: string): string | null {
    if (map.has(normalizedPath)) return normalizedPath;
    return [...map.keys()].find((path) => this.normalize(path) === normalizedPath) ?? null;
  }
}
