import { type App, TFile, normalizePath } from 'obsidian';

import type { Frontmatter, VaultGateway } from '@/ports/vault-gateway';

export class ObsidianVaultGateway implements VaultGateway {
  constructor(private readonly app: App) {}

  listPaths(): string[] {
    return this.app.vault.getAllLoadedFiles().map((file) => file.path);
  }

  listMarkdownPaths(): string[] {
    return this.app.vault.getMarkdownFiles().map((file) => file.path);
  }

  getFrontmatter(path: string): Frontmatter | null {
    return this.app.metadataCache.getFileCache(this.requireFile(path))?.frontmatter ?? null;
  }

  read(path: string): Promise<string> {
    return this.app.vault.cachedRead(this.requireFile(path));
  }

  async process(path: string, transform: (content: string) => string): Promise<void> {
    await this.app.vault.process(this.requireFile(path), transform);
  }

  updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void> {
    return this.app.fileManager.processFrontMatter(this.requireFile(path), mutate);
  }

  async create(path: string, content: string): Promise<void> {
    await this.app.vault.create(normalizePath(path), content);
  }

  exists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  resourceUrl(path: string): string | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
  }

  private requireFile(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      throw new Error(`Markdown file not found: ${path}`);
    }
    return file;
  }
}
