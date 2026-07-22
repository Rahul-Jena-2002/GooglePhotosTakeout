import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ExifEngine = 'piexifjs' | 'wasm';

interface SettingsState {
  exifEngine: ExifEngine;
  setExifEngine: (engine: ExifEngine) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      exifEngine: 'piexifjs',
      setExifEngine: (engine) => set({ exifEngine: engine }),
    }),
    {
      name: 'gtakeout-settings',
    }
  )
);
