import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
}));

import type { DashboardModel, TopicRecord } from '@/domain/models';
import type { WorkflowAction } from '@/domain/workflow';
import { buildPrompt, nextTopicIssue, type PromptBuildResult } from '@/mutations/prompt-builder-service';
import { DEFAULT_SETTINGS } from '@/settings';

function topic(issue: number): TopicRecord {
  return {
    path: `10-选题池/${issue}.md`, basename: String(issue), title: `T${issue}`, issue,
    status: '待评估', stage: null, priority: null, dueDate: null, nextAction: null,
    homepageFocus: false, scriptPath: null, assetPath: null, reviewPath: null,
  };
}

const action: WorkflowAction = {
  id: 'evaluate-topics', label: '批量评估', description: '', group: '选题', order: 2,
  needsFocus: false, output: '10-选题池/待评估', body: '评估 {{inbox_dir}} 焦点 {{focus_title}}',
  sourcePath: '99-模板/codex-提示词/评估.md',
};

function model(overrides: Partial<DashboardModel> = {}): DashboardModel {
  return {
    associationCandidates: { assetPath: [], reviewPath: [], scriptPath: [] },
    backgroundUrl: null, logoUrl: null, commentEvidence: [], focus: { kind: 'none' },
    focusCandidates: [], pickableTopics: [], tasks: [], thisWeek: [], queue: [],
    metrics: [], reviewPath: null, mobileReadOnly: false,
    workflowActions: [action], promptTemplatesPresent: true, promptTemplatesSkipped: [], ideas: [],
    audienceSignals: [], hotspots: [],
    ...overrides,
  };
}

describe('buildPrompt', () => {
  it('用设置目录填充占位符并回传输出位置', () => {
    const result: PromptBuildResult = buildPrompt(action, model(), DEFAULT_SETTINGS, { now: () => new Date('2026-06-25T00:00:00') });
    expect(result.text).toBe('评估 10-选题池/待评估 焦点 ');
    expect(result.output).toBe('10-选题池/待评估');
    expect(result.label).toBe('批量评估');
  });

  it('有焦点时填充焦点字段', () => {
    const focused = model({
      focus: { kind: 'ready', topic: {
        path: '10-选题池/已立项/39.md', basename: '39', title: 'Codex首页', issue: 39,
        status: '已立项', stage: '策划', priority: null, dueDate: null, nextAction: null,
        homepageFocus: true, scriptPath: null, assetPath: null, reviewPath: null,
      } },
    });
    const result = buildPrompt({ ...action, body: '焦点 {{focus_title}} 第{{focus_issue}}期' }, focused, DEFAULT_SETTINGS, { now: () => new Date('2026-06-25T00:00:00') });
    expect(result.text).toBe('焦点 Codex首页 第39期');
  });

  it('用全库（含待评估/已立项/已移走）最大期号 +1 填充 {{next_issue}}', () => {
    const m = model({ pickableTopics: [topic(39), topic(41), topic(12)] });
    const result = buildPrompt(
      { ...action, body: '新卡期号 {{next_issue}}' }, m, DEFAULT_SETTINGS,
      { now: () => new Date('2026-06-25T00:00:00') },
    );
    expect(result.text).toBe('新卡期号 42');
  });

  it('无任何选题时 {{next_issue}} 从 1 开始', () => {
    const result = buildPrompt(
      { ...action, body: '新卡期号 {{next_issue}}' }, model(), DEFAULT_SETTINGS,
      { now: () => new Date('2026-06-25T00:00:00') },
    );
    expect(result.text).toBe('新卡期号 1');
  });

  it('nextTopicIssue 取最大 issue + 1，空集为 1', () => {
    expect(nextTopicIssue([topic(7), topic(40), topic(3)])).toBe(41);
    expect(nextTopicIssue([])).toBe(1);
  });

  it('把选中的灵感按序号填入 {{ideas}}', () => {
    const result = buildPrompt(
      { ...action, body: '想法：\n{{ideas}}' }, model(), DEFAULT_SETTINGS,
      { ideas: ['  做一期 Codex 选题 ', '', '评论区那个问题'], now: () => new Date('2026-06-25T00:00:00') },
    );
    expect(result.text).toBe('想法：\n1. 做一期 Codex 选题\n2. 评论区那个问题');
  });
});
