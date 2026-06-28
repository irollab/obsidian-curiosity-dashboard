import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
}));

import { buildDiscoveryPrompt } from '@/mutations/discovery-prompt-builder';
import type { WorkflowAction } from '@/domain/workflow';
import type { Hotspot, AudienceSignal } from '@/domain/discovery';
import { DEFAULT_SETTINGS } from '@/settings';

const action: WorkflowAction = {
  id: 'spark-topics', label: '从热点+受众生成选题卡', description: '', group: '选题',
  order: 3, needsFocus: false, output: '10-选题池/待评估',
  body: '把这些拼成选题卡，放到 {{inbox_dir}}，用 {{topic_template}}，期号 {{next_issue}}。\n热点:\n{{hotspots}}\n受众:\n{{audience_signals}}\n避免与已有重复:\n{{existing_titles}}',
  sourcePath: 'p/11.md',
};

const hotspots: Hotspot[] = [
  { title: 'Claude 4.8 发布', url: 'https://a', source: '官方', publishedAt: '2026-06-25', summary: null },
];
const signals: AudienceSignal[] = [
  { text: '怎么本地跑', kind: '问题', source: '评论档', weight: 3 },
];

describe('buildDiscoveryPrompt', () => {
  it('把热点/受众/去重标题/下一期号格式化进提示词', () => {
    const out = buildDiscoveryPrompt({
      action, hotspots, signals, existingTitles: ['旧选题A'], nextIssue: 42, settings: DEFAULT_SETTINGS,
    });
    expect(out.label).toBe('从热点+受众生成选题卡');
    expect(out.output).toBe('10-选题池/待评估');
    expect(out.text).toContain('10-选题池/待评估');
    expect(out.text).toContain('Claude 4.8 发布');
    expect(out.text).toContain('https://a');
    expect(out.text).toContain('怎么本地跑');
    expect(out.text).toContain('旧选题A');
    expect(out.text).toContain('期号 42');
  });

  it('空列表给出占位文案而非空白', () => {
    const out = buildDiscoveryPrompt({
      action, hotspots: [], signals: [], existingTitles: [], nextIssue: 1, settings: DEFAULT_SETTINGS,
    });
    expect(out.text).toContain('（无）');
  });
});
