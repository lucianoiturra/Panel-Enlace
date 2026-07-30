import { getDb } from "../../../../db";
import { netOrden } from "../../../../db/schema";
import { idsValidos } from "../../../../lib/red/orden";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

export async function PUT(request: Request) {
  try {
    const payload = await readJson<{ ids?: unknown }>(request);
    const ids = idsValidos(payload.ids);
    if (!ids) return noStoreJson({ error: "Lista de elementos inválida." }, { status: 400 });

    const db = await getDb();
    // Se escribe el grupo entero como 0..n-1 y no solo el par que se
    // intercambió: así la operación es idempotente y repara sola cualquier
    // escritura anterior que haya quedado a medias.
    await db.transaction(async (tx) => {
      for (const [indice, id] of ids.entries()) {
        await tx.insert(netOrden).values({ id, orden: indice })
          .onConflictDoUpdate({ target: netOrden.id, set: { orden: indice } });
      }
    });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el orden.");
  }
}

export async function DELETE() {
  try {
    const db = await getDb();
    await db.delete(netOrden);
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible restablecer el orden.");
  }
}
