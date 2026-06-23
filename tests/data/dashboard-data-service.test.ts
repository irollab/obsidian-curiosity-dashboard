import { DashboardDataService } from '@/data/dashboard-data-service';
import type { DashboardSettings } from '@/settings';
import { describe, expect, it } from 'vitest';

import { FakeVaultGateway } from '../support/fake-vault-gateway';

const CHECKLIST = '## 本期执行清单\n- [x] 已完成\n- [ ] 待处理';
const SETTINGS: DashboardSettings = {
  topicDir: '10-选题池',
  scriptDir: '40-脚本大纲',
  assetDir: '20-素材库',
  reviewDir: '60-发布复盘',
  topicTemplate: '99-模板/选题卡模板.md',
  scriptTemplate: '99-模板/脚本大纲模板.md',
  reviewTemplate: '99-模板/发布复盘模板.md',
  backgroundPath: '',
  openOnStartup: false,
  defaultTab: 'overview',
  enableMobileView: true,
};
const NON_READY_FOCUS_CASES: Array<{
  kind: 'none' | 'multiple';
  focusedPaths: string[];
}> = [
  { kind: 'none', focusedPaths: [] },
  {
    kind: 'multiple',
    focusedPaths: ['10-选题池/39-A.md', '10-选题池/40-B.md'],
  },
];

describe('DashboardDataService', () => {
  it('composes a ready focus from local topics, associations, tasks, review data, and background', async () => {
    const vault = new FakeVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    addTopic(vault, '10-选题池/40-Queue.md', '# Queue', { issue: 40, stage: '策划' });
    vault.files.set('40-脚本大纲/39-成稿.md', '# Script');
    vault.directories.add('20-素材库/39-素材');
    vault.files.set(
      '60-发布复盘/第39期-复盘.md',
      '| 平台 | 播放/观看 |\n| --- | ---: |\n| B站 | 100 |\n\n## 评论区需求\n- 需要安装说明',
    );
    vault.metadata.set('60-发布复盘/第39期-复盘.md', {
      type: '发布复盘',
      created: '2026-06-22',
    });
    vault.files.set('80-制作资产/background.png', 'binary-placeholder');

    const model = await service(vault, '80-制作资产/background.png').load(true);

    expect(model.focus.kind).toBe('ready');
    if (model.focus.kind !== 'ready') throw new Error('Expected ready focus');
    expect(model.focus.topic.scriptPath).toBe('40-脚本大纲/39-成稿.md');
    expect(model.focus.topic.assetPath).toBe('20-素材库/39-素材');
    expect(model.focus.topic.reviewPath).toBe('60-发布复盘/第39期-复盘.md');
    expect(model.tasks).toHaveLength(2);
    expect(model.queue.map((topic) => topic.issue)).toEqual([40]);
    expect(model.metrics[0]?.views).toBe('100');
    expect(model.commentEvidence).toEqual(['需要安装说明']);
    expect(model.reviewPath).toBe('60-发布复盘/第39期-复盘.md');
    expect(model.backgroundUrl).toContain('background.png');
    expect(model.mobileReadOnly).toBe(true);
    expect(model.associationCandidates).toEqual({ scriptPath: [], assetPath: [], reviewPath: [] });
  });

  it('keeps an invalid-stage focus and prioritizes its explicit review', async () => {
    const vault = new FakeVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '调研',
      homepage_focus: true,
      review_path: '60-发布复盘/explicit.md',
    });
    addReview(vault, '60-发布复盘/explicit.md', '10', '2026-01-01');
    addReview(vault, '60-发布复盘/latest.md', '999', '2026-06-22');

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('invalid-stage');
    expect(model.tasks).toHaveLength(2);
    expect(model.reviewPath).toBe('60-发布复盘/explicit.md');
    expect(model.metrics[0]?.views).toBe('10');
    expect(model.mobileReadOnly).toBe(false);
  });

  it.each(NON_READY_FOCUS_CASES)(
    'does not read an arbitrary topic for a $kind focus',
    async ({ kind, focusedPaths }) => {
      const vault = new FakeVaultGateway();
      addTopic(vault, '10-选题池/39-A.md', CHECKLIST, {
        issue: 39,
        stage: '制作',
        homepage_focus: focusedPaths.includes('10-选题池/39-A.md'),
      });
      addTopic(vault, '10-选题池/40-B.md', CHECKLIST, {
        issue: 40,
        stage: '策划',
        homepage_focus: focusedPaths.includes('10-选题池/40-B.md'),
      });
      addReview(vault, '60-发布复盘/latest.md', '88', '2026-06-22');

      const model = await service(vault).load(false);

      expect(model.focus.kind).toBe(kind);
      expect(model.tasks).toEqual([]);
      expect(model.associationCandidates).toEqual({
        scriptPath: [],
        assetPath: [],
        reviewPath: [],
      });
      expect(model.reviewPath).toBe('60-发布复盘/latest.md');
      expect(model.metrics[0]?.views).toBe('88');
    },
  );

  it('exposes only unresolved ambiguous associations with the correct file and folder semantics', async () => {
    const vault = new FakeVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
      script_path: '40-脚本大纲/explicit.md',
    });
    vault.files.set('40-脚本大纲/explicit.md', '# Explicit');
    vault.files.set('20-素材库/39-a.png', 'a');
    vault.directories.add('20-素材库/39-b');
    vault.files.set('60-发布复盘/39-a.md', '# A');
    vault.files.set('60-发布复盘/39-b.md', '# B');

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('ready');
    if (model.focus.kind !== 'ready') throw new Error('Expected ready focus');
    expect(model.focus.topic.scriptPath).toBe('40-脚本大纲/explicit.md');
    expect(model.focus.topic.assetPath).toBeNull();
    expect(model.focus.topic.reviewPath).toBeNull();
    expect(model.associationCandidates).toEqual({
      scriptPath: [],
      assetPath: ['20-素材库/39-a.png', '20-素材库/39-b'],
      reviewPath: ['60-发布复盘/39-a.md', '60-发布复盘/39-b.md'],
    });
  });

  it('returns null for an unconfigured, missing, or unusable background', async () => {
    const vault = new FakeVaultGateway();
    expect((await service(vault).load(false)).backgroundUrl).toBeNull();
    expect((await service(vault, 'missing.png').load(false)).backgroundUrl).toBeNull();

    vault.files.set('background.png', 'binary-placeholder');
    const noResourceVault = Object.assign(vault, { resourceUrl: () => null });
    expect((await service(noResourceVault, 'background.png').load(false)).backgroundUrl).toBeNull();
  });

  it('takes a fresh topic snapshot on each load while sharing one snapshot inside a load', async () => {
    const vault = new FakeVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    const dashboard = service(vault);

    const first = await dashboard.load(false);
    addTopic(vault, '10-选题池/40-New.md', '# New', { issue: 40, stage: '策划' });
    const second = await dashboard.load(false);

    expect(first.queue).toEqual([]);
    expect(second.queue.map((topic) => topic.issue)).toEqual([40]);
  });
});

function service(vault: FakeVaultGateway, backgroundPath = ''): DashboardDataService {
  return new DashboardDataService(vault, { ...SETTINGS, backgroundPath });
}

function addTopic(
  vault: FakeVaultGateway,
  path: string,
  markdown: string,
  frontmatter: Record<string, unknown>,
): void {
  vault.files.set(path, markdown);
  vault.metadata.set(path, { type: '选题', status: '已立项', ...frontmatter });
}

function addReview(
  vault: FakeVaultGateway,
  path: string,
  views: string,
  created: string,
): void {
  vault.files.set(path, `| 平台 | 播放/观看 |\n| --- | ---: |\n| B站 | ${views} |`);
  vault.metadata.set(path, { type: '发布复盘', created });
}
