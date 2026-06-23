import type { ChecklistTask } from './models';

const TASK_PATTERN = /^- \[([ xX])\](.*)$/;
const HEADING_PATTERN = /^#{1,6}(?:[ \t]+|$)/;

export function parseChecklistSection(
  markdown: string,
  heading = '本期执行清单',
): ChecklistTask[] {
  const lines = markdown.split(/\r\n|\n|\r/);
  const headingLine = `## ${heading}`;
  const start = lines.findIndex((line) => line === headingLine);
  if (start === -1) return [];

  const tasks: ChecklistTask[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || HEADING_PATTERN.test(line)) break;

    const match = TASK_PATTERN.exec(line);
    if (match === null) continue;
    tasks.push({
      line: index + 1,
      text: (match[2] ?? '').trim(),
      checked: match[1] !== ' ',
    });
  }
  return tasks;
}

export function toggleChecklistLine(markdown: string, oneBasedLine: number): string {
  const parts = markdown.split(/(\r\n|\n|\r)/);
  const index = (oneBasedLine - 1) * 2;
  const line = parts[index];
  const match = line === undefined ? null : TASK_PATTERN.exec(line);

  if (line === undefined || match === null) {
    throw new Error(`Checklist task not found at line ${oneBasedLine}`);
  }

  const replacement = match[1] === ' ' ? 'x' : ' ';
  parts[index] = `${line.slice(0, 3)}${replacement}${line.slice(4)}`;
  return parts.join('');
}
