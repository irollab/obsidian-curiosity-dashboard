import { describe, expect, it } from 'vitest';

import { PromptSeedService } from '@/mutations/prompt-seed-service';

import { FakeVaultGateway } from '../support/fake-vault-gateway';

const DIR = '99-模板/codex-提示词';

describe('PromptSeedService', () => {
  it('写入全部默认模板并返回写入数', async () => {
    const gateway = new FakeVaultGateway();
    const written = await new PromptSeedService(gateway).seed(DIR);
    expect(written).toBeGreaterThanOrEqual(10);
    expect([...gateway.files.keys()].every((p) => p.startsWith(`${DIR}/`))).toBe(true);
    // 每个文件都含 frontmatter id 与 label
    for (const content of gateway.files.values()) {
      expect(content).toMatch(/^---[\s\S]*\bid:\s*\S/);
      expect(content).toMatch(/\blabel:\s*\S/);
    }
  });

  it('已存在的文件不覆盖（幂等）', async () => {
    const gateway = new FakeVaultGateway();
    await new PromptSeedService(gateway).seed(DIR);
    const sample = [...gateway.files.keys()][0];
    if (sample === undefined) throw new Error('Expected at least one seeded file');
    gateway.files.set(sample, '我自己改过的内容');
    const writtenSecond = await new PromptSeedService(gateway).seed(DIR);
    expect(writtenSecond).toBe(0);
    expect(gateway.files.get(sample)).toBe('我自己改过的内容');
  });
});
