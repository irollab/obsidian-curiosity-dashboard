import { type App, TFile, TFolder, normalizePath } from 'obsidian';

import type { Frontmatter, VaultGateway } from '@/ports/vault-gateway';

export class ObsidianVaultGateway implements VaultGateway {
  constructor(
    private readonly app: App,
    private readonly pluginDir: string | null = null,
  ) {}

  listPaths(): string[] {
    return this.app.vault.getFiles().map((file) => file.path);
  }

  listMarkdownPaths(): string[] {
    return this.app.vault.getMarkdownFiles().map((file) => file.path);
  }

  listFolders(): string[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .map((folder) => folder.path);
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
    if (file instanceof TFile) return this.app.vault.getResourcePath(file);
    // 插件内置资产（assets/ 前缀）：从插件目录解析，而非 vault。
    if (this.pluginDir !== null && /^assets\//.test(path.replace(/^\/+/, ''))) {
      return this.app.vault.adapter.getResourcePath(normalizePath(`${this.pluginDir}/${path}`));
    }
    return null;
  }

  private requireFile(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      throw new Error(`Markdown file not found: ${path}`);
    }
    return file;
  }
}
