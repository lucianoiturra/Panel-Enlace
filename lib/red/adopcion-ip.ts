import type { FilaCubiculo } from "./reconciliacion.ts";

// El cuerpo del request dice QUÉ cubículos adoptar, nunca QUÉ valor: la IP sale
// siempre de la reconciliación que el servidor acaba de calcular. Aceptar la IP
// del cliente convertiría este endpoint en una escritura arbitraria sobre la
// documentación, con la reconciliación de adorno.
export type CambioPedido = { id: number; ipEsperada: string };

export type Adopcion = {
  aplicar: { id: number; ip: string; antes: string }[];
  omitidos: { id: number; motivo: string }[];
};

export function planAdopcion(
  filas: FilaCubiculo[],
  pedidos: CambioPedido[],
  frescos: boolean,
): Adopcion {
  if (!frescos) {
    return {
      aplicar: [],
      omitidos: pedidos.map(pedido => ({ id: pedido.id, motivo: "los datos de red no están frescos" })),
    };
  }

  const porId = new Map(filas.map(fila => [fila.cubiculo.id, fila]));
  const aplicar: Adopcion["aplicar"] = [];
  const omitidos: Adopcion["omitidos"] = [];

  for (const pedido of pedidos) {
    const fila = porId.get(pedido.id);
    if (!fila) { omitidos.push({ id: pedido.id, motivo: "ese cubículo ya no existe" }); continue; }
    if (fila.estado !== "ip-distinta") { omitidos.push({ id: pedido.id, motivo: "ya no está en drift: su IP documentada coincide con la real" }); continue; }
    if (fila.ipDocumentada !== pedido.ipEsperada) { omitidos.push({ id: pedido.id, motivo: "su IP documentada cambió mientras revisabas" }); continue; }
    aplicar.push({ id: pedido.id, ip: fila.ipReal, antes: fila.ipDocumentada });
  }

  return { aplicar, omitidos };
}
