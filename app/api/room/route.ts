import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { checklistItems, checklistResults, cubicles, stationTasks } from "../../../db/schema";
import { decryptPin, encryptPin } from "../../../lib/pin-crypto";

export async function GET() {
  try {
    const db = await getDb();
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
      ip?: string; observations?: string; status?: string; checks?: Record<string, boolean>;
    };
    if (!payload.id || payload.id < 1 || payload.id > 40) return Response.json({ error: "Cubículo inválido" }, { status: 400 });
    const db = await getDb();
    const status = ["operational", "attention", "offline", "pending", "no_computer"].includes(payload.status ?? "") ? payload.status! : "pending";
    const pinStates = ["unreviewed", "configured", "no_pin", "not_applicable"];
    const internetStates = ["unreviewed", "ethernet", "wifi", "none"];
    const outletStates = ["unreviewed", "operational", "repair"];
    const adminPinStatus = pinStates.includes(payload.adminPinStatus ?? "") ? payload.adminPinStatus! : "unreviewed";
    const studentPinStatus = pinStates.includes(payload.studentPinStatus ?? "") ? payload.studentPinStatus! : "unreviewed";
    await db.update(cubicles).set({
      brandModel: payload.brandModel?.trim() ?? "",
      serialNumber: payload.serialNumber?.trim() ?? "",
      inventoryCode: payload.inventoryCode?.trim() ?? "",
      adminPinStatus,
      studentPinStatus,
      adminPinEncrypted: adminPinStatus === "configured" ? await encryptPin(payload.adminPin?.trim() ?? "") : "",
      studentPinEncrypted: studentPinStatus === "configured" ? await encryptPin(payload.studentPin?.trim() ?? "") : "",
      internetType: internetStates.includes(payload.internetType ?? "") ? payload.internetType! : "unreviewed",
      outletStatus: outletStates.includes(payload.outletStatus ?? "") ? payload.outletStatus! : "unreviewed",
      keyboard: payload.keyboard?.trim() || "Sin registrar",
      mouse: payload.mouse?.trim() || "Sin registrar",
      ip: payload.ip?.trim() ?? "",
      observations: payload.observations?.trim() ?? "",
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
