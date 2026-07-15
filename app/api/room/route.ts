import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { appMetadata, checklistItems, checklistResults, cubicles, stationTasks } from "../../../db/schema";
import { decryptPin, encryptPin } from "../../../lib/pin-crypto";
import { loadReferenceStations } from "../../../lib/reference-stations";

const limits = { brandModel: 160, serialNumber: 100, inventoryCode: 100, observations: 2000 } as const;
const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isValidIpv4 = (value: string) => {
  if (!value) return true;
  const parts = value.split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};
const isValidMac = (value: string) => !value || /^(?:[0-9A-F]{2}-){5,6}[0-9A-F]{2}$/i.test(value);
const isValidPin = (value: string) => /^[^\s]{4,64}$/.test(value);

type RoomDb = Awaited<ReturnType<typeof getDb>>;

async function syncReferenceEquipment(db: RoomDb) {
  const { stations: referenceStations, version } = await loadReferenceStations();
  if (!referenceStations.length) return;
  const markerKey = "equipment_reference_version";
  const [marker] = await db.select().from(appMetadata).where(eq(appMetadata.key, markerKey)).limit(1);
  if (marker?.value === version) return;

  for (const station of referenceStations) {
    const studentPinStatus = station.noComputer ? "not_applicable" : station.studentPin ? "configured" : "no_pin";
    const adminPinStatus = station.noComputer ? "not_applicable" : station.adminPin ? "configured" : "unreviewed";
    await db.update(cubicles).set({
      ip: station.ip,
      mac: station.mac,
      studentPinStatus,
      adminPinStatus,
      studentPinEncrypted: station.studentPin ? await encryptPin(station.studentPin) : "",
      adminPinEncrypted: station.adminPin ? await encryptPin(station.adminPin) : "",
      ...(station.noComputer ? { status: "no_computer" } : {}),
      updatedAt: new Date().toISOString(),
    }).where(eq(cubicles.id, station.id));
  }

  await db.insert(appMetadata).values({ key: markerKey, value: version })
    .onConflictDoUpdate({ target: appMetadata.key, set: { value: version } });
}

export async function GET() {
  try {
    const db = await getDb();
    await syncReferenceEquipment(db);
    const [storedStations, items, results, tasks] = await Promise.all([
      db.select().from(cubicles).orderBy(asc(cubicles.id)),
      db.select().from(checklistItems).orderBy(asc(checklistItems.id)),
      db.select().from(checklistResults),
      db.select().from(stationTasks).orderBy(asc(stationTasks.id)),
    ]);
    const stations = await Promise.all(storedStations.map(async (station) => {
      const { adminPinEncrypted, studentPinEncrypted, ...publicStation } = station;
      return { ...publicStation, adminPin: await decryptPin(adminPinEncrypted), studentPin: await decryptPin(studentPinEncrypted) };
    }));
    return Response.json({ stations, items, results, tasks });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar la sala" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as {
      id?: number; brandModel?: string; serialNumber?: string; inventoryCode?: string; adminPinStatus?: string; studentPinStatus?: string; adminPin?: string; studentPin?: string; internetType?: string; outletStatus?: string; keyboard?: string; mouse?: string;
      ip?: string; mac?: string; observations?: string; status?: string; checks?: Record<string, boolean>;
    };
    if (!Number.isInteger(payload.id) || !payload.id || payload.id < 1 || payload.id > 40) return Response.json({ error: "Cubículo inválido" }, { status: 400 });
    const db = await getDb();
    const status = ["operational", "attention", "offline", "pending", "no_computer"].includes(payload.status ?? "") ? payload.status! : "pending";
    const pinStates = ["unreviewed", "configured", "no_pin", "not_applicable"];
    const internetStates = ["unreviewed", "ethernet", "wifi", "none"];
    const outletStates = ["unreviewed", "operational", "repair"];
    const adminPinStatus = pinStates.includes(payload.adminPinStatus ?? "") ? payload.adminPinStatus! : "unreviewed";
    const studentPinStatus = pinStates.includes(payload.studentPinStatus ?? "") ? payload.studentPinStatus! : "unreviewed";
    const brandModel = cleanText(payload.brandModel, limits.brandModel);
    const serialNumber = cleanText(payload.serialNumber, limits.serialNumber);
    const inventoryCode = cleanText(payload.inventoryCode, limits.inventoryCode);
    const adminPin = cleanText(payload.adminPin, 64);
    const studentPin = cleanText(payload.studentPin, 64);
    const ip = cleanText(payload.ip, 15);
    const mac = cleanText(payload.mac, 20).toUpperCase();
    const observations = cleanText(payload.observations, limits.observations);
    if (!isValidIpv4(ip)) return Response.json({ error: "La dirección IP no tiene un formato IPv4 válido." }, { status: 400 });
    if (!isValidMac(mac)) return Response.json({ error: "La dirección MAC no tiene un formato válido." }, { status: 400 });
    if (adminPinStatus === "configured" && !isValidPin(adminPin)) return Response.json({ error: "El PIN de administrador debe contener entre 4 y 64 caracteres, sin espacios." }, { status: 400 });
    if (studentPinStatus === "configured" && !isValidPin(studentPin)) return Response.json({ error: "El PIN de estudiante debe contener entre 4 y 64 caracteres, sin espacios." }, { status: 400 });
    const existingStations = await db.select({ id: cubicles.id, serialNumber: cubicles.serialNumber, inventoryCode: cubicles.inventoryCode }).from(cubicles);
    const normalizedSerial = serialNumber.toLocaleLowerCase("es-CL");
    const normalizedInventory = inventoryCode.toLocaleLowerCase("es-CL");
    if (normalizedSerial && existingStations.some(station => station.id !== payload.id && station.serialNumber.trim().toLocaleLowerCase("es-CL") === normalizedSerial)) return Response.json({ error: "El número de serie ya está asignado a otro cubículo." }, { status: 409 });
    if (normalizedInventory && existingStations.some(station => station.id !== payload.id && station.inventoryCode.trim().toLocaleLowerCase("es-CL") === normalizedInventory)) return Response.json({ error: "El código de inventario ya está asignado a otro cubículo." }, { status: 409 });
    await db.update(cubicles).set({
      brandModel,
      serialNumber,
      inventoryCode,
      adminPinStatus,
      studentPinStatus,
      adminPinEncrypted: adminPinStatus === "configured" ? await encryptPin(adminPin) : "",
      studentPinEncrypted: studentPinStatus === "configured" ? await encryptPin(studentPin) : "",
      internetType: internetStates.includes(payload.internetType ?? "") ? payload.internetType! : "unreviewed",
      outletStatus: outletStates.includes(payload.outletStatus ?? "") ? payload.outletStatus! : "unreviewed",
      keyboard: payload.keyboard?.trim() || "Sin registrar",
      mouse: payload.mouse?.trim() || "Sin registrar",
      ip,
      mac,
      observations,
      status,
      updatedAt: new Date().toISOString(),
    }).where(eq(cubicles.id, payload.id));

    if (payload.checks) {
      const statements = Object.entries(payload.checks).map(([itemId, checked]) =>
        db.insert(checklistResults).values({ cubicleId: payload.id!, itemId: Number(itemId), checked })
          .onConflictDoUpdate({ target: [checklistResults.cubicleId, checklistResults.itemId], set: { checked } }),
      );
      for (const statement of statements) await statement;
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible guardar" }, { status: 500 });
  }
}
