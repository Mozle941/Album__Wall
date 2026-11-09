export type Platform = "android" | "ios" | "mac" | "windows" | "linux";

export interface Preset {
  id: string;
  platform: Platform;
  label: string;
  width: number;
  height: number;
}

export const PRESETS: readonly Preset[] = [
  { id: "android-fhd", platform: "android", label: "Android FHD+ (1080x2400)", width: 1080, height: 2400 },
  { id: "android-qhd", platform: "android", label: "Android QHD+ (1440x3120)", width: 1440, height: 3120 },
  { id: "ios-iphone-13", platform: "ios", label: "iPhone 12/13/14 (1170x2532)", width: 1170, height: 2532 },
  { id: "ios-iphone-15-pro", platform: "ios", label: "iPhone 14 Pro/15/15 Pro (1179x2556)", width: 1179, height: 2556 },
  { id: "ios-iphone-pro-max", platform: "ios", label: "iPhone Pro Max (1290x2796)", width: 1290, height: 2796 },
  { id: "mac-mbp-14", platform: "mac", label: 'MacBook Pro 14" (3024x1964)', width: 3024, height: 1964 },
  { id: "mac-mbp-16", platform: "mac", label: 'MacBook Pro 16" (3456x2234)', width: 3456, height: 2234 },
  { id: "mac-5k", platform: "mac", label: "iMac 5K / Studio Display (5120x2880)", width: 5120, height: 2880 },
  { id: "windows-fhd", platform: "windows", label: "Windows FHD (1920x1080)", width: 1920, height: 1080 },
  { id: "windows-qhd", platform: "windows", label: "Windows QHD (2560x1440)", width: 2560, height: 1440 },
  { id: "windows-4k", platform: "windows", label: "Windows 4K (3840x2160)", width: 3840, height: 2160 },
  { id: "linux-fhd", platform: "linux", label: "Linux FHD (1920x1080)", width: 1920, height: 1080 },
  { id: "linux-4k", platform: "linux", label: "Linux 4K (3840x2160)", width: 3840, height: 2160 },
];

export function presetsFor(platforms?: Platform[]): Preset[] {
  if (!platforms || platforms.length === 0) return [...PRESETS];
  return PRESETS.filter((p) => platforms.includes(p.platform));
}

export function getPreset(id: string): Preset {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}
