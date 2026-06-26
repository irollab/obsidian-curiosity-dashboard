import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
}));

import { AudienceSignalRepository } from '@/data/audience-signal-repository';
import { DEFAULT_SETTINGS } from '@/settings';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

function settings() {
  return { ...DEFAULT_SETTINGS, topicInboxDir: '10-选题池/待评估', reviewDir: '60-发布复盘', commentDocPath: '20-素材库/受众问题.md' };
}

describe('AudienceSignalRepository', () => {
  it('读灵感收集箱 + 待评估卡 + 复盘高问点 + 评论档', async () => {
    const g = new FakeVaultGateway();
    g.files.set('10-选题池/待评估/灵感收集箱.md', '# 箱\n- 2026-06-01 10:00 想做个 Codex 教程\n- 另一个点子');
    g.files.set('10-选题池/待评估/18-某选题.md', '正文');
    g.metadata.set('10-选题池/待评估/18-某选题.md', { type: '选题', title: '某选题标题' });
    g.files.set('60-发布复盘/第1期-复盘.md', '正文');
    g.metadata.set('60-发布复盘/第1期-复盘.md', { type: '复盘', audience_questions: ['评论里都在问 A', '还有人问 B'] });
    g.files.set('20-素材库/受众问题.md', '# 受众问题\n- 私信问 C\n- 私信问 D');

    const signals = await new AudienceSignalRepository(g, settings()).collect();
    const texts = signals.map((s) => s.text);
    expect(texts).toContain('想做个 Codex 教程');
    expect(texts).toContain('某选题标题');
    expect(texts).toContain('评论里都在问 A');
    expect(texts).toContain('私信问 C');
    expect(signals.find((s) => s.text === '评论里都在问 A')?.kind).toBe('问题');
    expect(signals.find((s) => s.text === '某选题标题')?.kind).toBe('灵感');
  });

  it('缺失文件/无 audience_questions 字段安全跳过', async () => {
    const g = new FakeVaultGateway();
    g.files.set('60-发布复盘/旧复盘.md', '正文');
    g.metadata.set('60-发布复盘/旧复盘.md', { type: '复盘' });
    const signals = await new AudienceSignalRepository(g, settings()).collect();
    expect(signals).toEqual([]);
  });
});
