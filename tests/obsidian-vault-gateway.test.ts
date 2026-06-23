import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App } from 'obsidian';
import { TFile, TFolder, normalizePath } from 'obsidian';

import { ObsidianVaultGateway } from '../src/adapters/obsidian-vault-gateway';

vi.mock('obsidian', () => {
  class MockTFile {
    constructor(readonly path: string) {}
  }

  class MockTFolder {
    constructor(readonly path: string) {}
  }

  return {
    TFile: MockTFile,
    TFolder: MockTFolder,
    normalizePath: vi.fn((path: string) => `normalized:${path}`),
  };
});

function makeApp() {
  const makeFile = (path: string): TFile =>
    Object.assign(Object.create(TFile.prototype) as TFile, { path });
  const makeFolder = (path: string): TFolder =>
    Object.assign(Object.create(TFolder.prototype) as TFolder, { path });
  const note = makeFile('notes/topic.md');
  const image = makeFile('assets/image.png');
  const folder = makeFolder('notes');
  const files = new Map<string, unknown>([
    ['normalized:notes/topic.md', note],
    ['normalized:assets/image.png', image],
    ['normalized:notes', folder],
  ]);
  const vault = {
    getAllLoadedFiles: vi.fn(() => [folder, note, image]),
    getFiles: vi.fn(() => [note, image]),
    getMarkdownFiles: vi.fn(() => [note]),
    getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null),
    cachedRead: vi.fn(async () => '# Topic'),
    process: vi.fn(async (_file: TFile, transform: (content: string) => string) => transform('# Topic')),
    create: vi.fn(async (path: string) => makeFile(path)),
    getResourcePath: vi.fn((file: TFile) => `resource:${file.path}`),
  };
  const metadataCache = {
    getFileCache: vi.fn(() => ({ frontmatter: { stage: '制作' } })),
  };
  const fileManager = {
    processFrontMatter: vi.fn(async (_file: TFile, _mutate: (frontmatter: Record<string, unknown>) => void) => undefined),
  };

  return {
    app: { vault, metadataCache, fileManager } as unknown as App,
    fileManager,
    image,
    note,
    vault,
  };
}

describe('ObsidianVaultGateway', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists file, markdown, and folder paths separately', () => {
    const { app } = makeApp();
    const gateway = new ObsidianVaultGateway(app);

    expect(gateway.listPaths()).toEqual(['notes/topic.md', 'assets/image.png']);
    expect(gateway.listMarkdownPaths()).toEqual(['notes/topic.md']);
    expect(gateway.listFolders()).toEqual(['notes']);
  });

  it('reads frontmatter and content through normalized TFile lookups', async () => {
    const { app, note, vault } = makeApp();
    const gateway = new ObsidianVaultGateway(app);

    expect(gateway.getFrontmatter('notes/topic.md')).toEqual({ stage: '制作' });
    await expect(gateway.read('notes/topic.md')).resolves.toBe('# Topic');
    expect(vault.cachedRead).toHaveBeenCalledWith(note);
    expect(normalizePath).toHaveBeenCalledWith('notes/topic.md');
  });

  it('delegates content and frontmatter processing', async () => {
    const { app, fileManager, note, vault } = makeApp();
    const gateway = new ObsidianVaultGateway(app);
    const transform = (content: string) => `${content}\nUpdated`;
    const mutate = (frontmatter: Record<string, unknown>) => {
      frontmatter.stage = '发布';
    };

    await expect(gateway.process('notes/topic.md', transform)).resolves.toBeUndefined();
    await gateway.updateFrontmatter('notes/topic.md', mutate);

    expect(vault.process).toHaveBeenCalledWith(note, transform);
    expect(fileManager.processFrontMatter).toHaveBeenCalledWith(note, mutate);
  });

  it('normalizes create and existence paths', async () => {
    const { app, vault } = makeApp();
    const gateway = new ObsidianVaultGateway(app);

    await gateway.create('new/topic.md', '# New');

    expect(vault.create).toHaveBeenCalledWith('normalized:new/topic.md', '# New');
    expect(gateway.exists('notes/topic.md')).toBe(true);
    expect(gateway.exists('missing.md')).toBe(false);
  });

  it('returns resource paths only for files and reports invalid file lookups', () => {
    const { app, image } = makeApp();
    const gateway = new ObsidianVaultGateway(app);

    expect(gateway.resourceUrl('assets/image.png')).toBe('resource:assets/image.png');
    expect(gateway.resourceUrl('notes')).toBeNull();
    expect(() => gateway.getFrontmatter('notes')).toThrow('Markdown file not found: notes');
    expect(image).toBeInstanceOf(TFile);
  });
});
