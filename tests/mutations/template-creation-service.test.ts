import { describe, expect, it } from 'vitest';

import {
  TemplateCreationService,
  sanitizeTitle,
} from '@/mutations/template-creation-service';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

const TEMPLATE_PATH = '99-模板/topic.md';

const createRequest = (overrides: Partial<{
  templatePath: string;
  targetPath: string;
  title: string;
  issue: number;
}> = {}) => ({
  templatePath: TEMPLATE_PATH,
  targetPath: '10-选题池/39-Test.md',
  title: 'Test',
  issue: 39,
  ...overrides,
});

describe('sanitizeTitle', () => {
  it('replaces forbidden cross-platform filename characters without rewriting words', () => {
    expect(sanitizeTitle('A:B/C*D? "E"')).toBe('A-B-C-D-E');
    expect(sanitizeTitle('  Obsidian 首页 2.0  ')).toBe('Obsidian 首页 2.0');
  });

  it('preserves legal hyphens and internal spacing', () => {
    expect(sanitizeTitle('  -A -- B   C-  ')).toBe('-A -- B   C-');
  });

  it('removes control characters and trailing Windows dots and spaces', () => {
    expect(sanitizeTitle('A\u0000B\u001fC...   ')).toBe('A-B-C');
  });

  it('returns an empty string when the title contains no usable filename characters', () => {
    expect(sanitizeTitle('<>:"/\\|?*\u0000...   ')).toBe('');
  });

  it.each(['CON', 'prn', 'AUX.txt', 'nul', 'COM1', 'com9.md', 'LPT1', 'lpt9.txt'])(
    'makes the Windows reserved device name %s safe',
    (title) => {
      const sanitized = sanitizeTitle(title);
      expect(sanitized).not.toMatch(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i);
      expect(sanitized.toLowerCase()).toContain(title.split('.')[0]!.toLowerCase());
    },
  );
});

describe('TemplateCreationService', () => {
  it('renders known tokens once and keeps unknown tokens', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(
      TEMPLATE_PATH,
      '# {{title}}\nissue: {{issue}}\ndate: {{date}}\nunknown: {{channel}}',
    );
    const service = new TemplateCreationService(vault, () => new Date(2026, 5, 22, 23, 30));

    await service.create(createRequest({ title: 'Keep {{date}} literal' }));

    await expect(vault.read('10-选题池/39-Test.md')).resolves.toBe(
      '# Keep {{date}} literal\nissue: 39\ndate: 2026-06-22\nunknown: {{channel}}',
    );
  });

  it('uses the local calendar date instead of UTC serialization', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(TEMPLATE_PATH, '{{date}}');
    const instant = new Date(2026, 5, 22, 0, 30);
    const service = new TemplateCreationService(vault, () => instant);

    await service.create(createRequest());

    await expect(vault.read('10-选题池/39-Test.md')).resolves.toBe(
      `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(
        instant.getDate(),
      ).padStart(2, '0')}`,
    );
  });

  it.each([
    ['template', { templatePath: 'C:\\templates\\topic.md' }],
    ['template', { templatePath: '\\\\server\\share\\topic.md' }],
    ['template', { templatePath: '/templates/topic.md' }],
    ['template', { templatePath: '99-模板/../topic.md' }],
    ['template', { templatePath: '99-模板/./topic.md' }],
    ['template', { templatePath: '99-模板//topic.md' }],
    ['template', { templatePath: '99-模板/topic.md\u0000' }],
    ['target', { targetPath: 'C:outside.md' }],
    ['target', { targetPath: '\\outside.md' }],
    ['target', { targetPath: '../outside.md' }],
    ['target', { targetPath: 'safe/./outside.md' }],
    ['target', { targetPath: 'safe//outside.md' }],
    ['target', { targetPath: 'safe/outside.md\u0000' }],
  ])('rejects an unsafe %s path %#', async (_kind, overrides) => {
    const vault = new FakeVaultGateway();
    vault.files.set(TEMPLATE_PATH, '# template');
    const service = new TemplateCreationService(vault);

    await expect(service.create(createRequest(overrides))).rejects.toThrow('inside the vault');
    expect(vault.listPaths()).toEqual([TEMPLATE_PATH]);
  });

  it('normalizes safe backslash separators before accessing and creating files', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set(TEMPLATE_PATH, '# {{title}}');
    const service = new TemplateCreationService(vault);

    await service.create(
      createRequest({
        templatePath: '99-模板\\topic.md',
        targetPath: '10-选题池\\39-Test.md',
      }),
    );

    await expect(vault.read('10-选题池/39-Test.md')).resolves.toBe('# Test');
  });

  it.each([
    ['missing template', 'missing.md'],
    ['non-Markdown template', '99-模板/topic.txt'],
  ])('rejects a %s', async (_case, templatePath) => {
    const vault = new FakeVaultGateway();
    if (templatePath.endsWith('.txt')) vault.files.set(templatePath, '# template');
    const service = new TemplateCreationService(vault);

    await expect(service.create(createRequest({ templatePath }))).rejects.toThrow(
      'Template not found',
    );
  });

  it('rejects a folder used as the template', async () => {
    const vault = new FakeVaultGateway();
    vault.directories.add(TEMPLATE_PATH);
    const service = new TemplateCreationService(vault);

    await expect(service.create(createRequest())).rejects.toThrow('Template not found');
  });

  it.each(['10-选题池/39-Test.txt', '10-选题池/39-Test', '10-选题池/.md'])(
    'rejects an invalid Markdown target %s',
    async (targetPath) => {
      const vault = new FakeVaultGateway();
      vault.files.set(TEMPLATE_PATH, '# template');
      const service = new TemplateCreationService(vault);

      await expect(service.create(createRequest({ targetPath }))).rejects.toThrow(
        'Target path must end with .md',
      );
    },
  );

  it.each([
    ['blank title', { title: '   ' }],
    ['zero issue', { issue: 0 }],
    ['fractional issue', { issue: 1.5 }],
    ['unsafe issue', { issue: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects a %s', async (_case, overrides) => {
    const vault = new FakeVaultGateway();
    vault.files.set(TEMPLATE_PATH, '# template');
    const service = new TemplateCreationService(vault);

    await expect(service.create(createRequest(overrides))).rejects.toThrow(/Title|Issue/);
  });

  it.each([
    ['file', false],
    ['folder', true],
  ])('refuses to overwrite an existing target %s', async (_case, folder) => {
    const vault = new FakeVaultGateway();
    vault.files.set(TEMPLATE_PATH, '# template');
    if (folder) vault.directories.add('10-选题池/39-Test.md');
    else vault.files.set('10-选题池/39-Test.md', '# existing');
    const service = new TemplateCreationService(vault);

    await expect(service.create(createRequest())).rejects.toThrow('Target already exists');
  });

  it('propagates an atomic create conflict without replacing the competing file', async () => {
    class RacingVaultGateway extends FakeVaultGateway {
      override async create(path: string, content: string): Promise<void> {
        this.files.set(path, '# competing content');
        await super.create(path, content);
      }
    }

    const vault = new RacingVaultGateway();
    vault.files.set(TEMPLATE_PATH, '# template');
    const service = new TemplateCreationService(vault);

    await expect(service.create(createRequest())).rejects.toThrow('File exists');
    await expect(vault.read('10-选题池/39-Test.md')).resolves.toBe('# competing content');
  });
});
