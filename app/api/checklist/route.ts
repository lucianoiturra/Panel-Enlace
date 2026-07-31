import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { checklistItems, checklistResults } from "../../../db/schema";
import { apiErrorResponse, noStoreJson, readJson } from "../../../lib/api-response";

export async function POST(request: Request) {
  try {
    const { label } = await readJson<{ label?: string }>(request);
    const clean = label?.trim();
    if (!clean) return noStoreJson({ error: "Escribe una verificación." }, { status: 400 });
    if (clean.length > 120) return noStoreJson({ error: "La verificación no puede superar 120 caracteres." }, { status: 400 });
    const db = await getDb();
    // Una verificación repetida no rompe nada, pero infla el denominador de las
    // revisiones pendientes y obliga a marcar dos veces lo mismo en los 40
    // cubículos. Es una comprobación previa: con un solo operador basta.
    const [duplicate] = await db.select({ id: checklistItems.id }).from(checklistItems)
      .where(sql`lower(${checklistItems.label}) = lower(${clean})`).limit(1);
    if (duplicate) return noStoreJson({ error: "Ya existe una verificación con ese nombre." }, { status: 409 });
    const [item] = await db.insert(checklistItems).values({ label: clean, createdAt: new Date().toISOString() }).returning();
    return noStoreJson({ item }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible agregar la verificación.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return noStoreJson({ error: "Verificación inválida." }, { status: 400 });
    const db = await getDb();
    const removed = await db.transaction(async (tx) => {
      const [item] = await tx.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.id, id)).limit(1);
      if (!item) return false;
      await tx.delete(checklistResults).where(eq(checklistResults.itemId, id));
      await tx.delete(checklistItems).where(eq(checklistItems.id, id));
      return true;
    });
    if (!removed) return noStoreJson({ error: "Esa verificación ya no existe." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar la verificación.");
  }
}
