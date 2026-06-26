type FakeListener = (event: FakeEvent) => void;

export class FakeStyle {
  readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.properties.get(name) ?? '';
  }
}

export class FakeEvent {
  defaultPrevented = false;

  constructor(readonly key = '') {}

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

export class FakeElement {
  readonly children: FakeElement[] = [];
  readonly classList = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, FakeListener[]>();
  readonly style = new FakeStyle();
  checked = false;
  disabled = false;
  hidden = false;
  isConnected = true;
  parent: FakeElement | null = null;
  text = '';
  tag = 'div';
  type = '';

  /** 聚合自身与后代文本，对齐真实 DOM Element.textContent 语义（拆字渲染后仍可整体匹配）。 */
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('');
  }

  set innerHTML(_value: string) {
    throw new Error('Unsafe innerHTML was used');
  }

  empty(): void {
    for (const child of this.children) child.disconnect();
    this.children.length = 0;
  }

  addClass(...classes: string[]): void {
    for (const item of classes) this.classList.add(item);
  }

  removeClass(...classes: string[]): void {
    for (const item of classes) this.classList.delete(item);
  }

  createDiv(options: FakeElementOptions = {}): FakeElement {
    return this.createEl('div', options);
  }

  createSpan(options: FakeElementOptions = {}): FakeElement {
    return this.createEl('span', options);
  }

  createEl(tag: string, options: FakeElementOptions = {}): FakeElement {
    const child = new FakeElement();
    child.tag = tag;
    child.text = options.text ?? '';
    child.type = options.type ?? '';
    child.parent = this;
    child.isConnected = this.isConnected;
    if (options.cls !== undefined) child.addClass(...options.cls.split(/\s+/).filter(Boolean));
    for (const [name, value] of Object.entries(options.attr ?? {})) child.setAttr(name, value);
    this.children.push(child);
    return child;
  }

  setAttr(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttr(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(name: string, listener: FakeListener): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  click(): void {
    if (!this.disabled) {
      this.focus();
      this.dispatch('click');
    }
  }

  keydown(key: string): FakeEvent {
    return this.dispatch('keydown', key);
  }

  focus(): void {
    if (this.isConnected) fakeDocument.activeElement = this;
  }

  private disconnect(): void {
    this.isConnected = false;
    for (const child of this.children) child.disconnect();
  }

  private dispatch(name: string, key = ''): FakeEvent {
    const event = new FakeEvent(key);
    for (const listener of this.listeners.get(name) ?? []) listener(event);
    return event;
  }
}

export const fakeDocument: { activeElement: FakeElement | null } = { activeElement: null };

interface FakeElementOptions {
  attr?: Record<string, string>;
  cls?: string;
  text?: string;
  type?: string;
}

export function findByText(root: FakeElement, text: string): FakeElement | undefined {
  // 后序：优先命中叶子（自身文本元素），聚合容器仅作兜底，
  // 这样拆字渲染的标题（自身无 text、靠子 span 聚合）仍可匹配，
  // 同时 click/disabled 断言继续拿到可交互叶子而非祖先容器。
  for (const child of root.children) {
    const match = findByText(child, text);
    if (match !== undefined) return match;
  }
  return root.textContent === text ? root : undefined;
}

export function findAll(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement[] {
  const matches = predicate(root) ? [root] : [];
  for (const child of root.children) matches.push(...findAll(child, predicate));
  return matches;
}
