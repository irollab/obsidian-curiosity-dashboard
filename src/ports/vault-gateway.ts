export type Frontmatter = Record<string, unknown>;

export interface VaultGateway {
  /** All file paths. Directories are returned by listFolders(). */
  listPaths(): string[];
  listMarkdownPaths(): string[];
  listFolders(): string[];
  getFrontmatter(path: string): Frontmatter | null;
  read(path: string): Promise<string>;
  process(path: string, transform: (content: string) => string): Promise<void>;
  updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void>;
  create(path: string, content: string): Promise<void>;
  exists(path: string): boolean;
  resourceUrl(path: string): string | null;
}
