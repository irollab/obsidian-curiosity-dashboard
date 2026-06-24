import { describe, expect, it } from 'vitest';

import { AssociationResolver } from '@/data/association-resolver';
import type { TopicRecord } from '@/domain/models';
import type { DashboardSettings } from '@/settings';
import { FakeVaultGateway } from '../support/fake-vault-gateway';

const settings: DashboardSettings = {
  topicDir: '10-选题池',
  topicInboxDir: '10-选题池/待评估',
  scriptDir: '40-脚本大纲',
  scriptDraftDir: '40-脚本大纲/草稿',
  assetDir: '20-素材库',
  reviewDir: '60-发布复盘',
  topicTemplate: '99-模板/选题卡模板.md',
  scriptTemplate: '99-模板/脚本大纲模板.md',
  reviewTemplate: '99-模板/发布复盘模板.md',
  promptDir: '99-模板/codex-提示词',
  backgroundPath: '',
  openOnStartup: false,
  defaultTab: 'overview',
  enableMobileView: true,
  language: 'auto',
  focusHistory: [],
};

const baseTopic: TopicRecord = {
  path: '10-选题池/39-Test.md', basename: '39-Test', title: 'Test', issue: 39,
  status: '已立项', stage: '制作', priority: null, dueDate: null, nextAction: null,
  homepageFocus: true, scriptPath: null, assetPath: null, reviewPath: null,
};

describe('AssociationResolver', () => {
  it('fills a unique file association using supported issue prefixes', () => {
    const vault = new FakeVaultGateway();
    vault.files.set('40-脚本大纲/039.md', '');

    const resolved = new AssociationResolver(vault, settings).resolve(baseTopic);

    expect(resolved.scriptPath).toBe('40-脚本大纲/039.md');
  });

  it('does not guess when there are multiple candidates', () => {
    const vault = new FakeVaultGateway();
    vault.files.set('60-发布复盘/039-复盘.md', '');
    vault.files.set('60-发布复盘/39_补充.md', '');

    const resolver = new AssociationResolver(vault, settings);

    expect(resolver.resolve(baseTopic).reviewPath).toBeNull();
    expect(resolver.candidates('/60-发布复盘\\', 39)).toEqual([
      '60-发布复盘/039-复盘.md',
      '60-发布复盘/39_补充.md',
    ]);
  });

  it('never associates non-Markdown files as scripts or reviews', () => {
    const vault = new FakeVaultGateway();
    vault.files.set('40-脚本大纲/39.png', '');
    vault.files.set('60-发布复盘/39.csv', '');

    const resolved = new AssociationResolver(vault, settings).resolve(baseTopic);

    expect(resolved.scriptPath).toBeNull();
    expect(resolved.reviewPath).toBeNull();
  });

  it('rejects fractional, negative, and unsafe issue numbers before matching', () => {
    const vault = new FakeVaultGateway();
    vault.files.set('40-脚本大纲/3x9.md', '');
    vault.files.set('40-脚本大纲/-1.md', '');
    vault.files.set(`40-脚本大纲/${Number.MAX_SAFE_INTEGER + 1}.md`, '');
    const resolver = new AssociationResolver(vault, settings);

    expect(resolver.candidates('40-脚本大纲', 3.9)).toEqual([]);
    expect(resolver.candidates('40-脚本大纲', -1)).toEqual([]);
    expect(resolver.candidates('40-脚本大纲', Number.MAX_SAFE_INTEGER + 1)).toEqual([]);
  });

  it('includes a unique asset folder candidate and deduplicates stable results', () => {
    const vault = new FakeVaultGateway();
    vault.directories.add('20-素材库/第039期-素材');
    vault.files.set('20-素材库/第039期-素材/封面.png', '');

    const resolver = new AssociationResolver(vault, settings);

    expect(resolver.candidates('20-素材库', 39)).toEqual([]);
    expect(resolver.candidates('20-素材库', 39, true)).toEqual([
      '20-素材库/第039期-素材',
    ]);
    expect(resolver.resolve(baseTopic).assetPath).toBe('20-素材库/第039期-素材');
  });

  it('preserves explicit paths before considering automatic candidates', () => {
    const vault = new FakeVaultGateway();
    vault.files.set('40-脚本大纲/39-自动.md', '');
    vault.files.set('60-发布复盘/39-自动.md', '');
    vault.directories.add('20-素材库/39-自动');
    const explicitTopic: TopicRecord = {
      ...baseTopic,
      scriptPath: '手动/脚本.md',
      assetPath: '手动/素材',
      reviewPath: '手动/复盘.md',
    };

    expect(new AssociationResolver(vault, settings).resolve(explicitTopic)).toEqual(explicitTopic);
  });

  it('matches only exact directory prefixes and bounded basename issue numbers', () => {
    const vault = new FakeVaultGateway();
    vault.files.set('40-脚本大纲外/39-越界.md', '');
    vault.files.set('40-脚本大纲/390-错误.md', '');
    vault.files.set('40-脚本大纲/子目录/39-有效.md', '');

    expect(new AssociationResolver(vault, settings).candidates('40-脚本大纲', 39))
      .toEqual(['40-脚本大纲/子目录/39-有效.md']);
  });
});
