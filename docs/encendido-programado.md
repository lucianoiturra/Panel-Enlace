# Encendido programado (Wake-on-LAN)

cabserver manda el paquete mágico; los 38 PC con MAC documentada lo reciben. El lado del
servidor está listo y probado. **El lado difícil son los PC**, y sin él no despierta
ninguno.

## Por qué esto funciona acá

cabserver está en `192.168.1.20/24` por `enp2s0`, el mismo dominio de broadcast plano que
los PC de la sala. Un paquete mágico es una trama de capa 2 a la dirección de difusión: no
necesita router, ni acceso al switch Cisco, ni al FortiGate. Es lo único de la red del
colegio que se puede hacer sin las credenciales que no tenemos.

## Lo que hay que tocar en cada PC

Son tres cosas y las tres son necesarias. Si falta una, el equipo no despierta.

### 1. BIOS (Lenovo IdeaCentre AIO 310-20IAP)

F1 o F2 al arrancar.

- **Power → Automatic Power On → Wake on LAN**: `Enabled` (o `Primary`).
- **Power → ErP / Deep Sleep**: **`Disabled`**. Con ErP activo, el estado S5 le corta la
  corriente a la placa de red y no hay paquete que la despierte. Es la trampa silenciosa:
  el resto de la configuración se ve correcta y aun así no funciona.

### 2. Driver de red (Windows)

Administrador de dispositivos → adaptador de red → Propiedades:

- Pestaña **Administración de energía**: marcar *Permitir que este dispositivo reactive el
  equipo*.
- Pestaña **Opciones avanzadas**: *Wake on Magic Packet* → `Habilitado`.

### 3. Inicio rápido de Windows — APAGARLO

```bat
powercfg /h off
```

**Si haces una sola cosa de las tres, que sea esta.** El "apagado" de Windows con Inicio
rápido no es un apagado: es una hibernación parcial que deja la placa de red en un estado
del que muchos NIC no despiertan. Es la causa número uno de "configuré todo y no funciona".

El comando va en una consola de Administrador. De paso libera el `hiberfil.sys`.

## El piloto: dos PC antes que treinta y ocho

Configurar 38 BIOS para descubrir al final que faltaba un paso es una tarde perdida.

```bash
# 1. Apaga del todo los dos equipos de prueba (por ejemplo el 3 y el 7)

# 2. Manda el paquete desde cabserver
ssh -t cabserver "sudo /usr/local/sbin/wol-cabserver.sh --ahora 3 7"

# 3. A los 8 minutos, mira si despertaron
ssh -t cabserver "sudo /usr/local/sbin/wol-cabserver.sh --estado"
```

La verificación tarda 8 minutos porque se apoya en `mon_devices`, que se llena con el
barrido ARP de NetAlertX (5 min) más el ciclo del sidecar (3 min). Se apoya en la **MAC** y
no en la IP a propósito: si el equipo agarró otra IP por DHCP, igual se lo reconoce.

Si no despiertan, revisar en este orden: Inicio rápido, ErP en la BIOS, driver.

## Programar horarios

Una vez que el piloto despierta, los horarios son filas en `wol_programas`:

```sql
-- Lunes a viernes, 07:45, toda la sala
INSERT INTO wol_programas (nombre, dias, hora, objetivo, activo, creado_at)
VALUES ('Apertura de la sala', '12345', '07:45', 'todos', true, now()::text);

-- Solo los cubículos del fondo, martes y jueves a las 13:30
INSERT INTO wol_programas (nombre, dias, hora, objetivo, activo, creado_at)
VALUES ('Taller de la tarde', '24', '13:30', '31,32,33,34,35', true, now()::text);
```

- `dias`: dígitos ISO pegados, `1` = lunes … `7` = domingo.
- `hora`: `HH:MM` en la hora local del servidor.
- `objetivo`: `todos` o una lista de cubículos separados por coma.

Un timer revisa cada minuto si toca. Un equipo que ya está encendido no recibe paquete: así
"despertó" significa algo cuando se verifique, en vez de premiar a los que nunca se apagaron.

## Apagar es el problema espejo, y WOL no lo resuelve

No existe un "paquete mágico de apagado": apagar exige un agente dentro del PC. Lo honesto
es repartirlo:

- **Encender es del servidor** — paquete mágico, lo que hace este script.
- **Apagar es de los PC** — una tarea programada local de Windows a una hora fija, o por
  GPO si algún día hay dominio:

```bat
schtasks /create /tn "Apagado 18:30" /tr "shutdown /s /t 60 /c \"Apagando la sala\"" /sc daily /st 18:30 /ru SYSTEM
```

Si Veyon ya está desplegado, su master también apaga — pero eso es apretar un botón, y
programarlo era justamente el punto.

## Cuando algo falla

```bash
# ¿está vivo el timer?
ssh cabserver "systemctl list-timers wol-cabserver.timer --no-pager"

# ¿qué pasó en las últimas corridas?
ssh -t cabserver "sudo journalctl -u wol-cabserver.service -n 30 --no-pager"

# probar la lógica sin mandar ningún paquete ni encender nada (11 comprobaciones)
ssh cabserver "cd /srv/apps/panel-enlace && sh ops/prueba-wol.sh"
```

Los PC que no despertaron se avisan por ntfy después de la verificación, en un solo mensaje.
