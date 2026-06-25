import { describe, expect, it } from 'vitest';

import { IdeaCaptureService } from '@/mutations/idea-capture-service';

import { FakeVaultGateway } from '../support/fake-vault-gateway';

const INBOX = '10-选题池/待评估/灵感收集箱.md';
const HEADING = '# 灵感收集箱';
const NOW = (): Date => new Date('2026-06-25T14:30:00');

describe('IdeaCaptureService', () => {
  it('新建收集箱并写入带时间戳的灵感', async () => {
    const gateway = new FakeVaultGateway();
    await new IdeaCaptureService(gateway, NOW).capture(INBOX, '  做一期 codex 选题  ', HEADING);
    expect(gateway.files.get(INBOX)).toBe('# 灵感收集箱\n\n- 2026-06-25 14:30 做一期 codex 选题\n');
  });

  it('已存在则追加新行，保留原内容', async () => {
    const gateway = new FakeVaultGateway();
    gateway.files.set(INBOX, '# 灵感收集箱\n\n- 2026-06-24 09:00 念头一\n');
    await new IdeaCaptureService(gateway, NOW).capture(INBOX, '念头二', HEADING);
    expect(gateway.files.get(INBOX)).toBe(
      '# 灵感收集箱\n\n- 2026-06-24 09:00 念头一\n- 2026-06-25 14:30 念头二\n',
    );
  });

  it('空灵感抛错', async () => {
    const gateway = new FakeVaultGateway();
    await expect(new IdeaCaptureService(gateway, NOW).capture(INBOX, '   ', HEADING)).rejects.toThrow(
      'Idea must not be empty',
    );
  });
});
