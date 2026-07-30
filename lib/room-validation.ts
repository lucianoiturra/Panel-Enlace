export const ROOM_LIMITS = {
  brandModel: 160,
  serialNumber: 100,
  inventoryCode: 100,
  observations: 2000,
  accessory: 40,
} as const;

export const ROOM_STATUSES = ["operational", "attention", "offline", "pending", "no_computer"] as const;
export const PIN_STATUSES = ["unreviewed", "configured", "no_pin", "not_applicable"] as const;
export const INTERNET_TYPES = ["unreviewed", "ethernet", "wifi", "none"] as const;
export const OUTLET_STATUSES = ["unreviewed", "operational", "repair"] as const;
export const ACCESSORY_STATUSES = ["Sin registrar", "Operativo", "Con fallas", "No disponible"] as const;

export const cleanText = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export const isValidIpv4 = (value: string) => {
  const cleaned = value.trim();
  if (!cleaned) return true;
  const parts = cleaned.split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};

export const isValidMac = (value: string) =>
  !value.trim() || /^(?:[0-9A-F]{2}-){5}[0-9A-F]{2}$/i.test(value.trim());

export const isValidPin = (value: string) => /^[^\s]{4,64}$/.test(value.trim());

export const isOneOf = <T extends readonly string[]>(value: unknown, allowed: T): value is T[number] =>
  typeof value === "string" && allowed.includes(value as T[number]);
