import type { VaultGateway } from '@/ports/vault-gateway';

export interface CreateRequest {
  templatePath: string;
  targetPath: string;
  title: string;
  issue: number;
}

export class TemplateNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`Template not found: ${path}`);
    this.name = 'TemplateNotFoundError';
  }
}

const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const KNOWN_TEMPLATE_TOKEN = /\{\{(title|issue|date)\}\}/g;
const FORBIDDEN_FILENAME_CHARACTERS = /[\u0000-\u001F\u007F-\u009F<>:"/\\|?*]+/g;
const FORBIDDEN_PATH_SEGMENT_CHARACTER = /[\u0000-\u001F\u007F-\u009F<>:"|?*]/;
const REPLACEMENT_MARKER = '\u0000';

export const sanitizeTitle = (title: string): string => {
  const sanitized = title
    .replace(FORBIDDEN_FILENAME_CHARACTERS, REPLACEMENT_MARKER)
    .replace(/\u0000(?:\s*\u0000)+/g, REPLACEMENT_MARKER)
    .trim()
    .replace(/^(?:\u0000\s*)+|(?:\s*\u0000)+$/g, '')
    .replace(/[. ]+$/g, '')
    .replaceAll(REPLACEMENT_MARKER, '-');

  if (!WINDOWS_DEVICE_NAME.test(sanitized)) return sanitized;

  const extensionStart = sanitized.indexOf('.');
  return extensionStart === -1
    ? `${sanitized}_`
    : `${sanitized.slice(0, extensionStart)}_${sanitized.slice(extensionStart)}`;
};

export class TemplateCreationService {
  constructor(
    private readonly vault: VaultGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(request: CreateRequest): Promise<string> {
    const templatePath = normalizeVaultPath(request.templatePath);
    const targetPath = normalizeVaultPath(request.targetPath);

    if (!isMarkdownFilePath(targetPath)) {
      throw new Error('Target path must end with .md');
    }
    if (!request.title.trim()) {
      throw new Error('Title must not be empty');
    }
    if (!Number.isSafeInteger(request.issue) || request.issue < 1) {
      throw new Error('Issue must be a positive safe integer');
    }

    const canonicalTemplatePath = resolveMarkdownPath(
      templatePath,
      this.vault.listMarkdownPaths(),
    );
    const existingPaths = [...this.vault.listPaths(), ...this.vault.listFolders()].map((path) =>
      path.replaceAll('\\', '/').toLowerCase(),
    );
    if (this.vault.exists(targetPath) || existingPaths.includes(targetPath.toLowerCase())) {
      throw new Error(`Target already exists: ${targetPath}`);
    }

    const template = await this.vault.read(canonicalTemplatePath);
    const values: Record<'title' | 'issue' | 'date', string> = {
      title: request.title,
      issue: String(request.issue),
      date: formatLocalDate(this.now()),
    };
    const content = template.replace(KNOWN_TEMPLATE_TOKEN, (_token, name: keyof typeof values) => {
      return values[name];
    });

    await this.vault.create(targetPath, content);
    return targetPath;
  }
}

const normalizeVaultPath = (path: string): string => {
  if (!path || path.includes('\u0000') || /^[A-Za-z]:/.test(path)) {
    throw new Error('Path must stay inside the vault');
  }

  const normalized = path.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    normalized.startsWith('/') ||
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        FORBIDDEN_PATH_SEGMENT_CHARACTER.test(segment) ||
        /[. ]$/.test(segment) ||
        WINDOWS_DEVICE_NAME.test(segment),
    )
  ) {
    throw new Error('Path must stay inside the vault');
  }

  return normalized;
};

const resolveMarkdownPath = (requestedPath: string, markdownPaths: string[]): string => {
  const canonicalPaths = markdownPaths.map((path) => path.replaceAll('\\', '/'));
  const exactMatch = canonicalPaths.find((path) => path === requestedPath);
  if (exactMatch !== undefined) return exactMatch;

  const foldedPath = requestedPath.toLowerCase();
  const foldedMatches = canonicalPaths.filter((path) => path.toLowerCase() === foldedPath);
  if (foldedMatches.length > 1) {
    throw new Error(`Template path is ambiguous: ${requestedPath}`);
  }
  const uniqueMatch = foldedMatches[0];
  if (uniqueMatch === undefined) {
    throw new TemplateNotFoundError(requestedPath);
  }
  return uniqueMatch;
};

const isMarkdownFilePath = (path: string): boolean => {
  const filename = path.split('/').at(-1) ?? '';
  return filename.length > '.md'.length && filename.endsWith('.md');
};

const formatLocalDate = (date: Date): string => {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
