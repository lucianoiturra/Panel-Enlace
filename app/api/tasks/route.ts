import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { stationTasks } from "../../../db/schema";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { cubicleId?: number; description?: string };
    const description = payload.description?.trim() ?? "";
    if (!Number.isInteger(payload.cubicleId) || !payload.cubicleId || payload.cubicleId < 1 || payload.cubicleId > 40 || !description) {
      return Response.json({ error: "Escribe una tarea y selecciona un cubículo válido." }, { status: 400 });
    }
    if (description.length > 160) return Response.json({ error: "La tarea no puede superar 160 caracteres." }, { status: 400 });
    const db = await getDb();
    const [task] = await db.insert(stationTasks).values({ cubicleId: payload.cubicleId, description, createdAt: new Date().toISOString() }).returning();
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible agregar la tarea" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { id?: number; completed?: boolean };
    if (!Number.isInteger(payload.id) || !payload.id || typeof payload.completed !== "boolean") return Response.json({ error: "Tarea inválida" }, { status: 400 });
    const db = await getDb();
    await db.update(stationTasks).set({ completed: payload.completed }).where(eq(stationTasks.id, payload.id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible actualizar la tarea" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Tarea inválida" }, { status: 400 });
    const db = await getDb();
    await db.delete(stationTasks).where(eq(stationTasks.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible eliminar la tarea" }, { status: 500 });
  }
}
