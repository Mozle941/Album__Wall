export const OUTPUT_FORMATS = ["jpeg", "png", "webp"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
