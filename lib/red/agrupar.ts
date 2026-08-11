import { estadosEspacio, ordenarCategorias, type Categoria, type Espacio } from "./modelo.ts";

export type CriterioOrden = "nombre" | "tipo" | "estado";

export const criteriosOrden: CriterioOrden[] = ["nombre", "tipo", "estado"];

export const etiquetasCriterioOrden: Record<CriterioOrden, string> = {
  nombre: "Nombre",
  tipo: "Tipo",
  estado: "Estado",
};

// Genérico en el tipo de espacio para no borrar los campos que la vista agrega
// encima de Espacio (el origen del estado, por ejemplo) al ordenar o agrupar.
export type GrupoEspacios<T extends Espacio = Espacio> = { id: string; nombre: string; espacios: T[] };

const porNombre = (una: Espacio, otra: Espacio) => una.nombre.localeCompare(otra.nombre, "es", { numeric: true });

// Un tipo que ya no está en la lista (recién borrado, o un dato viejo) se manda
// al final en vez de romper la comparación con un índice -1 que lo pondría antes
// que todo lo demás.
const posicionEn = (ids: string[], valor: string) => {
  const indice = ids.indexOf(valor);
  return indice === -1 ? ids.length : indice;
};

export const ordenarEspacios = <T extends Espacio>(espacios: T[], criterio: CriterioOrden, categorias: Categoria[]): T[] => {
  const tipos = ordenarCategorias(categorias).map(categoria => categoria.id);
  const estados: string[] = estadosEspacio;
  return [...espacios].sort((una, otra) => {
    if (criterio === "tipo") {
      const diferencia = posicionEn(tipos, una.categoria) - posicionEn(tipos, otra.categoria);
      if (diferencia) return diferencia;
    }
    if (criterio === "estado") {
      const diferencia = posicionEn(estados, una.estado) - posicionEn(estados, otra.estado);
      if (diferencia) return diferencia;
    }
    return porNombre(una, otra);
  });
};

// Devuelve los grupos en el orden de las categorías, omitiendo las vacías, y
// agrega al final un grupo de rescate para los espacios cuyo tipo ya no existe:
// sin él desaparecerían de la vista al borrar un tipo.
export const agruparPorTipo = <T extends Espacio>(espacios: T[], categorias: Categoria[]): GrupoEspacios<T>[] => {
  const grupos = ordenarCategorias(categorias)
    .map(categoria => ({
      id: categoria.id,
      nombre: categoria.nombre,
      espacios: espacios.filter(espacio => espacio.categoria === categoria.id),
    }))
    .filter(grupo => grupo.espacios.length);

  const conocidos = new Set(categorias.map(categoria => categoria.id));
  const huerfanos = espacios.filter(espacio => !conocidos.has(espacio.categoria));
  if (huerfanos.length) grupos.push({ id: "", nombre: "Sin tipo", espacios: huerfanos });
  return grupos;
};
