import { describe, expect, it } from 'vitest';

import { PromptTemplateRepository } from '@/data/prompt-template-repository';

import { FakeVaultGateway } from '../support/fake-vault-gateway';

const DIR = '99-模板/codex-提示词';

function gatewayWith(files: Record<string, string>): FakeVaultGateway {
  const gateway = new FakeVaultGateway();
  for (const [path, content] of Object.entries(files)) gateway.files.set(path, content);
  return gateway;
}

const VALID = `---
id: evaluate-topics
label: 批量评估待评估选题
stage: 选题
order: 2
needs_focus: false
output: "10-选题池/待评估"
description: 给结论不改文件
---
目标：评估 {{inbox_dir}}`;

describe('PromptTemplateRepository', () => {
  it('解析合法模板并按 group+order 排序', async () => {
    const gateway = gatewayWith({
      [`${DIR}/2-评估.md`]: VALID,
      [`${DIR}/1-收集.md`]: `---\nid: collect\nlabel: 收集灵感\nstage: 选题\norder: 1\nneeds_focus: false\noutput: "10-选题池/待评估"\n---\n正文`,
    });
    const actions = (await PromptTemplateRepository.load(gateway, DIR)).all();
    expect(actions.map((a) => a.id)).toEqual(['collect', 'evaluate-topics']);
    const evaluate = actions[1];
    if (evaluate === undefined) throw new Error('Expected second action');
    expect(evaluate.group).toBe('选题');
    expect(evaluate.needsFocus).toBe(false);
    expect(evaluate.output).toBe('10-选题池/待评估');
    expect(evaluate.body.trim()).toBe('目标：评估 {{inbox_dir}}');
  });

  it('stage 非法或为 general 归入通用组', async () => {
    const gateway = gatewayWith({
      [`${DIR}/x.md`]: `---\nid: verify\nlabel: 联网核验\nstage: general\norder: 1\nneeds_focus: false\noutput: "30-竞品热点/热点观察"\n---\n正文`,
    });
    const [action] = (await PromptTemplateRepository.load(gateway, DIR)).all();
    if (action === undefined) throw new Error('Expected one action');
    expect(action.group).toBe('general');
  });

  it('缺 id 或 label 的文件被跳过并记入 skipped', async () => {
    const gateway = gatewayWith({
      [`${DIR}/bad.md`]: `---\nlabel: 没有id\n---\n正文`,
      [`${DIR}/ok.md`]: VALID,
    });
    const repo = await PromptTemplateRepository.load(gateway, DIR);
    expect(repo.all()).toHaveLength(1);
    expect(repo.skipped()).toEqual(['99-模板/codex-提示词/bad.md']);
  });

  it('output 留空时为 null（只读类）', async () => {
    const gateway = gatewayWith({
      [`${DIR}/r.md`]: `---\nid: eval\nlabel: 评估\nstage: 选题\norder: 1\nneeds_focus: false\n---\n正文`,
    });
    const [action] = (await PromptTemplateRepository.load(gateway, DIR)).all();
    if (action === undefined) throw new Error('Expected one action');
    expect(action.output).toBeNull();
  });

  it('目录不存在时 all() 为空、present() 为 false', async () => {
    const repo = await PromptTemplateRepository.load(new FakeVaultGateway(), DIR);
    expect(repo.all()).toEqual([]);
    expect(repo.present()).toBe(false);
  });
});
