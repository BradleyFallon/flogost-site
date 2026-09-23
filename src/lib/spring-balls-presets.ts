export const SPRING_BALLS_PRESET_VERSION = 1 as const;

export type Direction = 1 | -1;

export interface SpringBallsSettings {
  bpm: number;
  rotationDegrees: number;
  rotationVariance: number;
  direction: Direction;
  autoBeat: boolean;
  scrambleEnabled: boolean;
  scramblePattern: number[];
  kickEnabled: boolean;
  kickPattern: number[];
  kickStrength: number;
  breatheEnabled: boolean;
  breathePattern: number[];
  breatheAmount: number;
  inversionEnabled: boolean;
  inversionPattern: number[];
  trailFade: number;
  triangleStiffness: number;
  triangleDamping: number;
  triangleInertia: number;
  ballStiffness: number;
  ballDamping: number;
  ballMass: number;
  repulsion: number;
}

export interface SpringBallsPreset {
  version: typeof SPRING_BALLS_PRESET_VERSION;
  name: string;
  settings: SpringBallsSettings;
}

export interface StoredPreset {
  id: string;
  createdAt: string;
  preset: SpringBallsPreset;
}

const numericRanges: Record<keyof Pick<SpringBallsSettings,
  | "bpm"
  | "rotationDegrees"
  | "rotationVariance"
  | "kickStrength"
  | "breatheAmount"
  | "trailFade"
  | "triangleStiffness"
  | "triangleDamping"
  | "triangleInertia"
  | "ballStiffness"
  | "ballDamping"
  | "ballMass"
  | "repulsion"
>, readonly [number, number]> = {
  bpm: [20, 300],
  rotationDegrees: [0, 360],
  rotationVariance: [0, 180],
  kickStrength: [0, 500],
  breatheAmount: [-200, 200],
  trailFade: [2, 100],
  triangleStiffness: [5, 400],
  triangleDamping: [0, 40],
  triangleInertia: [0.1, 10],
  ballStiffness: [5, 400],
  ballDamping: [0, 40],
  ballMass: [0.1, 10],
  repulsion: [0, 800],
};

export const defaultSettings: SpringBallsSettings = {
  bpm: 60,
  rotationDegrees: 120,
  rotationVariance: 0,
  direction: 1,
  autoBeat: true,
  scrambleEnabled: false,
  scramblePattern: [4],
  kickEnabled: false,
  kickPattern: [8],
  kickStrength: 150,
  breatheEnabled: false,
  breathePattern: [8],
  breatheAmount: 60,
  inversionEnabled: false,
  inversionPattern: [16],
  trailFade: 15,
  triangleStiffness: 90,
  triangleDamping: 8,
  triangleInertia: 1,
  ballStiffness: 120,
  ballDamping: 10,
  ballMass: 1,
  repulsion: 150,
};

const settings = (overrides: Partial<SpringBallsSettings>): SpringBallsSettings => ({
  ...defaultSettings,
  ...overrides,
});

export const builtInPresets: Array<{ id: string; preset: SpringBallsPreset }> = [
  {
    id: "orbit",
    preset: { version: 1, name: "Orbit", settings: settings({}) },
  },
  {
    id: "soft-drift",
    preset: {
      version: 1,
      name: "Soft Drift",
      settings: settings({
        bpm: 42,
        rotationDegrees: 60,
        rotationVariance: 18,
        trailFade: 7,
        triangleStiffness: 48,
        triangleDamping: 11,
        ballStiffness: 62,
        ballDamping: 13,
        repulsion: 75,
        breatheEnabled: true,
        breathePattern: [4, 8],
        breatheAmount: 30,
      }),
    },
  },
  {
    id: "cross-current",
    preset: {
      version: 1,
      name: "Cross Current",
      settings: settings({
        bpm: 78,
        rotationDegrees: 120,
        rotationVariance: 24,
        scrambleEnabled: true,
        scramblePattern: [4, 2, 4, 8],
        kickEnabled: true,
        kickPattern: [8],
        kickStrength: 95,
        trailFade: 11,
        repulsion: 230,
      }),
    },
  },
  {
    id: "undertow",
    preset: {
      version: 1,
      name: "Undertow",
      settings: settings({
        bpm: 96,
        rotationDegrees: 180,
        rotationVariance: 12,
        direction: -1,
        scrambleEnabled: true,
        scramblePattern: [2, 4],
        kickEnabled: true,
        kickPattern: [4, 8],
        kickStrength: 220,
        inversionEnabled: true,
        inversionPattern: [8, 16],
        trailFade: 5,
        triangleStiffness: 140,
        triangleDamping: 7,
        ballStiffness: 175,
        ballDamping: 7,
        repulsion: 360,
      }),
    },
  },
];

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function sanitizePattern(value: unknown, fallback: number[]): number[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const result = source
    .map((item) => Math.round(Number(item)))
    .filter((item) => Number.isFinite(item) && item > 0 && item <= 128)
    .slice(0, 16);
  return result.length ? result : [...fallback];
}

export function sanitizeSettings(value: unknown): SpringBallsSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const output = { ...defaultSettings };

  for (const [key, range] of Object.entries(numericRanges) as Array<
    [keyof typeof numericRanges, readonly [number, number]]
  >) {
    output[key] = clamp(input[key], defaultSettings[key], range[0], range[1]);
  }

  output.direction = input.direction === -1 ? -1 : 1;
  output.autoBeat = typeof input.autoBeat === "boolean" ? input.autoBeat : defaultSettings.autoBeat;
  output.scrambleEnabled = input.scrambleEnabled === true;
  output.kickEnabled = input.kickEnabled === true;
  output.breatheEnabled = input.breatheEnabled === true;
  output.inversionEnabled = input.inversionEnabled === true;
  output.scramblePattern = sanitizePattern(input.scramblePattern, defaultSettings.scramblePattern);
  output.kickPattern = sanitizePattern(input.kickPattern, defaultSettings.kickPattern);
  output.breathePattern = sanitizePattern(input.breathePattern, defaultSettings.breathePattern);
  output.inversionPattern = sanitizePattern(input.inversionPattern, defaultSettings.inversionPattern);

  return output;
}

export function sanitizePreset(value: unknown): SpringBallsPreset | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (Number(input.version) !== SPRING_BALLS_PRESET_VERSION) return null;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 48) : "";
  if (!name) return null;
  return {
    version: SPRING_BALLS_PRESET_VERSION,
    name,
    settings: sanitizeSettings(input.settings),
  };
}

export const patternToString = (pattern: number[]) => pattern.join(", ");

export function encodePreset(preset: SpringBallsPreset): string {
  const bytes = new TextEncoder().encode(JSON.stringify(preset));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePreset(encoded: string): SpringBallsPreset | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return sanitizePreset(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
