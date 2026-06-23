import type { Frontmatter, VaultGateway } from '@/ports/vault-gateway';

export class FakeVaultGateway implements VaultGateway {
  readonly files = new Map<string, string>();
  readonly metadata = new Map<string, Frontmatter>();

  listPaths(): string[] {
    return [...this.files.keys()];
  }

  listMarkdownPaths(): string[] {
    return [...this.files.keys()].filter((path) => path.endsWith('.md'));
  }

  getFrontmatter(path: string): Frontmatter | null {
    return this.metadata.get(path) ?? null;
  }

  async read(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`Missing file: ${path}`);
    return value;
  }

  async process(path: string, transform: (content: string) => string): Promise<void> {
    this.files.set(path, transform(await this.read(path)));
  }

  async updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void> {
    const frontmatter = { ...(this.metadata.get(path) ?? {}) };
    mutate(frontmatter);
    this.metadata.set(path, frontmatter);
  }

  async create(path: string, content: string): Promise<void> {
    if (this.exists(path)) throw new Error(`File exists: ${path}`);
    this.files.set(path, content);
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  resourceUrl(path: string): string | null {
    return this.exists(path) ? `app://vault/${encodeURIComponent(path)}` : null;
  }
}
