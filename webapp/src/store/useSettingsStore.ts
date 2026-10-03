import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ExifEngine = 'wasm';
export type DriveProfile = 'auto' | 'ssd' | 'hdd';

interface SettingsState {
  exifEngine: ExifEngine;
  setExifEngine: (engine: ExifEngine) => void;
  driveProfile: DriveProfile;
  setDriveProfile: (profile: DriveProfile) => void;
  organizeYearMonth: boolean;
  setOrganizeYearMonth: (val: boolean) => void;
  generateSyncScript: boolean;
  setGenerateSyncScript: (val: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      exifEngine: 'wasm',
      setExifEngine: () => set({ exifEngine: 'wasm' }),
      driveProfile: 'auto',
      setDriveProfile: (profile) => set({ driveProfile: profile }),
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
