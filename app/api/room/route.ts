import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { checklistItems, checklistResults, cubicles, stationTasks } from "../../../db/schema";
import { decryptPin, encryptPin } from "../../../lib/pin-crypto";
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

export async function GET(request: Request) {
  try {
    const db = await getDb();
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
      const admin = await decryptPin(station.adminPinEncrypted);
      const estudiante = await decryptPin(station.studentPinEncrypted);
      // Un PIN ilegible no es un error de la petición —el resto de la ficha se
      // carga igual—, pero tampoco es un campo vacío: va nombrado aparte para
      // que el cajón pueda decir qué pasó en vez de mostrar un blanco mudo.
      const ilegibles = [
        ...(admin.ok ? [] : ["admin"]),
        ...(estudiante.ok ? [] : ["estudiante"]),
      ];
      return noStoreJson({
        adminPin: admin.ok ? admin.pin : "",
        studentPin: estudiante.ok ? estudiante.pin : "",
        ilegibles,
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
        return { error: "El número de serie ya está asignado a otro cubículo.", status: 409, code: "duplicate" } as const;
      }
      if (normalizedInventory && existingStations.some(station => station.id !== stationId && station.inventoryCode.trim().toLocaleLowerCase("es-CL") === normalizedInventory)) {
        return { error: "El código de inventario ya está asignado a otro cubículo.", status: 409, code: "duplicate" } as const;
      }

      const checkEntries = Object.entries(payload.checks ?? {});
      // La clave tiene que ser un entero escrito en limpio: `Number` aceptaría
      // " 1", "1.0" o "1e0" como el ítem 1, y el mismo ítem llegaría repetido
      // con valores distintos en una misma petición.
      if (checkEntries.some(([itemId, checked]) => !/^\d+$/.test(itemId) || Number(itemId) < 1 || typeof checked !== "boolean")) {
        return { error: "Checklist inválido.", status: 400, code: "checklist" } as const;
      }
      if (checkEntries.length) {
        const validItems = new Set((await tx.select({ id: checklistItems.id }).from(checklistItems)).map(item => item.id));
        if (checkEntries.some(([itemId]) => !validItems.has(Number(itemId)))) {
          return { error: "El checklist contiene una verificación inexistente.", status: 400, code: "checklist" } as const;
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
      // `version` es el único de estos conflictos que no se resuelve reintentando:
      // el cliente lo distingue por el código para ofrecer la recarga de la ficha.
      if (!updated) return { error: "La ficha cambió en otra sesión. Recárgala para ver lo que quedó guardado.", status: 409, code: "version" } as const;

      for (const [itemId, checked] of checkEntries) {
        await tx.insert(checklistResults).values({ cubicleId: stationId, itemId: Number(itemId), checked: checked as boolean })
          .onConflictDoUpdate({ target: [checklistResults.cubicleId, checklistResults.itemId], set: { checked: checked as boolean } });
      }
      return { updatedAt } as const;
    });
    if ("error" in outcome) {
      return noStoreJson({ error: outcome.error, code: outcome.code }, { status: outcome.status });
    }
    return noStoreJson({ ok: true, updatedAt: outcome.updatedAt });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar los cambios.");
  }
}
