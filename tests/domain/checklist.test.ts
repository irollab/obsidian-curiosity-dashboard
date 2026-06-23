import { describe, expect, it } from 'vitest';

import { parseChecklistSection, toggleChecklistLine } from '@/domain/checklist';

describe('parseChecklistSection', () => {
  it('parses only tasks under the exact checklist heading until the next heading', () => {
    const markdown = [
      '- [ ] outside',
      '## 本期执行清单其他',
      '- [ ] wrong section',
      '## 本期执行清单',
      '- [ ]   first task   ',
      'notes',
      '- [x] second task',
      '- [X] third task',
      '### stop here',
      '- [ ] after heading',
    ].join('\n');

    expect(parseChecklistSection(markdown)).toEqual([
      { line: 5, text: 'first task', checked: false },
      { line: 7, text: 'second task', checked: true },
      { line: 8, text: 'third task', checked: true },
    ]);
  });

  it('returns an empty list when the exact heading is absent', () => {
    expect(parseChecklistSection('## 执行清单\r\n- [ ] task')).toEqual([]);
  });

  it('accepts a custom exact heading', () => {
    expect(parseChecklistSection('## Custom\r\n- [ ] task', 'Custom')).toEqual([
      { line: 2, text: 'task', checked: false },
    ]);
  });

  it('supports indented section headings and tasks and stops at an indented heading', () => {
    const markdown = [
      '  ## 本期执行清单  ',
      '    - [ ] indented task',
      '  ### next section',
      '    - [ ] excluded task',
    ].join('\n');

    expect(parseChecklistSection(markdown)).toEqual([
      { line: 2, text: 'indented task', checked: false },
    ]);
  });
});

describe('toggleChecklistLine', () => {
  it('toggles only the requested task and preserves CRLF and all other text', () => {
    const markdown = '## 本期执行清单\r\n- [ ] first\r\n- [X] second\r\n';

    expect(toggleChecklistLine(markdown, 3)).toBe(
      '## 本期执行清单\r\n- [ ] first\r\n- [ ] second\r\n',
    );
  });

  it('toggles an indented task without changing its indentation', () => {
    expect(toggleChecklistLine('before\n    - [ ] task\nafter', 2)).toBe(
      'before\n    - [x] task\nafter',
    );
  });

  it.each([0, 1, 3])('rejects a non-task or out-of-range line %s', (line) => {
    expect(() => toggleChecklistLine('title\n- [ ] task', line)).toThrow(
      `Checklist task not found at line ${line}`,
    );
  });
});
