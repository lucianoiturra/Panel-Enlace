export type ReferenceStation = {
  id: number;
  ip: string;
  mac: string;
  studentPin: string;
  adminPin: string;
  noComputer?: boolean;
};

function isReferenceStation(value: unknown): value is ReferenceStation {
  if (!value || typeof value !== "object") return false;
  const station = value as Partial<ReferenceStation>;
  return Number.isInteger(station.id)
    && station.id! >= 1
    && station.id! <= 40
    && typeof station.ip === "string"
    && typeof station.mac === "string"
    && typeof station.studentPin === "string"
    && typeof station.adminPin === "string"
    && (station.noComputer === undefined || typeof station.noComputer === "boolean");
}

export async function loadReferenceStations() {
  const raw = process.env.EQUIPMENT_REFERENCE_JSON?.trim();
  if (!raw) return { stations: [] as ReferenceStation[], version: "" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("EQUIPMENT_REFERENCE_JSON no contiene JSON válido.");
  }

  if (!Array.isArray(parsed) || !parsed.every(isReferenceStation)) {
    throw new Error("EQUIPMENT_REFERENCE_JSON contiene estaciones inválidas.");
  }
  const ids = new Set(parsed.map((station) => station.id));
  if (ids.size !== parsed.length) throw new Error("EQUIPMENT_REFERENCE_JSON contiene IDs duplicados.");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const version = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { stations: parsed, version };
}
