import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { checklistItems, checklistResults, cubicles } from "../../../db/schema";

export async function GET() {
  try {
    const db = await getDb();
    const [stations, items, results] = await Promise.all([
      db.select().from(cubicles).orderBy(asc(cubicles.id)),
      db.select().from(checklistItems).orderBy(asc(checklistItems.id)),
      db.select().from(checklistResults),
    ]);
    return Response.json({ stations, items, results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar la sala" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as {
      id?: number; brandModel?: string; serialNumber?: string; inventoryCode?: string; keyboard?: string; mouse?: string;
      ip?: string; observations?: string; status?: string; checks?: Record<string, boolean>;
    };
    if (!payload.id || payload.id < 1 || payload.id > 40) return Response.json({ error: "Cubículo inválido" }, { status: 400 });
    const db = await getDb();
    const status = ["operational", "attention", "offline", "pending"].includes(payload.status ?? "") ? payload.status! : "pending";
    await db.update(cubicles).set({
      brandModel: payload.brandModel?.trim() ?? "",
      serialNumber: payload.serialNumber?.trim() ?? "",
      inventoryCode: payload.inventoryCode?.trim() ?? "",
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
