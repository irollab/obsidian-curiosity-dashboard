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
  language: 'auto',
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

  it('preserves the gateway Markdown semantics for uppercase extensions', async () => {
    const vault = new SemanticMarkdownVaultGateway(['10-选题池/39-Topic.MD']);
    addTopic(vault, '10-选题池/39-Topic.MD', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('ready');
    if (model.focus.kind !== 'ready') throw new Error('Expected ready focus');
    expect(model.focus.topic.path).toBe('10-选题池/39-Topic.MD');
    expect(model.tasks).toHaveLength(2);
  });

  it('excludes md-looking files that the gateway does not classify as Markdown', async () => {
    const vault = new SemanticMarkdownVaultGateway([]);
    addTopic(vault, '10-选题池/39-Fake.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    addReview(vault, '60-发布复盘/fake.md', '999', '2026-06-22');
    vault.files.set('40-脚本大纲/39-fake.md', '# Fake script');

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('none');
    expect(model.reviewPath).toBeNull();
    expect(model.metrics).toEqual([]);
    expect(model.associationCandidates).toEqual({ scriptPath: [], assetPath: [], reviewPath: [] });
  });

  it('requires an external explicit review to belong to the gateway Markdown set', async () => {
    const vault = new SemanticMarkdownVaultGateway([
      '10-选题池/39-Focus.md',
      '60-发布复盘/fallback.md',
    ]);
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
      review_path: 'archive/not-markdown.md',
    });
    addReview(vault, 'archive/not-markdown.md', '999', '2026-06-23');
    addReview(vault, '60-发布复盘/fallback.md', '100', '2026-06-22');

    const model = await service(vault).load(false);

    expect(model.reviewPath).toBeNull();
    expect(model.metrics).toEqual([]);
  });

  it('retries when the selected focus is renamed before it can be read', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Old.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    vault.onRead = (path) => {
      if (path !== '10-选题池/39-Old.md') return;
      vault.files.delete(path);
      vault.metadata.delete(path);
      addTopic(vault, '10-选题池/40-New.md', '# New\n' + CHECKLIST, {
        issue: 40,
        stage: '发布',
        homepage_focus: true,
      });
    };

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('ready');
    if (model.focus.kind !== 'ready') throw new Error('Expected ready focus');
    expect(model.focus.topic.path).toBe('10-选题池/40-New.md');
    expect(model.focus.topic.issue).toBe(40);
    expect(model.tasks).toHaveLength(2);
    expect(vault.readPaths.filter((path) => path.includes('Old.md'))).toHaveLength(1);
  });

  it('retries when a selected review disappears and safely falls back to the remaining review', async () => {
    const vault = new HookVaultGateway();
    addReview(vault, '60-发布复盘/new.md', '200', '2026-06-22');
    addReview(vault, '60-发布复盘/old.md', '100', '2026-06-20');
    vault.onRead = (path) => {
      if (path !== '60-发布复盘/new.md') return;
      vault.files.delete(path);
      vault.metadata.delete(path);
    };

    const model = await service(vault).load(false);

    expect(model.reviewPath).toBe('60-发布复盘/old.md');
    expect(model.metrics[0]?.views).toBe('100');
  });

  it('does not expose another work metrics when an explicit review disappears', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
      review_path: ' archive/explicit.md ',
    });
    addReview(vault, 'archive/explicit.md', '200', '2026-06-23');
    addReview(vault, '60-发布复盘/fallback.md', '100', '2026-06-20');
    const deleteExplicitReview = (path: string): void => {
      if (path !== 'archive/explicit.md') {
        vault.onRead = deleteExplicitReview;
        return;
      }
      vault.files.delete(path);
      vault.metadata.delete(path);
    };
    vault.onRead = deleteExplicitReview;

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('ready');
    if (model.focus.kind !== 'ready') throw new Error('Expected ready focus');
    expect(model.focus.topic.reviewPath).toBe('archive/explicit.md');
    expect(model.reviewPath).toBeNull();
    expect(model.metrics).toEqual([]);
  });

  it.each([
    {
      field: 'script_path',
      rawPath: ' \\40-脚本大纲\\39.md\\ ',
      normalizedPath: '40-脚本大纲/39.md',
      kind: 'file',
    },
    {
      field: 'asset_path',
      rawPath: ' /20-素材库\\39素材/ ',
      normalizedPath: '20-素材库/39素材',
      kind: 'folder',
    },
  ] as const)(
    'normalizes and fingerprints an explicit $field path',
    async ({ field, rawPath, normalizedPath, kind }) => {
      const vault = new HookVaultGateway();
      addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
        issue: 39,
        stage: '制作',
        homepage_focus: true,
        [field]: rawPath,
      });
      if (kind === 'file') vault.files.set(normalizedPath, '# Explicit');
      else vault.directories.add(normalizedPath);
      vault.onRead = (path) => {
        if (path !== '10-选题池/39-Focus.md') return;
        if (kind === 'file') vault.files.delete(normalizedPath);
        else vault.directories.delete(normalizedPath);
      };

      const model = await service(vault).load(false);

      expect(model.focus.kind).toBe('ready');
      if (model.focus.kind !== 'ready') throw new Error('Expected ready focus');
      expect(field === 'script_path' ? model.focus.topic.scriptPath : model.focus.topic.assetPath).toBe(
        normalizedPath,
      );
      expect(vault.readPaths.filter((path) => path.endsWith('39-Focus.md'))).toHaveLength(2);
    },
  );

  it('uses one settings snapshot even when the original object changes during an awaited read', async () => {
    const vault = new HookVaultGateway();
    const settings = { ...SETTINGS, backgroundPath: '80-制作资产/original.png' };
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    addReview(vault, '60-发布复盘/original.md', '100', '2026-06-22');
    addReview(vault, 'other-reviews/changed.md', '999', '2026-06-23');
    vault.files.set('80-制作资产/original.png', 'original');
    vault.files.set('changed.png', 'changed');
    vault.onRead = (path) => {
      if (path !== '10-选题池/39-Focus.md') return;
      settings.topicDir = 'other-topics';
      settings.scriptDir = 'other-scripts';
      settings.assetDir = 'other-assets';
      settings.reviewDir = 'other-reviews';
      settings.backgroundPath = 'changed.png';
    };

    const model = await new DashboardDataService(vault, settings).load(false);

    expect(model.focus.kind).toBe('ready');
    expect(model.reviewPath).toBe('60-发布复盘/original.md');
    expect(model.metrics[0]?.views).toBe('100');
    expect(model.backgroundUrl).toContain('original.png');
  });

  it('retries when focus-selection metadata changes during a read', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    addTopic(vault, '10-选题池/40-Other.md', '# Other', {
      issue: 40,
      stage: '策划',
      homepage_focus: false,
    });
    vault.onRead = (path) => {
      if (path !== '10-选题池/39-Focus.md') return;
      const metadata = vault.metadata.get('10-选题池/40-Other.md');
      if (metadata !== undefined) metadata.homepage_focus = true;
    };

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('multiple');
    expect(model.tasks).toEqual([]);
  });

  it('does not retry or rescan without bound for one stable load', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
      script_path: '40-脚本大纲/39.md',
      asset_path: '20-素材库/39',
      review_path: '60-发布复盘/39.md',
    });
    vault.files.set('40-脚本大纲/39.md', '# Script');
    vault.directories.add('20-素材库/39');
    addReview(vault, '60-发布复盘/39.md', '100', '2026-06-22');

    await service(vault).load(false);

    expect(vault.readPaths).toEqual([
      '10-选题池/39-Focus.md',
      '60-发布复盘/39.md',
    ]);
    expect(vault.markdownScans).toBe(2);
    expect(vault.fileScans).toBe(2);
    expect(vault.folderScans).toBe(2);
  });

  it.each([
    { label: 'empty', scripts: [] },
    { label: 'ambiguous', scripts: ['40-脚本大纲/39-a.md', '40-脚本大纲/39-b.md'] },
  ])('bounds underlying path scans for $label associations', async ({ scripts }) => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    for (const path of scripts) vault.files.set(path, '# Script');

    await service(vault).load(false);

    expect(vault.markdownScans).toBeLessThanOrEqual(2);
    expect(vault.fileScans).toBeLessThanOrEqual(2);
    expect(vault.folderScans).toBeLessThanOrEqual(2);
  });

  it('does not retry when an unrelated script changes during an awaited read', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    vault.files.set('40-脚本大纲/39-only.md', '# Only');
    vault.onRead = (path) => {
      if (path === '10-选题池/39-Focus.md') {
        vault.files.set('40-脚本大纲/99-unrelated.md', '# Unrelated');
      }
    };

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('ready');
    if (model.focus.kind !== 'ready') throw new Error('Expected ready focus');
    expect(model.focus.topic.scriptPath).toBe('40-脚本大纲/39-only.md');
    expect(vault.readPaths.filter((path) => path.endsWith('39-Focus.md'))).toHaveLength(1);
  });

  it('ignores script-directory changes when there is no focus', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Idle.md', '# Idle', {
      issue: 39,
      stage: '策划',
      homepage_focus: false,
    });
    addReview(vault, '60-发布复盘/latest.md', '100', '2026-06-22');
    vault.onRead = (path) => {
      if (path === '60-发布复盘/latest.md') {
        vault.files.set('40-脚本大纲/39-unrelated.md', '# Unrelated');
      }
    };

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('none');
    expect(model.reviewPath).toBe('60-发布复盘/latest.md');
    expect(vault.readPaths).toEqual(['60-发布复盘/latest.md']);
  });

  it('retries when a same-issue association candidate changes during an awaited read', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    vault.files.set('40-脚本大纲/39-first.md', '# First');
    vault.onRead = (path) => {
      if (path === '10-选题池/39-Focus.md') {
        vault.files.set('40-脚本大纲/39-second.md', '# Second');
      }
    };

    const model = await service(vault).load(false);

    expect(model.focus.kind).toBe('ready');
    if (model.focus.kind !== 'ready') throw new Error('Expected ready focus');
    expect(model.focus.topic.scriptPath).toBeNull();
    expect(model.associationCandidates.scriptPath).toEqual([
      '40-脚本大纲/39-first.md',
      '40-脚本大纲/39-second.md',
    ]);
    expect(vault.readPaths.filter((path) => path.endsWith('39-Focus.md'))).toHaveLength(2);
  });

  it('does not hide a stable non-transient read error', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', CHECKLIST, {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    vault.readError = new Error('permission denied');

    await expect(service(vault).load(false)).rejects.toThrow('permission denied');
    expect(vault.readPaths).toHaveLength(1);
  });

  it('fails clearly after two consecutively inconsistent snapshots', async () => {
    const vault = new HookVaultGateway();
    addTopic(vault, '10-选题池/39-Focus.md', '# Focus', {
      issue: 39,
      stage: '制作',
      homepage_focus: true,
    });
    addReview(vault, '60-发布复盘/review.md', '100', '2026-06-22');
    const mutateEveryRead = (path: string): void => {
      vault.onRead = mutateEveryRead;
      if (path !== '60-发布复盘/review.md') return;
      const metadata = vault.metadata.get('10-选题池/39-Focus.md');
      if (metadata !== undefined) metadata.stage = metadata.stage === '制作' ? '发布' : '制作';
    };
    vault.onRead = mutateEveryRead;

    await expect(service(vault).load(false)).rejects.toThrow(
      'Dashboard snapshot changed repeatedly during load',
    );
    expect(vault.readPaths.filter((path) => path.endsWith('review.md'))).toHaveLength(2);
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

class HookVaultGateway extends FakeVaultGateway {
  onRead: ((path: string) => void) | null = null;
  readError: Error | null = null;
  readonly readPaths: string[] = [];
  markdownScans = 0;
  fileScans = 0;
  folderScans = 0;

  override listPaths(): string[] {
    this.fileScans += 1;
    return super.listPaths();
  }

  override listMarkdownPaths(): string[] {
    this.markdownScans += 1;
    return [...this.files.keys()]
      .map((path) => path.replace(/\\/g, '/').replace(/^\/+/, ''))
      .filter((path) => path.endsWith('.md'));
  }

  override listFolders(): string[] {
    this.folderScans += 1;
    return super.listFolders();
  }

  override async read(path: string): Promise<string> {
    const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
    this.readPaths.push(normalized);
    const hook = this.onRead;
    this.onRead = null;
    hook?.(normalized);
    if (this.readError !== null) throw this.readError;
    return super.read(normalized);
  }
}

class SemanticMarkdownVaultGateway extends FakeVaultGateway {
  constructor(private readonly markdownPaths: string[]) {
    super();
  }

  override listMarkdownPaths(): string[] {
    return [...this.markdownPaths];
  }
}
