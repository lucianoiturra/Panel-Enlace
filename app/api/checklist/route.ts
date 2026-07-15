import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { checklistItems, checklistResults } from "../../../db/schema";

export async function POST(request: Request) {
  try {
    const { label } = await request.json() as { label?: string };
    const clean = label?.trim();
    if (!clean) return Response.json({ error: "Escribe una verificación" }, { status: 400 });
    const db = await getDb();
    const [item] = await db.insert(checklistItems).values({ label: clean, createdAt: new Date().toISOString() }).returning();
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible agregar" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Verificación inválida" }, { status: 400 });
    const db = await getDb();
    await db.delete(checklistResults).where(eq(checklistResults.itemId, id));
    await db.delete(checklistItems).where(eq(checklistItems.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible eliminar" }, { status: 500 });
  }
}
