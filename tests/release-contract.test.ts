import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('release documentation contract', () => {
  it('keeps the required README sections in order', async () => {
    const readme = await text('README.md');
    const headings = [...readme.matchAll(/^# (.+)$/gm)].map((match) => match[1]);

    expect(headings).toEqual([
      'What it does',
      'Screenshots',
      'Install',
      'Configure your vault',
      'Supported data',
      'Privacy and safety',
      'Development',
      'Release files',
      'License',
    ]);
    expect(readme).toContain(
      'No open-source license has been selected for V1. All rights are reserved unless the repository owner adds a license later.',
    );
  });

  it('documents non-inference, mobile safety, and the exact checklist heading', async () => {
    const fields = await text('docs/fields.md');

    expect(fields).toContain('## 本期执行清单');
    expect(fields).toContain('选题 → 策划 → 制作 → 发布 → 复盘');
    expect(fields).toContain('不推断');
    expect(fields).toContain('移动端始终只读');
  });

  it('documents every controlled write including association frontmatter', async () => {
    const readme = await text('README.md');

    expect(readme).toContain(
      '受控写入 `script_path`、`asset_path` 和 `review_path` 关联字段',
    );
  });

  it('targets Node 24 CI on Windows and macOS with read-only permissions', async () => {
    const workflow = await text('.github/workflows/ci.yml');

    expect(workflow).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('macos-latest');
    expect(workflow).toMatch(/node-version:\s*24/);
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('npm run package');
    expect(workflow.indexOf('npm run package')).toBeGreaterThan(
      workflow.indexOf('npm run build'),
    );
  });

  it('derives release identity from manifest and package metadata', async () => {
    const script = await text('scripts/package.mjs');
    const packageJson = JSON.parse(await text('package.json')) as {
      scripts: Record<string, string>;
    };
    const verifier = await text('scripts/verify-package.mjs');

    expect(script).toContain("readFile('package.json'");
    expect(script).toContain("readFile('manifest.json'");
    expect(script).not.toContain('curiosity-dashboard-0.1.0.zip');
    expect(packageJson.scripts.package).toContain('node scripts/verify-package.mjs');
    expect(verifier).toContain('inflateRawSync');
    expect(verifier).toContain('0x02014b50');
    expect(verifier).toContain('0x04034b50');
    expect(verifier).toContain('crc32');
  });
});

async function text(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}
