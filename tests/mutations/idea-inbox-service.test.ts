import { describe, expect, it } from 'vitest';

import { IdeaInboxService } from '@/mutations/idea-inbox-service';

import { FakeVaultGateway } from '../support/fake-vault-gateway';

const INBOX = '10-选题池/待评估/灵感收集箱.md';
const CONTENT = '# 灵感收集箱\n\n- 2026-06-24 09:00 念头一\n- 2026-06-25 14:30 念头二\n';

function gateway(): FakeVaultGateway {
  const g = new FakeVaultGateway();
  g.files.set(INBOX, CONTENT);
  return g;
}

describe('IdeaInboxService', () => {
  it('编辑保留时间戳，替换文本', async () => {
    const g = gateway();
    await new IdeaInboxService(g).edit(INBOX, 3, '  改过的念头一  ');
    expect(g.files.get(INBOX)).toBe(
      '# 灵感收集箱\n\n- 2026-06-24 09:00 改过的念头一\n- 2026-06-25 14:30 念头二\n',
    );
  });

  it('删除指定行', async () => {
    const g = gateway();
    await new IdeaInboxService(g).delete(INBOX, 3);
    expect(g.files.get(INBOX)).toBe('# 灵感收集箱\n\n- 2026-06-25 14:30 念头二\n');
  });

  it('编辑空文本抛错', async () => {
    const g = gateway();
    await expect(new IdeaInboxService(g).edit(INBOX, 3, '   ')).rejects.toThrow('Idea must not be empty');
  });
});
