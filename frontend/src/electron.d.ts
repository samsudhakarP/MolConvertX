export {};

declare global {
  interface Window {
    molconvertx?: {
      selectFolder: () => Promise<string | null>;
      selectSaveFile: (suggestedName?: string) => Promise<string | null>;
    };
  }
}
