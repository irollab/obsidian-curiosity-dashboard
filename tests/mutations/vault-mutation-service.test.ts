import { describe, expect, it } from 'vitest';

import { VaultMutationService } from '@/mutations/vault-mutation-service';
import type { Stage } from '@/domain/stages';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

const TOPIC_PATH = 'topics/topic.md';

async function topicVault(stage: Stage = '选题'): Promise<FakeVaultGateway> {
  const vault = new FakeVaultGateway();
  await vault.create(TOPIC_PATH, '- [ ] first\n- [ ] second');
  vault.metadata.set(TOPIC_PATH, { stage });
  return vault;
}

describe('VaultMutationService.toggleTask', () => {
  it('toggles only the requested line', async () => {
    const vault = await topicVault();

    await new VaultMutationService(vault).toggleTask(TOPIC_PATH, 2);

    expect(await vault.read(TOPIC_PATH)).toBe('- [ ] first\n- [x] second');
  });

  it('uses process so the toggle is based on the latest content', async () => {
    class ConcurrentVault extends FakeVaultGateway {
      override async process(path: string, transform: (content: string) => string): Promise<void> {
        this.files.set(path, 'new heading\n- [ ] latest');
        await super.process(path, transform);
      }
    }

    const vault = new ConcurrentVault();
    await vault.create(TOPIC_PATH, 'old heading\n- [ ] stale');

    await new VaultMutationService(vault).toggleTask(TOPIC_PATH, 2);

    expect(await vault.read(TOPIC_PATH)).toBe('new heading\n- [x] latest');
  });
});

describe('VaultMutationService.advanceStage', () => {
  it('rejects a stale current stage inside the frontmatter update', async () => {
    const vault = await topicVault('制作');

    await expect(new VaultMutationService(vault).advanceStage(TOPIC_PATH, '策划')).rejects.toThrow(
      'Stage changed; refresh and try again',
    );
    expect(vault.metadata.get(TOPIC_PATH)?.stage).toBe('制作');
  });

  it('advances a valid stage and returns the next stage', async () => {
    const vault = await topicVault('策划');

    await expect(new VaultMutationService(vault).advanceStage(TOPIC_PATH, '策划')).resolves.toBe(
      '制作',
    );
    expect(vault.metadata.get(TOPIC_PATH)?.stage).toBe('制作');
  });

  it('rejects advancing the terminal review stage', async () => {
    const vault = await topicVault('复盘');

    await expect(new VaultMutationService(vault).advanceStage(TOPIC_PATH, '复盘')).rejects.toThrow(
      'Review is the terminal stage',
    );
  });
});

describe('VaultMutationService.setAssociationPath', () => {
  it('rejects an association path that does not exist', async () => {
    const vault = await topicVault();

    await expect(
      new VaultMutationService(vault).setAssociationPath(TOPIC_PATH, 'script_path', 'missing.md'),
    ).rejects.toThrow('Associated path not found');
  });

  it('writes an association to an existing file or directory', async () => {
    const vault = await topicVault();
    vault.directories.add('assets');

    await new VaultMutationService(vault).setAssociationPath(TOPIC_PATH, 'asset_path', 'assets');

    expect(vault.metadata.get(TOPIC_PATH)?.asset_path).toBe('assets');
  });

  it('rejects replacing a different non-empty association value', async () => {
    const vault = await topicVault();
    await vault.create('scripts/new.md', 'new');
    vault.metadata.set(TOPIC_PATH, { stage: '选题', script_path: 'scripts/old.md' });

    await expect(
      new VaultMutationService(vault).setAssociationPath(
        TOPIC_PATH,
        'script_path',
        'scripts/new.md',
      ),
    ).rejects.toThrow(/explicit edit/i);
    expect(vault.metadata.get(TOPIC_PATH)?.script_path).toBe('scripts/old.md');
  });
});
