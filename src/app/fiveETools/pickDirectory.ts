/** Whether this window can open a native folder picker. */
export function directoryPickerAvailable(): boolean {
  return directoryDialog() !== null;
}

/**
 * Opens the desktop folder picker. Null when the user cancels or no dialog
 * is available (e.g. outside Electron).
 */
export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  const dialog = directoryDialog();
  if (!dialog) return null;
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      ...(defaultPath?.trim() ? { defaultPath: defaultPath.trim() } : {}),
    });
    if (result.canceled) return null;
    const chosen = result.filePaths[0];
    return typeof chosen === 'string' && chosen.trim() ? chosen.trim() : null;
  } catch (error) {
    console.debug('[Atlas] Folder picker failed', error);
    return null;
  }
}

interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface DirectoryDialog {
  showOpenDialog(options: {
    properties: string[];
    defaultPath?: string;
  }): Promise<OpenDialogResult>;
}

function directoryDialog(): DirectoryDialog | null {
  const requireFn = (window as Window & { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') return null;
  try {
    const electron = requireFn('electron') as { remote?: { dialog?: DirectoryDialog }; dialog?: DirectoryDialog };
    if (isDialog(electron.remote?.dialog)) return electron.remote.dialog;
    if (isDialog(electron.dialog)) return electron.dialog;
    const remote = requireFn('@electron/remote') as { dialog?: DirectoryDialog };
    if (isDialog(remote.dialog)) return remote.dialog;
  } catch {
    return null;
  }
  return null;
}

function isDialog(value: DirectoryDialog | undefined): value is DirectoryDialog {
  return typeof value?.showOpenDialog === 'function';
}
