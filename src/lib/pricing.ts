export const PANEL_PRICES_JPY = {
  A4: 22000,
  A3: 33000,
  A2: 55000,
} as const;

export type PanelSize = keyof typeof PANEL_PRICES_JPY;

export const PANEL_SIZES: PanelSize[] = ["A4", "A3", "A2"];
