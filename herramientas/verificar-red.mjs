// Verificación de la capa de persistencia de la pestaña Red.
//
// Cubre lo que las tareas 4, 5 y 6 del plan dejan pendiente: el DDL, la siembra
// y los cuatro verbos de la API contra una base real. No reemplaza las
// comprobaciones manuales de las vistas, que están en el plan tarea por tarea.
//
// Requisitos:
//   1. DATABASE_URL en .env.local (de preferencia un proyecto Supabase de prueba).
//   2. npm run dev corriendo en otra terminal.
//   3. Si definiste APP_USERNAME y APP_PASSWORD, expórtalas también en esta
//      terminal para que el script pueda autenticarse.
//
// Uso:
//   node herramientas/verificar-red.mjs
//   node herramientas/verificar-red.mjs http://localhost:3001
//
// Qué escribe en la base: crea un enlace y lo borra, y cambia el estado y la
// nota de un espacio y los devuelve a su valor original. Lo único que queda son
// unas 6 entradas de bitácora, porque la bitácora es append-only por diseño.

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const usuario = process.env.APP_USERNAME;
const clave = process.env.APP_PASSWORD;
const cabeceras = usuario && clave ? { Authorization: `Basic ${Buffer.from(`${usuario}:${clave}`).toString("base64")}` } : {};

let fallas = 0;
let pasadas = 0;

const check = (nombre, condicion, detalle = "") => {
  if (condicion) { pasadas += 1; console.log(`  ok   ${nombre}`); return true; }
  fallas += 1;
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  return false;
};

const pedir = async (ruta, opciones = {}) => {
  const response = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { ...cabeceras, ...(opciones.body ? { "Content-Type": "application/json" } : {}), ...(opciones.headers ?? {}) },
  });
  const crudo = await response.text();
  let datos = null;
  try { datos = JSON.parse(crudo); } catch { datos = null; }
  return { status: response.status, datos, crudo };
};

const leerEstado = async () => {
  const { status, datos, crudo } = await pedir("/api/red");
  if (status !== 200 || !datos) throw new Error(`GET /api/red respondió ${status}: ${crudo.slice(0, 300)}`);
  return { estado: datos, crudo };
};

const maxBitacora = estado => estado.bitacora.reduce((mayor, entrada) => Math.max(mayor, entrada.id), 0);
const nuevasEntradas = (estado, desde) => estado.bitacora.filter(entrada => entrada.id > desde);

async function principal() {
  console.log(`Verificando ${base}\n`);

  console.log("1. Lectura y siembra");
  const primera = await leerEstado();
  const estado = primera.estado;
  check("3 racks", estado.racks.length === 3, `hay ${estado.racks.length}`);
  check("20 equipos", estado.equipos.length === 20, `hay ${estado.equipos.length}`);
  check("13 equipos con puertos", estado.equipos.filter(equipo => equipo.puertos > 0).length === 13, `hay ${estado.equipos.filter(equipo => equipo.puertos > 0).length}`);
  check("331 puertos", estado.puertos.length === 331, `hay ${estado.puertos.length}`);
  check("324 puertos nominales", estado.puertos.filter(puerto => puerto.n > 0).length === 324, `hay ${estado.puertos.filter(puerto => puerto.n > 0).length}`);
  check("61 espacios", estado.espacios.length === 61, `hay ${estado.espacios.length}`);
  check("98 enlaces sembrados", estado.enlaces.length >= 98, `hay ${estado.enlaces.length}`);
  check("40 cubículos", estado.cubiculos.length === 40, `hay ${estado.cubiculos.length}`);
  check("bitácora acotada a 200", estado.bitacora.length <= 200, `hay ${estado.bitacora.length}`);
  check("sin PINs en la respuesta", !/pin/i.test(primera.crudo));
  check("20 puertos sin etiquetar", estado.puertos.filter(puerto => puerto.nota === "sin etiquetar en el levantamiento").length === 20);
  check("8 puertos con destino desconocido", estado.puertos.filter(puerto => puerto.nota === "destino desconocido según canvas").length === 8);

  console.log("\n2. Siembra idempotente");
  const segunda = await leerEstado();
  check("una segunda lectura no duplica puertos", segunda.estado.puertos.length === estado.puertos.length, `${estado.puertos.length} → ${segunda.estado.puertos.length}`);
  check("una segunda lectura no duplica enlaces", segunda.estado.enlaces.length === estado.enlaces.length, `${estado.enlaces.length} → ${segunda.estado.enlaces.length}`);

  const espacioLibre = estado.espacios.find(espacio => !estado.enlaces.some(enlace => enlace.a === espacio.id || enlace.b === espacio.id));
  const puertoLibre = estado.puertos.find(puerto => puerto.n > 0 && puerto.estado === "libre" && !estado.enlaces.some(enlace => enlace.a === puerto.id || enlace.b === puerto.id));
  if (!espacioLibre || !puertoLibre) {
    console.log("\nNo hay un espacio y un puerto libres para probar los enlaces. Detengo aquí sin escribir nada.");
    return;
  }
  console.log(`\n3. Enlaces (usando ${espacioLibre.nombre} y ${puertoLibre.id})`);
  const antesDeCrear = maxBitacora(estado);

  const creado = await pedir("/api/red/enlaces", { method: "POST", body: JSON.stringify({ a: espacioLibre.id, b: puertoLibre.id, nota: "verificación automática" }) });
  check("crear un enlace responde 201", creado.status === 201, `respondió ${creado.status}: ${creado.crudo.slice(0, 200)}`);
  const enlaceId = creado.datos?.enlace?.id;
  check("devuelve el enlace con id", Number.isInteger(enlaceId), `devolvió ${JSON.stringify(creado.datos)}`);
  check("el tipo inferido es roseta", creado.datos?.enlace?.tipo === "roseta", `es ${creado.datos?.enlace?.tipo}`);

  const duplicado = await pedir("/api/red/enlaces", { method: "POST", body: JSON.stringify({ a: espacioLibre.id, b: puertoLibre.id }) });
  check("el duplicado exacto responde 400", duplicado.status === 400, `respondió ${duplicado.status}`);
  check("el duplicado dice que ya existe", /ya existe/i.test(duplicado.datos?.error ?? ""), duplicado.datos?.error);

  const invertido = await pedir("/api/red/enlaces", { method: "POST", body: JSON.stringify({ a: puertoLibre.id, b: espacioLibre.id }) });
  check("el duplicado en orden inverso responde 400", invertido.status === 400, `respondió ${invertido.status}`);

  const consigoMismo = await pedir("/api/red/enlaces", { method: "POST", body: JSON.stringify({ a: puertoLibre.id, b: puertoLibre.id }) });
  check("un punto contra sí mismo responde 400", consigoMismo.status === 400, `respondió ${consigoMismo.status}`);

  const inexistente = await pedir("/api/red/enlaces", { method: "POST", body: JSON.stringify({ a: "esp:no-existe", b: puertoLibre.id }) });
  check("un extremo inexistente responde 400", inexistente.status === 400, `respondió ${inexistente.status}`);

  const conEnlace = (await leerEstado()).estado;
  check("el puerto quedó ocupado", conEnlace.puertos.find(puerto => puerto.id === puertoLibre.id)?.estado === "ocupado", `quedó ${conEnlace.puertos.find(puerto => puerto.id === puertoLibre.id)?.estado}`);
  const trasCrear = nuevasEntradas(conEnlace, antesDeCrear);
  check("crear el enlace dejó exactamente una entrada", trasCrear.length === 1, `dejó ${trasCrear.length}: ${trasCrear.map(entrada => entrada.tipo).join(", ")}`);
  check("la entrada es de tipo enlace-creado", trasCrear[0]?.tipo === "enlace-creado", `es ${trasCrear[0]?.tipo}`);

  const antesDeBorrar = maxBitacora(conEnlace);
  const borrado = await pedir(`/api/red/enlaces?id=${enlaceId}`, { method: "DELETE" });
  check("borrar el enlace responde 200", borrado.status === 200, `respondió ${borrado.status}`);
  const sinEnlace = (await leerEstado()).estado;
  check("el puerto volvió a libre", sinEnlace.puertos.find(puerto => puerto.id === puertoLibre.id)?.estado === "libre", `quedó ${sinEnlace.puertos.find(puerto => puerto.id === puertoLibre.id)?.estado}`);
  const trasBorrar = nuevasEntradas(sinEnlace, antesDeBorrar);
  check("borrar dejó exactamente una entrada", trasBorrar.length === 1, `dejó ${trasBorrar.length}`);
  check("la entrada es de tipo enlace-borrado", trasBorrar[0]?.tipo === "enlace-borrado", `es ${trasBorrar[0]?.tipo}`);

  console.log(`\n4. Estado y nota (usando ${espacioLibre.nombre})`);
  const original = sinEnlace.espacios.find(espacio => espacio.id === espacioLibre.id);
  const nuevoEstado = original.estado === "operativo" ? "sin-verificar" : "operativo";
  const antesDePut = maxBitacora(sinEnlace);

  const put = await pedir("/api/red", { method: "PUT", body: JSON.stringify({ tipo: "espacio", id: espacioLibre.id, estado: nuevoEstado, nota: "verificación automática" }) });
  check("PUT de estado y nota responde 200", put.status === 200, `respondió ${put.status}: ${put.crudo.slice(0, 200)}`);
  const trasPut = (await leerEstado()).estado;
  check("el estado cambió", trasPut.espacios.find(espacio => espacio.id === espacioLibre.id)?.estado === nuevoEstado);
  const entradasPut = nuevasEntradas(trasPut, antesDePut);
  check("dos campos dejan dos entradas", entradasPut.length === 2, `dejó ${entradasPut.length}: ${entradasPut.map(entrada => entrada.tipo).join(", ")}`);
  check("una es de estado y otra de nota", entradasPut.some(entrada => entrada.tipo === "estado-espacio") && entradasPut.some(entrada => entrada.tipo === "nota"), entradasPut.map(entrada => entrada.tipo).join(", "));

  const antesDeRepetir = maxBitacora(trasPut);
  await pedir("/api/red", { method: "PUT", body: JSON.stringify({ tipo: "espacio", id: espacioLibre.id, estado: nuevoEstado, nota: "verificación automática" }) });
  const trasRepetir = (await leerEstado()).estado;
  check("un PUT sin cambios no deja entradas", nuevasEntradas(trasRepetir, antesDeRepetir).length === 0, `dejó ${nuevasEntradas(trasRepetir, antesDeRepetir).length}`);

  const estadoInvalido = await pedir("/api/red", { method: "PUT", body: JSON.stringify({ tipo: "espacio", id: espacioLibre.id, estado: "inventado" }) });
  check("un estado fuera del vocabulario responde 400", estadoInvalido.status === 400, `respondió ${estadoInvalido.status}`);

  const prefijoCruzado = await pedir("/api/red", { method: "PUT", body: JSON.stringify({ tipo: "puerto", id: espacioLibre.id, estado: "libre" }) });
  check("un prefijo que no calza con el tipo responde 400", prefijoCruzado.status === 400, `respondió ${prefijoCruzado.status}`);

  const restaurado = await pedir("/api/red", { method: "PUT", body: JSON.stringify({ tipo: "espacio", id: espacioLibre.id, estado: original.estado, nota: original.nota }) });
  check("se restauró el estado original del espacio", restaurado.status === 200);

  console.log("\n5. Cadena de un endpoint");
  const cadena = await pedir(`/api/red/cadena?endpoint=cub:${estado.cubiculos[0].id}`);
  check("la cadena de un cubículo responde 200", cadena.status === 200, `respondió ${cadena.status}`);
  check("trae saltos y bandera de completa", Array.isArray(cadena.datos?.saltos) && typeof cadena.datos?.completa === "boolean", JSON.stringify(cadena.datos)?.slice(0, 200));
  const cadenaMala = await pedir("/api/red/cadena?endpoint=basura");
  check("un endpoint inválido responde 400", cadenaMala.status === 400, `respondió ${cadenaMala.status}`);

  console.log(`\n${pasadas} pasadas, ${fallas} fallas`);
  if (fallas) process.exitCode = 1;
}

principal().catch(error => {
  console.error(`\nNo se pudo completar la verificación: ${error.message}`);
  console.error("Revisa que npm run dev esté corriendo, que DATABASE_URL esté en .env.local, y que APP_USERNAME/APP_PASSWORD estén exportadas si las configuraste.");
  process.exitCode = 1;
});
