export function bindGuardedAction(
  button: HTMLButtonElement,
  action: () => void | Promise<void>,
): void {
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttr('aria-busy', 'true');
    const settle = (): void => {
      if (!button.isConnected) return;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    };
    let result: void | Promise<void>;
    try {
      result = action();
    } catch {
      settle();
      return;
    }
    void Promise.resolve(result).then(settle, settle);
  });
}
