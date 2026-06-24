import { describe, expect, it } from 'vitest';

import { VaultMutationService } from '@/mutations/vault-mutation-service';
import type { ChecklistTask } from '@/domain/models';
import type { Stage } from '@/domain/stages';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

const TOPIC_PATH = 'topics/topic.md';

async function topicVault(stage: Stage = '选题'): Promise<FakeVaultGateway> {
  const vault = new FakeVaultGateway();
  await vault.create(TOPIC_PATH, '## 本期执行清单\n- [ ] first\n- [ ] second');
  vault.metadata.set(TOPIC_PATH, { stage });
  return vault;
}

describe('VaultMutationService.toggleTask', () => {
  const secondTask: ChecklistTask = { line: 3, text: 'second', checked: false };

  class ConcurrentVault extends FakeVaultGateway {
    constructor(private readonly latestContent: string) {
      super();
    }

    override async process(path: string, transform: (content: string) => string): Promise<void> {
      this.files.set(path, this.latestContent);
      await super.process(path, transform);
    }
  }

  it('toggles only the requested task', async () => {
    const vault = await topicVault();

    await new VaultMutationService(vault).toggleTask(TOPIC_PATH, secondTask);

    expect(await vault.read(TOPIC_PATH)).toBe('## 本期执行清单\n- [ ] first\n- [x] second');
  });

  it('toggles when the latest section still contains the identical task', async () => {
    const latest = '## 本期执行清单\n- [ ] latest\nnew note';
    const vault = new ConcurrentVault(latest);
    await vault.create(TOPIC_PATH, '## 本期执行清单\n- [ ] latest\nold note');

    await new VaultMutationService(vault).toggleTask(TOPIC_PATH, {
      line: 2,
      text: 'latest',
      checked: false,
    });

    expect(await vault.read(TOPIC_PATH)).toBe('## 本期执行清单\n- [x] latest\nnew note');
  });

  it.each([
    ['an inserted task shifts the target', '## 本期执行清单\n- [ ] first\n- [ ] inserted\n- [ ] second'],
    ['a deleted task shifts the target', '## 本期执行清单\n- [ ] second'],
    ['the task text is replaced', '## 本期执行清单\n- [ ] first\n- [ ] replacement'],
    ['the task state has changed', '## 本期执行清单\n- [ ] first\n- [x] second'],
    ['the task moved outside the section', '## 本期执行清单\n- [ ] first\n## Other\n- [ ] second'],
  ])('rejects stale task data when %s', async (_case, latest) => {
    const vault = new ConcurrentVault(latest);
    await vault.create(TOPIC_PATH, '## 本期执行清单\n- [ ] first\n- [ ] second');

    await expect(
      new VaultMutationService(vault).toggleTask(TOPIC_PATH, secondTask),
    ).rejects.toThrow('Task changed; refresh and try again');
    expect(await vault.read(TOPIC_PATH)).toBe(latest);
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

  it('reports a stale stage before treating the requested stage as terminal', async () => {
    const vault = await topicVault('发布');

    await expect(new VaultMutationService(vault).advanceStage(TOPIC_PATH, '复盘')).rejects.toThrow(
      'Stage changed; refresh and try again',
    );
  });
});

describe('VaultMutationService.setAssociationPath', () => {
  it('requires the topic to remain the homepage focus when requested', async () => {
    const vault = await topicVault();
    await vault.create('scripts/new.md', 'new');
    vault.metadata.set(TOPIC_PATH, { homepage_focus: false, stage: '选题' });

    await expect(
      new VaultMutationService(vault).setAssociationPath(
        TOPIC_PATH,
        'script_path',
        'scripts/new.md',
        { requireHomepageFocus: true },
      ),
    ).rejects.toThrow('Topic is no longer the homepage focus');
    expect(vault.metadata.get(TOPIC_PATH)?.script_path).toBeUndefined();
  });
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

  it('allows replacing an empty string association value', async () => {
    const vault = await topicVault();
    await vault.create('scripts/new.md', 'new');
    vault.metadata.set(TOPIC_PATH, { stage: '选题', script_path: '' });

    await new VaultMutationService(vault).setAssociationPath(
      TOPIC_PATH,
      'script_path',
      'scripts/new.md',
    );

    expect(vault.metadata.get(TOPIC_PATH)?.script_path).toBe('scripts/new.md');
  });

  it.each([42, ['scripts/old.md'], { path: 'scripts/old.md' }])(
    'rejects replacing an invalid non-empty association value: %j',
    async (existing) => {
      const vault = await topicVault();
      await vault.create('scripts/new.md', 'new');
      vault.metadata.set(TOPIC_PATH, { stage: '选题', script_path: existing });

      await expect(
        new VaultMutationService(vault).setAssociationPath(
          TOPIC_PATH,
          'script_path',
          'scripts/new.md',
        ),
      ).rejects.toThrow(/explicit edit/i);
      expect(vault.metadata.get(TOPIC_PATH)?.script_path).toEqual(existing);
    },
  );
});

describe('VaultMutationService.switchHomepageFocus', () => {
  it('transfers the homepage focus from the current topic to the target', async () => {
    const vault = await topicVault();
    await vault.create('topics/other.md', '');
    vault.metadata.set(TOPIC_PATH, { stage: '选题', homepage_focus: true });
    vault.metadata.set('topics/other.md', { stage: '制作', homepage_focus: false });

    await new VaultMutationService(vault).switchHomepageFocus(TOPIC_PATH, 'topics/other.md');

    expect(vault.metadata.get(TOPIC_PATH)?.homepage_focus).toBe(false);
    expect(vault.metadata.get('topics/other.md')?.homepage_focus).toBe(true);
  });

  it('only marks the target when the current focus is unknown', async () => {
    const vault = await topicVault();
    await vault.create('topics/other.md', '');
    vault.metadata.set('topics/other.md', { stage: '制作', homepage_focus: false });

    await new VaultMutationService(vault).switchHomepageFocus(null, 'topics/other.md');

    expect(vault.metadata.get('topics/other.md')?.homepage_focus).toBe(true);
  });

  it('keeps a single topic focused when re-selecting the current focus', async () => {
    const vault = await topicVault();
    vault.metadata.set(TOPIC_PATH, { stage: '选题', homepage_focus: true });

    await new VaultMutationService(vault).switchHomepageFocus(TOPIC_PATH, TOPIC_PATH);

    expect(vault.metadata.get(TOPIC_PATH)?.homepage_focus).toBe(true);
  });
});
