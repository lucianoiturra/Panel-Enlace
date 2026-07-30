import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { appMetadata, checklistItems, checklistResults, cubicles, stationTasks } from "../../../db/schema";
import { decryptPin, encryptPin } from "../../../lib/pin-crypto";
import { loadReferenceStations } from "../../../lib/reference-stations";
import { apiErrorResponse, noStoreJson, readJson } from "../../../lib/api-response";
import {
  ACCESSORY_STATUSES,
  cleanText,
  INTERNET_TYPES,
  isOneOf,
  isValidIpv4,
  isValidMac,
  isValidPin,
  OUTLET_STATUSES,
  PIN_STATUSES,
  ROOM_LIMITS,
  ROOM_STATUSES,
} from "../../../lib/room-validation";

type RoomDb = Awaited<ReturnType<typeof getDb>>;

async function syncReferenceEquipment(db: RoomDb) {
  const reference = await loadReferenceStations();
  if (!reference.stations.length) return;
  await db.transaction(async (tx) => {
    const markerKey = "equipment_reference_version";
    const [marker] = await tx.select().from(appMetadata).where(eq(appMetadata.key, markerKey)).limit(1);
    if (marker?.value === reference.version) return;

    for (const station of reference.stations) {
      const studentPinStatus = station.noComputer ? "not_applicable" : station.studentPin ? "configured" : "no_pin";
      const adminPinStatus = station.noComputer ? "not_applicable" : station.adminPin ? "configured" : "unreviewed";
      await tx.update(cubicles).set({
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

    await tx.insert(appMetadata).values({ key: markerKey, value: reference.version })
      .onConflictDoUpdate({ target: appMetadata.key, set: { value: reference.version } });
  });
}

export async function GET(request: Request) {
  try {
    const db = await getDb();
    await syncReferenceEquipment(db);
    const pinFor = new URL(request.url).searchParams.get("pinFor");
    if (pinFor !== null) {
      const id = Number(pinFor);
      if (!Number.isInteger(id) || id < 1 || id > 40) {
        return noStoreJson({ error: "Cubículo inválido." }, { status: 400 });
      }
      const [station] = await db.select({
        adminPinEncrypted: cubicles.adminPinEncrypted,
        studentPinEncrypted: cubicles.studentPinEncrypted,
      }).from(cubicles).where(eq(cubicles.id, id)).limit(1);
      if (!station) return noStoreJson({ error: "No existe ese cubículo." }, { status: 404 });
      return noStoreJson({
        adminPin: await decryptPin(station.adminPinEncrypted),
        studentPin: await decryptPin(station.studentPinEncrypted),
      });
    }

    // The transaction pooler uses a single connection for this serverless
    // client, so execute reads explicitly in sequence instead of queueing them
    // concurrently during a cold start.
    const storedStations = await db.select().from(cubicles).orderBy(asc(cubicles.id));
    const items = await db.select().from(checklistItems).orderBy(asc(checklistItems.id));
    const results = await db.select().from(checklistResults);
    const tasks = await db.select().from(stationTasks).orderBy(asc(stationTasks.id));
    const stations = storedStations.map((station) => {
      const { adminPinEncrypted, studentPinEncrypted, ...publicStation } = station;
      void adminPinEncrypted;
      void studentPinEncrypted;
      return { ...publicStation, adminPin: "", studentPin: "" };
    });
    return noStoreJson({ stations, items, results, tasks });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible cargar la sala.");
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await readJson<{
      id?: number; updatedAt?: string; brandModel?: string; serialNumber?: string; inventoryCode?: string; adminPinStatus?: string; studentPinStatus?: string; adminPin?: string; studentPin?: string; internetType?: string; outletStatus?: string; keyboard?: string; mouse?: string;
      ip?: string; mac?: string; observations?: string; status?: string; checks?: Record<string, unknown>;
    }>(request);
    if (!Number.isInteger(payload.id) || !payload.id || payload.id < 1 || payload.id > 40) return noStoreJson({ error: "Cubículo inválido." }, { status: 400 });
    if (typeof payload.updatedAt !== "string" || !payload.updatedAt) return noStoreJson({ error: "Falta la versión de la ficha." }, { status: 400 });
    if (!isOneOf(payload.status, ROOM_STATUSES)) return noStoreJson({ error: "Estado del cubículo inválido." }, { status: 400 });
    if (!isOneOf(payload.adminPinStatus, PIN_STATUSES) || !isOneOf(payload.studentPinStatus, PIN_STATUSES)) return noStoreJson({ error: "Estado de PIN inválido." }, { status: 400 });
    if (!isOneOf(payload.internetType, INTERNET_TYPES)) return noStoreJson({ error: "Tipo de conexión inválido." }, { status: 400 });
    if (!isOneOf(payload.outletStatus, OUTLET_STATUSES)) return noStoreJson({ error: "Estado del enchufe inválido." }, { status: 400 });
    if (!isOneOf(payload.keyboard, ACCESSORY_STATUSES) || !isOneOf(payload.mouse, ACCESSORY_STATUSES)) return noStoreJson({ error: "Estado de periférico inválido." }, { status: 400 });
    if (payload.checks !== undefined && (!payload.checks || Array.isArray(payload.checks) || typeof payload.checks !== "object")) return noStoreJson({ error: "Checklist inválido." }, { status: 400 });

    const stationId = payload.id;
    const expectedUpdatedAt = payload.updatedAt;
    const status = payload.status;
    const adminPinStatus = payload.adminPinStatus;
    const studentPinStatus = payload.studentPinStatus;
    const internetType = payload.internetType;
    const outletStatus = payload.outletStatus;
    const keyboard = payload.keyboard;
    const mouse = payload.mouse;
    const db = await getDb();
    const brandModel = cleanText(payload.brandModel, ROOM_LIMITS.brandModel);
    const serialNumber = cleanText(payload.serialNumber, ROOM_LIMITS.serialNumber);
    const inventoryCode = cleanText(payload.inventoryCode, ROOM_LIMITS.inventoryCode);
    const adminPin = cleanText(payload.adminPin, 64);
    const studentPin = cleanText(payload.studentPin, 64);
    const ip = cleanText(payload.ip, 15);
    const mac = cleanText(payload.mac, 20).toUpperCase();
    const observations = cleanText(payload.observations, ROOM_LIMITS.observations);
    if (!isValidIpv4(ip)) return noStoreJson({ error: "La dirección IP no tiene un formato IPv4 válido." }, { status: 400 });
    if (!isValidMac(mac)) return noStoreJson({ error: "La dirección MAC no tiene un formato válido." }, { status: 400 });
    if (adminPinStatus === "configured" && !isValidPin(adminPin)) return noStoreJson({ error: "El PIN de administrador debe contener entre 4 y 64 caracteres, sin espacios." }, { status: 400 });
    if (studentPinStatus === "configured" && !isValidPin(studentPin)) return noStoreJson({ error: "El PIN de estudiante debe contener entre 4 y 64 caracteres, sin espacios." }, { status: 400 });

    const normalizedSerial = serialNumber.toLocaleLowerCase("es-CL");
    const normalizedInventory = inventoryCode.toLocaleLowerCase("es-CL");
    const encryptedAdminPin = adminPinStatus === "configured" ? await encryptPin(adminPin) : "";
    const encryptedStudentPin = studentPinStatus === "configured" ? await encryptPin(studentPin) : "";
    const updatedAt = new Date().toISOString();

    const outcome = await db.transaction(async (tx) => {
      const locks = [
        normalizedSerial && `serial:${normalizedSerial}`,
        normalizedInventory && `inventory:${normalizedInventory}`,
      ].filter((value): value is string => Boolean(value)).sort();
      for (const lock of locks) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lock}))`);

      const existingStations = await tx.select({ id: cubicles.id, serialNumber: cubicles.serialNumber, inventoryCode: cubicles.inventoryCode }).from(cubicles);
      if (normalizedSerial && existingStations.some(station => station.id !== stationId && station.serialNumber.trim().toLocaleLowerCase("es-CL") === normalizedSerial)) {
        return { error: "El número de serie ya está asignado a otro cubículo.", status: 409 } as const;
      }
      if (normalizedInventory && existingStations.some(station => station.id !== stationId && station.inventoryCode.trim().toLocaleLowerCase("es-CL") === normalizedInventory)) {
        return { error: "El código de inventario ya está asignado a otro cubículo.", status: 409 } as const;
      }

      const checkEntries = Object.entries(payload.checks ?? {});
      if (checkEntries.some(([itemId, checked]) => !Number.isInteger(Number(itemId)) || Number(itemId) < 1 || typeof checked !== "boolean")) {
        return { error: "Checklist inválido.", status: 400 } as const;
      }
      if (checkEntries.length) {
        const validItems = new Set((await tx.select({ id: checklistItems.id }).from(checklistItems)).map(item => item.id));
        if (checkEntries.some(([itemId]) => !validItems.has(Number(itemId)))) {
          return { error: "El checklist contiene una verificación inexistente.", status: 400 } as const;
        }
      }

      const [updated] = await tx.update(cubicles).set({
        brandModel,
        serialNumber,
        inventoryCode,
        adminPinStatus,
        studentPinStatus,
        adminPinEncrypted: encryptedAdminPin,
        studentPinEncrypted: encryptedStudentPin,
        internetType,
        outletStatus,
        keyboard,
        mouse,
        ip,
        mac,
        observations,
        status,
        updatedAt,
      }).where(and(eq(cubicles.id, stationId), eq(cubicles.updatedAt, expectedUpdatedAt))).returning({ id: cubicles.id });
      if (!updated) return { error: "La ficha cambió en otra sesión. Recarga antes de volver a guardar.", status: 409 } as const;

      for (const [itemId, checked] of checkEntries) {
        await tx.insert(checklistResults).values({ cubicleId: stationId, itemId: Number(itemId), checked: checked as boolean })
          .onConflictDoUpdate({ target: [checklistResults.cubicleId, checklistResults.itemId], set: { checked: checked as boolean } });
      }
      return { updatedAt } as const;
    });
    if ("error" in outcome) {
      return noStoreJson({ error: outcome.error }, { status: outcome.status });
    }
    return noStoreJson({ ok: true, updatedAt: outcome.updatedAt });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar los cambios.");
  }
}
