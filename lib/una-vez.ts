/**
 * Comparte un trabajo asíncrono entre todas las llamadas que usen la misma
 * clave, pero sin memorizar los fallos: una promesa rechazada se descarta para
 * que el siguiente intento vuelva a ejecutarse. Memorizar el rechazo dejaría al
 * proceso repitiendo un error ya corregido hasta reiniciarlo.
 */
export function unaVezPorClave<T>(crear: (clave: string) => Promise<T>) {
  let memorizada: { clave: string; trabajo: Promise<T> } | null = null;

  return (clave: string) => {
    if (memorizada?.clave === clave) return memorizada.trabajo;

    const trabajo = crear(clave).catch((error: unknown) => {
      if (memorizada?.trabajo === trabajo) memorizada = null;
      throw error;
    });
    memorizada = { clave, trabajo };
    return trabajo;
  };
}
