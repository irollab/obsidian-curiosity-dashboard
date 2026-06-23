export type Frontmatter = Record<string, unknown>;

export interface VaultGateway {
  listPaths(): string[];
  listMarkdownPaths(): string[];
  getFrontmatter(path: string): Frontmatter | null;
  read(path: string): Promise<string>;
  process(path: string, transform: (content: string) => string): Promise<void>;
  updateFrontmatter(path: string, mutate: (frontmatter: Frontmatter) => void): Promise<void>;
  create(path: string, content: string): Promise<void>;
  exists(path: string): boolean;
  resourceUrl(path: string): string | null;
}
