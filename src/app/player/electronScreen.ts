/** The slice of Electron this file reads. The package is not a dependency; Obsidian provides it. */
declare module 'electron' {
  export const screen: {
    getDisplayMatching(rect: { x: number; y: number; width: number; height: number }): {
      id: number;
      label: string;
      size: { width: number; height: number };
      scaleFactor: number;
      workArea: { x: number; y: number; width: number; height: number };
    };
    on(event: 'display-metrics-changed', listener: () => void): void;
    removeListener(event: 'display-metrics-changed', listener: () => void): void;
  };
}
