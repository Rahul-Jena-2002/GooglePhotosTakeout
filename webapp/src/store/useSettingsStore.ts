import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ExifEngine = 'piexifjs' | 'wasm';

interface SettingsState {
  exifEngine: ExifEngine;
  setExifEngine: (engine: ExifEngine) => void;
  organizeYearMonth: boolean;
  setOrganizeYearMonth: (val: boolean) => void;
  generateSyncScript: boolean;
  setGenerateSyncScript: (val: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      exifEngine: 'piexifjs',
      setExifEngine: (engine) => set({ exifEngine: engine }),
      organizeYearMonth: true,
      setOrganizeYearMonth: (val) => set({ organizeYearMonth: val }),
      generateSyncScript: true,
      setGenerateSyncScript: (val) => set({ generateSyncScript: val }),
    }),
    {
      name: 'takeoutfix-settings',
    }
  )
);
