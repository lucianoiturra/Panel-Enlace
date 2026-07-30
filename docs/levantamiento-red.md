# Levantamiento de la red — guía de sesión

Orden de trabajo para capturar las asignaciones puerto ↔ espacio en la pestaña Red.
Los números vienen de `lib/red/semilla.json`, medidos sobre el canvas del 2026-06-06.

## 1. La aritmética no cierra 1:1 — resolver esto antes de caminar

| | |
| --- | --- |
| Puertos de patch panel patcheados a un switch, sin roseta conocida | **89** |
| Endpoints por asignar (61 espacios + 40 cubículos − 2 documentados) | **99** |

Faltan 10 puertos para que la cuenta cuadre, así que hay que sacar de la cola lo que no debe consumir un puerto:

**Los 7 sin internet**, que el canvas declara sin roseta ni AP. No hay puerto que buscar: márcalos con la nota `sin roseta` y déjalos en `sin-internet`.

- 7° Básico A · Comedor / Casino · III° Medio A · III° Medio B · IV° Medio · Psicología Media · Sala de Arte

**Sala Computación**: decidir si consume puerto propio o si los endpoints son sus 40 cubículos. Recomendación: los cubículos, y el espacio queda solo como agrupador con su enlace a la pestaña Sala.

Con eso la cola baja a ~91 contra 89 puertos. Los 2 que siguen sobrando confirman que **hay rosetas que llegan a puertos hoy sin patchear**. Los candidatos son los 16 puertos sin etiquetar de R1/PP1 y los 24 libres de R3/PP2 (el Cat5e que el canvas anotó como "nada conectado").

## 2. Estado de cada panel

| Panel | Patcheados | Libres | Sin etiquetar | Destino desconocido | Puertos patcheados |
| --- | --- | --- | --- | --- | --- |
| R2/PP3 | 24 | 0 | 0 | 0 | 1–24 |
| R2/PP2 | 19 | 1 | 4 | 0 | 1–19 |
| R3/PP1 | 16 | 8 | 0 | 0 | 1–6, 8, 12, 14, 16–19, 21–23 |
| R3/PP3 | 12 | 12 | 0 | 0 | 7, 9–11, 17–24 |
| R2/PP1 | 11 | 13 | 0 | 0 | 1–10, 24 (+ p18 y p19 ya documentados) |
| R1/PP1 | 7 | 0 | 16 | 8 | 1–6, 24 |
| R3/PP2 | 0 | 24 | 0 | 0 | ninguno |

## 3. Orden de recorrido

1. **R2/PP1, solo los puertos 18 y 19.** Confirmar las dos asignaciones que vienen del canvas (`UTP E. Básica` y `PIE Administrativo`). Cinco minutos, y te dice si el mapa heredado es confiable o no.
2. **R2/PP3 completo.** 24 de 24 patcheados, sin puertos libres ni dudas: el panel más limpio y el de mejor rendimiento por pasada.
3. **R2/PP2.** 19 patcheados contiguos, del 1 al 19. Los 4 sin etiquetar quedan al final del panel.
4. **R3/PP1 y R3/PP3**, rack de Sala de Profesores. Los patcheados están salteados: sigue la lista de la tabla y no asumas continuidad.
5. **R2/PP1, el resto** (1–10 y 24).
6. **R1/PP1 al final.** Es el más sucio: 16 sin etiquetar y 8 con destino desconocido. Está en la Sala Enlace, así que es el candidato natural a servir los 40 cubículos: es donde conviene ir con el tester y el sentido *desde el puerto*.
7. **R3/PP2: no caminar.** 24 libres, Cat5e, "nada conectado" según el canvas. Solo confirmar que sigue muerto y anotarlo en la nota del equipo.

## 4. Cómo usar la app en cada situación

- **En el rack con el tester:** *Captura rápida* → sentido `DESDE EL PUERTO`, elegir el equipo y recorrer. `Enter` asigna y avanza, `Tab` salta, `Ctrl+Z` deshace la última.
- **Caminando salas:** sentido `DESDE EL ESPACIO`, que recorre la cola de pendientes.
- **Sala con más de una roseta:** asignar el mismo espacio a los dos puertos, cada enlace con su nota (`roseta junto a la pizarra`). El modelo lo soporta sin entidad aparte.
- **Puerto que probaste y no llega a ninguna parte:** *Marcar sin uso*, que lo deja libre y avanza.
- **Los 7 solo-wifi** tienen cable en mal estado, no ausencia de cable: Dirección (dañado, hay que recanalizar), Kinder A (sin canalizar), Multicopiado (deteriorado), más Biblioteca / CRA, Capellanía, Psicología Básica y Fonoaudiología. Si el puerto existe pero el cable está malo, **asigna el puerto igual** y deja el estado en `solo-wifi` con la nota. El mapa físico y el estado de servicio son dos cosas distintas.

## 5. Lo que el canvas ya sabe y no conviene redescubrir

- Los 2 APs conectados cuelgan **directo de puertos de switch**, no de patch panel: Sala Multicopiado en R2/SW1 p22 y Sala de Profesores en R3/SW2 p24. Los otros 2 APs (Área Financiera, Dirección) no tienen enlace registrado.
- Los segmentos IP de los tres racks siguen "por confirmar" (detectados 192.168.20/30/60.x). Es material de la fase 2, pero si vas a estar frente al rack, es el momento de anotarlos.
- Hay 8 puertos de R1/PP1 con destino marcado "desconocido" desde el canvas: no son puertos vacíos, son puertos con algo conectado que nadie identificó.

## 6. Meta de la primera sesión

R2/PP3 completo más los dos de R2/PP1: **26 asignaciones**. La vista Cobertura debería pasar de 2 a 28 de 101.
