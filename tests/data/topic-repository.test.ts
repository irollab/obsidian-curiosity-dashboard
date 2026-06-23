import { describe, expect, it } from 'vitest';

import { TopicRepository } from '@/data/topic-repository';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

function addTopic(
  vault: FakeVaultGateway,
  path: string,
  frontmatter: Record<string, unknown>,
): void {
  vault.files.set(path, '');
  vault.metadata.set(path, frontmatter);
}

describe('TopicRepository', () => {
  it('maps topic frontmatter and prefers a numeric issue over the filename', () => {
    const vault = new FakeVaultGateway();
    addTopic(vault, '10-选题池/已立项/039-文件标题.md', {
      type: '选题',
      issue: 40,
      title: '  Frontmatter 标题  ',
      status: '已立项',
      stage: '制作',
      priority: '  P1 ',
      due_date: '2026-06-28',
      next_action: '  写开场 ',
      homepage_focus: true,
      script_path: '/40-脚本大纲\\40.md/',
      asset_path: '\\20-素材库\\40\\',
      review_path: '/60-发布复盘/40.md/',
    });

    expect(new TopicRepository(vault, '/10-选题池\\').all()).toEqual([
      {
        path: '10-选题池/已立项/039-文件标题.md',
        basename: '039-文件标题',
        title: 'Frontmatter 标题',
        issue: 40,
        status: '已立项',
        stage: '制作',
        priority: 'P1',
        dueDate: '2026-06-28',
        nextAction: '写开场',
        homepageFocus: true,
        scriptPath: '40-脚本大纲/40.md',
        assetPath: '20-素材库/40',
        reviewPath: '60-发布复盘/40.md',
      },
    ]);
  });

  it('falls back to the filename issue and title while ignoring invalid entries', () => {
    const vault = new FakeVaultGateway();
    addTopic(vault, '10-选题池/007期_回退标题.md', {
      type: '选题',
      title: '   ',
      status: '待评估',
      stage: '不存在',
    });
    addTopic(vault, '10-选题池/008-不是选题.md', { type: '笔记' });
    addTopic(vault, '10-选题池/没有期数.md', { type: '选题' });
    addTopic(vault, '10-选题池外/009-越界.md', { type: '选题' });
    addTopic(vault, '10-选题池/010-非Markdown.txt', { type: '选题' });

    const topics = new TopicRepository(vault, '10-选题池').all();

    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ issue: 7, title: '回退标题', stage: null });
  });

  it('builds a non-focus production queue ordered by due date and issue', () => {
    const vault = new FakeVaultGateway();
    addTopic(vault, '10-选题池/1-A.md', {
      type: '选题', status: '已立项', issue: 1, due_date: '2026-07-01',
    });
    addTopic(vault, '10-选题池/2-B.md', {
      type: '选题', status: '已立项', issue: 2, due_date: '2026-06-30',
    });
    addTopic(vault, '10-选题池/3-C.md', {
      type: '选题', status: '已立项', issue: 3, due_date: '2026-06-30',
    });
    addTopic(vault, '10-选题池/4-D.md', {
      type: '选题', status: '已立项', issue: 4,
    });
    addTopic(vault, '10-选题池/5-E.md', {
      type: '选题', status: '已立项', issue: 5, homepage_focus: true,
    });
    addTopic(vault, '10-选题池/6-F.md', {
      type: '选题', status: '待评估', issue: 6, due_date: '2026-06-20',
    });

    expect(new TopicRepository(vault, '10-选题池').productionQueue().map((topic) => topic.issue))
      .toEqual([2, 3, 1, 4]);
  });

  it('uses local Monday and Sunday boundaries and excludes review or invalid dates', () => {
    const vault = new FakeVaultGateway();
    const entries = [
      [1, '2026-06-22', '制作'],
      [2, '2026-06-28', '发布'],
      [3, '2026-06-21', '制作'],
      [4, '2026-06-29', '制作'],
      [5, '2026-06-25', '复盘'],
      [6, 'not-a-date', '制作'],
      [7, undefined, '制作'],
    ] as const;
    for (const [issue, dueDate, stage] of entries) {
      addTopic(vault, `10-选题池/${issue}-Topic.md`, {
        type: '选题', issue, status: '已立项', stage, due_date: dueDate,
      });
    }

    const issues = new TopicRepository(vault, '10-选题池')
      .thisWeek(new Date(2026, 5, 24, 12))
      .map((topic) => topic.issue);

    expect(issues).toEqual([1, 2]);
  });
});
