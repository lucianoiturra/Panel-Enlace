import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { cubicles, stationTasks } from "../../../db/schema";
import { apiErrorResponse, noStoreJson, readJson } from "../../../lib/api-response";

export async function POST(request: Request) {
  try {
    const payload = await readJson<{ cubicleId?: number; description?: string }>(request);
    const description = payload.description?.trim() ?? "";
    if (!Number.isInteger(payload.cubicleId) || !payload.cubicleId || payload.cubicleId < 1 || payload.cubicleId > 40 || !description) {
      return noStoreJson({ error: "Escribe una tarea y selecciona un cubículo válido." }, { status: 400 });
    }
    if (description.length > 160) return noStoreJson({ error: "La tarea no puede superar 160 caracteres." }, { status: 400 });
    const db = await getDb();
    const [station] = await db.select({ id: cubicles.id }).from(cubicles).where(eq(cubicles.id, payload.cubicleId)).limit(1);
    if (!station) return noStoreJson({ error: "No existe ese cubículo." }, { status: 404 });
    const [task] = await db.insert(stationTasks).values({ cubicleId: payload.cubicleId, description, createdAt: new Date().toISOString() }).returning();
    return noStoreJson({ task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible agregar la tarea.");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<{ id?: number; completed?: boolean }>(request);
    if (!Number.isInteger(payload.id) || !payload.id || typeof payload.completed !== "boolean") return noStoreJson({ error: "Tarea inválida." }, { status: 400 });
    const db = await getDb();
    const [updated] = await db.update(stationTasks).set({ completed: payload.completed }).where(eq(stationTasks.id, payload.id)).returning({ id: stationTasks.id });
    if (!updated) return noStoreJson({ error: "Esa tarea ya no existe." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible actualizar la tarea.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return noStoreJson({ error: "Tarea inválida." }, { status: 400 });
    const db = await getDb();
    const [removed] = await db.delete(stationTasks).where(eq(stationTasks.id, id)).returning({ id: stationTasks.id });
    if (!removed) return noStoreJson({ error: "Esa tarea ya no existe." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar la tarea.");
  }
}
