import { describe, expect, it } from 'vitest';

import { FakeVaultGateway } from './support/fake-vault-gateway';

describe('FakeVaultGateway', () => {
  it('lists all paths and only markdown paths', () => {
    const vault = new FakeVaultGateway();
    vault.files.set('notes/topic.md', '# Topic');
    vault.files.set('assets/image.png', 'binary');

    expect(vault.listPaths()).toEqual(['notes/topic.md', 'assets/image.png']);
    expect(vault.listMarkdownPaths()).toEqual(['notes/topic.md']);
  });

  it('reads files and reports a missing file clearly', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set('topic.md', 'first');

    await expect(vault.read('topic.md')).resolves.toBe('first');
    await expect(vault.read('missing.md')).rejects.toThrow('Missing file: missing.md');
  });

  it('processes the latest file content', async () => {
    const vault = new FakeVaultGateway();
    vault.files.set('topic.md', 'first');

    await vault.process('topic.md', (content) => `${content} second`);
    await vault.process('topic.md', (content) => `${content} third`);

    await expect(vault.read('topic.md')).resolves.toBe('first second third');
  });

  it('copies frontmatter before mutation', async () => {
    const vault = new FakeVaultGateway();
    const original = { stage: '选题' };
    vault.metadata.set('topic.md', original);

    await vault.updateFrontmatter('topic.md', (frontmatter) => {
      frontmatter.stage = '策划';
    });

    expect(original).toEqual({ stage: '选题' });
    expect(vault.getFrontmatter('topic.md')).toEqual({ stage: '策划' });
  });

  it('creates without overwriting and resolves existing resources', async () => {
    const vault = new FakeVaultGateway();
    await vault.create('asset folder/image.png', 'binary');

    expect(vault.exists('asset folder/image.png')).toBe(true);
    expect(vault.resourceUrl('asset folder/image.png')).toBe('app://vault/asset%20folder%2Fimage.png');
    expect(vault.resourceUrl('missing.png')).toBeNull();
    await expect(vault.create('asset folder/image.png', 'replacement')).rejects.toThrow(
      'File exists: asset folder/image.png',
    );
    await expect(vault.read('asset folder/image.png')).resolves.toBe('binary');
  });
});
