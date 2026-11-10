# Enjambre

**Simulación 3D de un enjambre de aves con Boids, combate, teoría de juegos y cadena de mando.**

`Vue 3` · `Three.js` · `WebGL2` · `Vite`

![Vista de escritorio de Enjambre](docs/enjambre-desktop.webp)

`Enjambre` simula un grupo de aves que ataca un objetivo que se defiende. Las aves vuelan con el algoritmo de Boids, se reparten el ataque mediante un juego de congestión, ejecutan una máquina de estados finitos y obedecen una jerarquía de escuadrones cuyos líderes se reemplazan automáticamente cuando caen.

El objetivo no es solo visual: tiene salud y energía, dos metralletas antiaéreas que barren la pantalla, cinco bombas de expansión y un escudo direccional adaptativo. Cada ave tiene 5 puntos de vida, esquiva la línea de tiro, planifica el derribo de las bombas y solo daña al objetivo al colisionar con él. La batalla termina cuando el objetivo cae o cuando el enjambre se queda sin efectivos.

## Tabla de contenidos

- [Características](#características)
- [Inicio rápido](#inicio-rápido)
- [Uso](#uso)
- [Algoritmos](#algoritmos)
  - [Boids en 3D](#1-boids-en-3d)
  - [Rejilla espacial](#2-rejilla-espacial)
  - [Defensa del objetivo](#3-defensa-del-objetivo)
  - [Combate](#4-combate)
  - [Teoría de juegos](#5-teoría-de-juegos)
  - [Máquina de estados finitos](#6-máquina-de-estados-finitos)
  - [Cadena de mando y relevos](#7-cadena-de-mando-y-relevos)
  - [Renderizado WebGL](#8-renderizado-webgl)
- [Arquitectura](#arquitectura)
- [Flujo de un frame](#flujo-de-un-frame)
- [Parámetros](#parámetros)
- [Rendimiento y potencia de cómputo](#rendimiento-y-potencia-de-cómputo)
- [Depuración](#depuración)
- [Limitaciones y próximos pasos](#limitaciones-y-próximos-pasos)
- [Tecnologías](#tecnologías)
- [Créditos](#créditos)

## Características

- **Boids 3D**: separación, alineación y cohesión calculadas en un volumen tridimensional.
- **Hasta 5000 aves**: deslizador de 50 a 5000; la simulación usa una rejilla espacial para evitar comparar todos contra todos.
- **Objetivo defensivo**:
  - Escudo direccional adaptativo que persigue al sector con más aves.
  - Pulsos radiales periódicos que repelen y derriban líderes.
  - Repliegue preventivo cuando el pulso está cargando.
  - Salud (100) y energía (100): los disparos consumen energía y la energía se regenera.
- **Combate**:
  - Dos **metralletas antiaéreas** orientables en cualquier ángulo, con alcance de lado a lado de la pantalla y fuego continuo.
  - Cada disparo resta 1 de salud a un atacante; cada atacante tiene 5 de salud.
  - Cada colisión de un atacante contra el objetivo resta 2 de salud al objetivo.
  - Los atacantes detectan el bloqueo de la mira y esquivan lateralmente.
  - **Bombas de expansión**: 5 por ronda, lentas y con daño en área; el enjambre las detecta y planifica embestirlas.
  - **Aprendizaje defensivo**: cada ave recuerda el daño recibido y esquiva más, se separa más y evita la línea de fuego.
  - Planes de ataque **ordenado** (oleadas de dos escuadrones) y **dividido** (todos los flancos a la vez).
  - Estados de batalla: en curso, objetivo destruido y enjambre aniquilado.
- **Teoría de juegos**: 18 sectores alrededor del objetivo; cada ave elige su mejor respuesta en un juego de congestión que castiga la aglomeración y el riesgo del escudo.
- **FSM por ave**: distribución, espera, ataque, retirada y evasión.
- **Cadena de mando**:
  - Código único por ave (`A-001`, `B-014`, `C-023`…).
  - Cuatro escuadrones, un líder por escuadrón y un comandante.
  - Los líderes acuerdan un flanco distinto para cada escuadrón.
  - Si un líder cae, **el siguiente código de su escuadrón asume el mando**; la jerarquía nunca se rompe.
- **Visualización de mando**: etiquetas 3D con códigos, halos de líder y líneas de comunicación.
- **WebGL con instancing**: todas las aves se dibujan en una sola llamada de render; el aleteo y la orientación se calculan en el vertex shader.
- **Cámara orbital**: arrastra para rotar y usa la rueda o el pellizco para acercar.
- **Interfaz reactiva** con panel de parámetros, HUD de combate (salud, energía, aves vivas, derribos e impactos), estados de la FSM y registro de ascensos.

## Inicio rápido

### Requisitos

- Node.js 22 o superior. Probado con Node.js 24.19 y npm 11.17.
- Un navegador con WebGL2 habilitado. Se recomienda aceleración por hardware.

### Instalar y ejecutar

```bash
npm install
npm run dev
```

Abre la URL que muestra Vite, normalmente `http://localhost:5173`.

### Producción

```bash
npm run build
npm run preview
```

El resultado queda en `dist/`.

### Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compila la versión de producción |
| `npm run preview` | Sirve localmente la compilación de producción |

## Uso

### Interacción

| Acción | Resultado |
| --- | --- |
| Clic o toque | Fija el objetivo defendido y ordena la ofensiva |
| Arrastrar | Orbita la cámara |
| Rueda o pellizco | Zoom |
| Botón **Parámetros** | Abre o cierra el panel |
| **Pausar** | Congela el movimiento de las aves |
| **Esparcir** | Dispersa el enjambre y reinicia la distribución |
| **Abortar** | Elimina el objetivo actual |
| **Reiniciar** | Reinicia aves, estados y jerarquía |

Al hacer clic se lanza un rayo desde la cámara contra un plano que pasa por el origen y mira hacia la cámara. El objetivo se coloca exactamente bajo el cursor, en cualquier punto de la página: el área útil se adapta al tamaño de la ventana y al encuadre de la cámara. Cuando hay objetivo, el enjambre amplía su volumen operativo para poder perseguirlo hasta los bordes; sin objetivo vuelve al volumen central.

### El panel

- **Cadena de mando**: comandante, líderes de escuadrón, códigos, estrategia actual (flanqueo o repliegue), plan de ataque y último ascenso.
- **Combate**: salud y energía del objetivo, atacantes vivos, plan vigente, bombas restantes y recordatorio de daño.
- **Máquina de estados**: número de aves en distribución, ataque, retirada, evasión e intercepción de bombas.
- **Parámetros**: cantidad y comportamiento.
- **Impactos, bloqueos, derribos y disparos**: efectividad del ataque, del escudo y de los cañones.

Sobre la escena, el HUD superior muestra la salud y la energía del objetivo, las aves vivas, los acumulados de derribos e impactos y el estado del arsenal de bombas (cuántas quedan, cuántas vuelan y cuántas aves las interceptan). Cuando la batalla termina, el HUD anuncia el resultado.

### Parámetros

| Control | Rango | Por defecto | Efecto |
| --- | ---: | ---: | --- |
| Cantidad | 50–5000 | 100 | Número de aves |
| Separación | 0–3 | 1.90 | Fuerza para no chocar entre sí |
| Alineación | 0–3 | 1.15 | Tendencia a igualar la dirección de las vecinas |
| Cohesión | 0–3 | 0.95 | Atracción hacia el centro del grupo |
| Ataque | 0–3 | 1.90 | Intensidad de la pasada hacia el objetivo |
| Distribución | 0–2 | 1.00 | Peso de la congestión en el juego de sectores |
| Defensa | 0–2 | 1.00 | Intensidad del escudo y de los pulsos |
| Velocidad | 3–14 | 9.5 | Velocidad máxima de las aves |

Con `Distribución = 0` las aves tienden a amontonarse; con valores altos se reparten mejor. Con `Defensa = 0` el escudo y los pulsos se desactivan.

### Móvil

<img src="docs/enjambre-movil.webp" width="320" alt="Vista móvil de Enjambre" />

La cámara se aleja automáticamente en pantallas estrechas para que quepa el enjambre. Las etiquetas 3D de los líderes se ocultan para no tapar la escena; el código del comandante se muestra en la pista inferior y la cadena completa está en el panel.

## Algoritmos

### 1. Boids en 3D

Cada ave es un agente con posición y velocidad en tres dimensiones. En cada paso acumula tres fuerzas clásicas de Craig Reynolds:

```text
Separación: alejarse de las vecinas demasiado próximas.
Alineación: orientar la velocidad hacia la media de las vecinas.
Cohesión:  acercarse a la posición media del vecindario.
```

La fuerza de dirección se calcula así:

```text
deseado = normalizar(dirección) * velocidadMáxima
fuerza  = deseado - velocidad
fuerza  = limitar(fuerza, fuerzaMáxima)
```

Cada fuerza se multiplica por su peso y se suman. El resultado se limita de nuevo a `maxForce`, se integra con `velocidad += fuerza * dt` y se aplica un límite de velocidad mínima y máxima. La posición avanza con `posición += velocidad * dt`.

Durante el ataque la cohesión baja (a `0.5×` y a `0.2×` en pleno ataque) para que el grupo se abra y las pasadas sean individuales. Los bordes usan una fuerza suave de retorno y un envolvente de seguridad para que ninguna ave se pierda.

Constantes principales:

```text
percepción         7.4
radioSeparación    3.2
maxSpeed           9.5
minSpeed           3.2
maxForce          16
margenBordes      10
```

### 2. Rejilla espacial

Comparar cada ave con las demás sería O(n²). En su lugar se construye cada fotograma una rejilla uniforme cuyo lado es el radio de percepción:

1. Se cuenta cuántas aves hay en cada celda.
2. Se calculan prefijos para obtener el inicio de cada celda.
3. Se colocan los índices en un array plano (`counting sort`).
4. Cada ave revisa únicamente sus 27 celdas vecinas (3×3×3).

El coste es O(n + celdas + n·k), donde `k` es el número de vecinas reales. La rejilla elimina la comparación global, aunque en un racimo muy denso `k` crece y el coste por ave aumenta.

### 3. Defensa del objetivo

El objetivo mantiene un **escudo direccional**:

- Cada 0.22 s se recalculan los sectores ocupados.
- El escudo apunta al sector con más aves: la defensa es adaptativa.
- Su dirección se interpola suavemente: `k = 1 - e^(-2.2·dt)`.
- Tiene un cono de cobertura de `0.95 rad` (~54°) y un radio de 9.5 unidades.

Una pasada se bloquea si el ave está dentro del radio y su dirección desde el objetivo cae dentro del cono:

```text
dot(direcciónAve, direcciónEscudo) > cos(0.95)
```

El ave bloqueada entra en `EVASIÓN`, recibe un impulso hacia afuera y no suma impacto.

Además, el objetivo libera un **pulso radial** cada 5–7 segundos:

- Radio de 15 unidades.
- Las aves alcanzadas reciben un impulso y pasan a `EVASIÓN`.
- Los líderes alcanzados son derribados.
- Los líderes que pueden caer se fijan al inicio del pulso. Así, un reemplazo promovido durante el mismo pulso queda a salvo y no se produce una cadena de derribos.

En los últimos ~2.2 s antes del pulso, el objetivo brilla más y la estrategia cambia a **repliegue**. Las aves que están atacando y se encuentran dentro del radio de peligro se retiran antes de la onda.

![Pulso defensivo](docs/enjambre-defensa.webp)

### 4. Combate

El combate tiene dos lados con recursos finitos.

**Objetivo**

| Recurso | Valor | Regla |
| --- | ---: | --- |
| Salud | 100 | Cada colisión de un atacante resta 2 |
| Energía | 100 | Cada disparo cuesta 1.2; se regenera a 6.5 por segundo |
| Cañones | 2 | Metralletas antiaéreas con alcance de 300 unidades (de lado a lado de la pantalla) |
| Bombas | 5 | Bombas de expansión por ronda, de área y lentas |

#### Metralletas antiaéreas

Los dos cañones no disparan por ráfagas aisladas: funcionan como **metralletas** con alcance de todo el volumen visible. Cada cañón sigue este ciclo:

1. Si tiene energía suficiente (12), elige un atacante dentro de 300 unidades.
2. Fija un punto de mira y avisa a los atacantes cercanos: el blanco sabe que le están disparando.
3. En 0.18 s completa el bloqueo y abre fuego continuo, una bala cada 0.16 s (unas 6 balas por segundo y cañón).
4. La puntería sigue al blanco mientras dure la ráfaga, pero gira más despacio que el ave (factor de aproximación 6): quien se mueve rápido se sale del haz.
5. Cada disparo cuesta 1.2 de energía. Cuando el objetivo se queda sin energía la metralleta se apaga y tarda unos segundos en recargar.

El radio del haz es pequeño (0.8 u), así que la esquiva funciona: en las pruebas el índice de aciertos se queda alrededor del 40–50 %.

El disparo prioriza al atacante bloqueado y concentra el fuego sobre los ya dañados. Los dos cañones evitan apuntar al mismo blanco salvo que no haya alternativa.

#### Bombas de expansión

El objetivo dispone de **5 bombas por ronda**. Cada bomba:

- Cuesta 18 de energía y se lanza como mucho cada 7 s.
- Apunta al centro del racimo de atacantes más concentrados, con una distancia mínima de 18 unidades respecto al objetivo: siempre hay tiempo de vuelo.
- Avanza **lenta** (7 u/s, menos que la velocidad máxima de las aves) y durante sus primeros 1.1 s está desarmada, así que no se puede derribar.
- Al detonar **destruye todo lo que quede dentro de un radio de 7 unidades**: no hace daño parcial, elimina a cada ave alcanzada.

La explosión **siempre se produce**: interceptar la bomba no la desactiva. Embestirla solo adelanta la detonación y la desplaza, de modo que el radio de daño alcanza a menos aves.

El objetivo nunca se-damifica con su propia arma: la bomba **no puede detonar mientras el objetivo esté dentro de su radio de alcance**. Si un ave embiste la bomba demasiado cerca del objetivo, el embiste no la detiene y la bomba sigue volando hasta salir de ese radio antes de detonar.

#### Defensa del enjambre

El enjambre detecta las bombas (radio de 32 u) y **planifica su derribo**:

- Hasta 3 aves por bomba pasan al estado `INTERCEPT` y vuelan hasta su trayectoria.
- Apuntan a la posición futura de la bomba (es lenta y predecible) y chocan contra ella.
- Eligen como interceptores las aves que **no** están dentro del radio de explosión: así la detonación alcanza a menos compañeros.
- La ave que embiste la bomba paga con su salud: está dentro del radio cuando explota.

Además, cada ave lleva una **memoria de daño** (`caution`, de 0 a 3) que sube cuando recibe fuego o cuando proximity una explosión:

| Consecuencia | Efecto |
| --- | --- |
| Esquiva | Más urgente y con más impulso lateral |
| Separación | Se abre más: no se amontonan en la línea de fuego |
| Cohesión | Baja: la formación se dispersa tras un impacto |
| Elección de sector | Evita los sectores alineados con el haz de los cañones |

Esa memoria es el aprendizaje defensivo del enjambre: después de una explosión las aves se abren y las siguientes bombas alcanzan a menos aves.

#### Resto del combate

**Atacantes**

- Cada ave empieza con 5 puntos de salud. Cada impacto de cañón resta 1.
- Al llegar a 0 el ave muere de forma permanente: se oculta, deja de contar para la FSM y no se recupera.
- La única forma de dañar al objetivo es la **colisión**: al entrar en `strikeRadius` sin que el escudo bloquee, resta 2 de salud y el ave inicia una retirada larga.
- Cada colisión tiene un enfriamiento por ave (1.8 s) para que un mismo atacante no vacíe la salud del objetivo en un instante.

**Esquiva**

Cuando un cañón bloquea a un atacante, este recibe un temporizador de amenaza y un vector de impulso perpendicular a la línea de tiro, con signo aleatorio. Las aves cercanas al punto de mira (radio de alerta de 7 u) también esquivan. La metralleta mantiene la alerta viva mientras dure la ráfaga y el ave cambia de lado cada 0.28 s, de modo que sale del haz si se mueve con rapidez.

**Planes de ataque**

| Plan | Cuándo se usa | Comportamiento |
| --- | --- | --- |
| **Ordenado** | La metralleta está disparando y el enjambre está casi intacto | Solo dos escuadrones se lanzan por oleada; los otros dos cubren flancos. La oleada rota cada 2.6–3.4 s |
| **Dividido** | La metralleta recarga o el enjambre ha perdido más del 45 % | Todos los escuadrones atacan por flancos distintos a la vez |

El plan se evalúa en cada reunión de líderes y queda reflejado en el HUD y en el registro de mando.

**Estados de batalla**

```text
idle ──► active ──► target-down   (salud del objetivo = 0)
             └────► swarm-down    (aves vivas = 0)
```

En `target-down` el enjambre rompe filas, los cañones se apagan y el objetivo estalla. En `swarm-down` el objetivo resiste y los cañones dejan de disparar. Ambos estados se anuncian en el HUD y en la pista inferior; **Reiniciar** o colocar un nuevo objetivo devuelve la simulación a `active`.

### 5. Teoría de juegos

El reparto se modela como un **juego de congestión** con 18 sectores repartidos por la esfera mediante una espiral de Fibonacci. Cada ave es un jugador que elige un sector; el pago depende de cuántas aves eligen el mismo sector y del riesgo defensivo.

El pago que usa cada ave es, de forma aproximada:

```text
U(s) = -distribución · congestión(s)
       -defensa · 3.2 · riesgoEscudo(s)²
       -0.22 · costeDesplazamiento(s)
       +0.55 · alineaciónConElFlancoDelEscuadrón(s)
       +0.20 · [s == sectorOrdenado]
       +0.30 · [s == sectorActual]
       +ruido(±0.11)
```

Donde:

- `congestión(s) = avesEnSector(s) / mediaPorSector`.
- `riesgoEscudo(s)²` crece cuando el sector cae dentro del cono del escudo.
- `costeDesplazamiento(s) = 1 - dot(direcciónAve, direcciónSector)`.
- El término de inercia y el ruido evitan oscilaciones y permiten explorar.

Cada ave actualiza su mejor respuesta de forma **escalonada** (temporizadores de 1–2.5 s), con un umbral de histéresis de `0.12`. Solo se replantea el sector cuando está en `DISTRIBUCIÓN` o `ESPERA`. Al cambiar de sector se ajustan los contadores de ocupación de forma incremental.

Los **líderes** añaden una capa de coordinación: cada 2.4–3.2 s asignan un sector distinto a cada escuadrón. El escuadrón del comandante elige primero; el resto elige entre los sectores libres con una puntuación que evita el escudo y la congestión:

```text
score(s) = -4.5 · riesgoEscudo(s)²
           -0.35 · (1 + distribución) · congestión(s)
           +ruido
```

El resultado no es un equilibrio perfecto, pero sí una aproximación estable a un reparto tipo Nash: las aves evitan el escudo y se separan cuando un sector se satura.

### 6. Máquina de estados finitos

Cada ave tiene un estado y un temporizador:

```text
DISTRIBUCIÓN ──► ESPERA ──► ATAQUE ──► RETIRADA
      ▲             │           │           │
      │             │           └───────────┴──► EVASIÓN
      │             │                          │
      │             └──► INTERCEPTAR BOMBA ───┘
      └────────────────────────────────────────┘
```

| Estado | Comportamiento | Salida |
| --- | --- | --- |
| `DISTRIBUCIÓN` | Vuela al punto de espera de su sector | Cerca del punto (< 7 u) → `ESPERA` |
| `ESPERA` | Aguarda en la formación | Temporizador de 0.15–0.5 s → `ATAQUE` |
| `ATAQUE` | Se lanza en línea recta al objetivo | Impacto, bloqueo o repliegue |
| `RETIRADA` | Sale en curva tras impactar | Temporizador → `DISTRIBUCIÓN` |
| `EVASIÓN` | Se aleja tras un pulso o bloqueo | Temporizador → `DISTRIBUCIÓN` |
| `INTERCEPTAR BOMBA` | Vuela hasta la bomba para embestirla | Bomba destruida o inexistente → `DISTRIBUCIÓN` |

Detalles del ataque:

- Si la distancia al objetivo es menor que `strikeRadius = 2.6`, se registra una **colisión**: el objetivo pierde 2 de salud y el ave pasa a `RETIRADA` con un enfriamiento de 1.8 s.
- Si entra en el cono del escudo, pasa a `EVASIÓN` y el escudo suma un bloqueo, sin daño.
- Si el pulso está cargando y está dentro del radio de peligro, se retira antes de la onda.
- Si un cañón bloquea su posición, esquiva lateralmente mientras dure la amenaza.
- Si el mando asigna una bomba a interceptar, vuela hasta su trayectoria y la embiste.
- Las aves con salud 0 quedan fuera de la simulación: no cuentan para la FSM ni para los sectores.
- Los líderes derribados por un pulso permanecen en `EVASIÓN` durante su tiempo de recuperación; los derribados por un cañón mueren de forma permanente.

Los contadores de estado se actualizan dos veces por segundo y se muestran en el panel.

### 7. Cadena de mando y relevos

Cada ave recibe un código estable a partir de su índice:

```text
escuadrón = índice % 4
rango     = floor(índice / 4) + 1
código    = letra(escuadrón) + "-" + rango
```

Ejemplos: `A-001`, `B-014`, `C-023`, `D-1250`.

La jerarquía se define así:

- **Líder de escuadrón**: inicialmente el código activo más bajo; tras un relevo, el siguiente código activo del escuadrón.
- **Comandante**: el líder de escuadrón con el índice más bajo.
- Los líderes comparten la estrategia de flancos descrita en la sección de teoría de juegos.

Cuando un pulso derriba a un líder:

1. Se marca con un tiempo de recuperación de ~6 s.
2. Su escuadrón busca el **siguiente código activo** dentro del mismo escuadrón.
3. Si no queda ningún código posterior activo, se cierra el círculo con los códigos anteriores.
4. Se recalcula el comandante entre los líderes supervivientes.
5. Si no queda ningún líder, el código activo más antiguo asume el mando global.

```text
líder derribado ──► siguiente código del escuadrón
                  └─ si no hay: círculo al código anterior activo
comandante      ──► líder de escuadrón activo más antiguo
                  └─ si no hay líderes: código activo más antiguo
```

El registro del panel guarda los últimos cuatro eventos, por ejemplo:

```text
A-002 derribada · A-003 asume el escuadrón A
B-003 derribada · B-004 asume el escuadrón B
B-001 toma el mando del enjambre
```

Un líder derribado vuelve como miembro al recuperarse. No recupera el mando automáticamente: la responsabilidad ya fue delegada al siguiente código.

La primera versión de esta lógica derribaba a los reemplazos promovidos durante el mismo pulso, lo que producía cascadas de decenas de ascensos. Ahora el pulso toma una **instantánea de los líderes al inicio** y solo puede derribar a esos líderes, no a sus reemplazos.

### 8. Renderizado WebGL

Las aves se dibujan con `InstancedBufferGeometry` y un `ShaderMaterial` propio:

- Un único *draw call* para todas las aves.
- 12 vértices por ave: dos alas, cuerpo y cola.
- Atributos instanciados: posición, velocidad, color, fase y salud.
- El vertex shader construye una base ortonormal a partir de la velocidad (`forward`, `right`, `up`) y orienta el ave.
- El aleteo se calcula con `sin(tiempo + fase)` y desplaza las puntas de las alas.
- El color se asigna por escuadrón (cian, azul, violeta y magenta).
- La mezcla es aditiva; la intensidad baja cuando hay muchas aves superpuestas para no saturar el centro.
- El tamaño se adapta a la cantidad de aves y a la distancia de la cámara.

La escena incluye además:

- Retícula naranja del objetivo, que se tiñe de rojo según su salud.
- Dos cañones con base, cañón, punta luminosa y un resplandor en la boca que se mantiene encendido mientras disparan.
- Las balas se dibujan como proyectiles luminosos en vuelo (no como líneas) y cada disparo deja un fogonazo en la boca del cañón.
- Bombas de expansión con núcleo pulsante, halo, anillo del área de explosión y trayectoria prevista.
- Ondas de explosión de las bombas (anillo expansivo) y chispas de interceptación.
- Líneas de mira y anillos de bloqueo sobre el punto de mira anticipado.
- Haces instantáneos (trazadoras) al disparar y chispas de impacto.
- Cúpula de escudo y anillo de borde.
- Ondas de pulso (esfera y anillo).
- Chispas de colisiones, de impactos y de aves derribadas.
- Polvo ambiental.
- Etiquetas de códigos, halos de líder y enlaces de mando.

El shader de las aves recibe un atributo `aHealth`: las aves dañadas pierden brillo y las que llegan a 0 se descartan en el fragment shader (`discard`). Así el coste de dibujar un ave muerta es nulo sin tocar la geometría instanciada.

En pantallas estrechas la cámara se encuadra automáticamente; si la relación de aspecto es menor que 0.8 se ocultan las etiquetas de los líderes y se conservan los halos y enlaces.

## Arquitectura

```text
src/
├── App.vue                  Interfaz, panel, cadena de mando y HUD
├── main.js                  Punto de entrada de Vue
├── style.css                Estilos base
├── composables/
│   └── useBoids.js          RAF, resize, eventos de puntero y puente Vue
└── lib/
    ├── flock3d.js           Boids, rejilla, FSM, juego, defensa, combate y jerarquía
    └── birdScene.js         Three.js: instancing, shader, escudo, pulsos, cañones,
                             haces, etiquetas, enlaces y cámara
```

Separación de responsabilidades:

- `flock3d.js` no conoce Vue ni Three.js: es simulación pura sobre `Float32Array` y `Uint8Array`.
- `birdScene.js` no conoce la lógica interna del juego: lee posiciones, estados, escudo y eventos de la simulación y los dibuja.
- `useBoids.js` conecta ambos con la reactividad de Vue: crea la simulación y la escena, ejecuta el bucle de animación, procesa clics y publica estadísticas.

Flujo de datos:

```text
App.vue ──parámetros/cantidad──► useBoids ──► Flock3D
   ▲                               │             │
   └────estadísticas/mando─────────┘             ▼
                                          BirdScene ──► WebGL
```

## Flujo de un frame

1. `requestAnimationFrame` calcula `dt` (limitado a 50 ms).
2. Si no está en pausa, `Flock3D.update(dt)`:
   - reconstruye la rejilla espacial (ignorando aves muertas),
   - actualiza la defensa y los pulsos,
   - actualiza los cañones, las bombas, los temporizadores de esquiva y el plan de ataque,
   - recupera líderes derribados por pulsos,
   - recorre las aves: vecinas, fuerzas, esquiva, FSM, planificación, colisiones e integración,
   - actualiza escudo, estrategia, estado de batalla y jerarquía.
3. `BirdScene.update(dt, tiempo)`:
   - actualiza el tamaño y la intensidad adaptativos,
   - sube posiciones, velocidades y salud a la GPU,
   - dibuja cañones, bombas, miras, haces, chispas, marcador, escudo, pulsos, etiquetas y enlaces,
   - actualiza los controles de cámara.
4. `render()` dibuja la escena.
5. Cada 0.5 s se publican FPS, impactos, bloqueos, derribos, disparos, bombas, estados FSM, combate y cadena de mando a la interfaz.

## Parámetros

### Ajustables desde la interfaz

| Parámetro | Rango | Defecto |
| --- | ---: | ---: |
| Cantidad | 50–5000 | 100 |
| Separación | 0–3 | 1.90 |
| Alineación | 0–3 | 1.15 |
| Cohesión | 0–3 | 0.95 |
| Ataque | 0–3 | 1.90 |
| Distribución | 0–2 | 1.00 |
| Defensa | 0–2 | 1.00 |
| Velocidad | 3–14 | 9.5 |

### Constantes de simulación

Están en `src/lib/flock3d.js`:

| Constante | Valor | Uso |
| --- | ---: | --- |
| `perception` | 7.4 | Radio de vecindad |
| `separationRadius` | 3.2 | Radio de separación |
| `maxForce` | 16 | Aceleración máxima |
| `edgeMargin` | 10 | Margen de los bordes |
| `strikeRadius` | 2.6 | Radio de impacto |
| `STAGE_RADIUS` | 20 | Radio de la formación de espera |
| `PLAY_BOUNDS` | 190 × 120 × 190 | Volumen operativo para perseguir objetivos en toda la página |
| `SECTOR_COUNT` | 18 | Sectores del juego |
| `SQUAD_COUNT` | 4 | Escuadrones |
| `SHIELD_RADIUS` | 9.5 | Radio del escudo |
| `SHIELD_ANGLE` | 0.95 rad | Semiangulo del cono del escudo |
| `PULSE_RADIUS` | 15 | Radio del pulso defensivo |
| `TARGET_MAX_HEALTH` | 100 | Salud del objetivo |
| `TARGET_MAX_ENERGY` | 100 | Energía del objetivo |
| `ATTACKER_MAX_HEALTH` | 5 | Salud de cada atacante |
| `SHOT_DAMAGE` | 1 | Daño de cada disparo |
| `COLLISION_DAMAGE` | 2 | Daño de cada colisión |
| `CANNON_COUNT` | 2 | Metralletas del objetivo |
| `CANNON_RANGE` | 300 | Alcance: de lado a lado de la pantalla |
| `CANNON_AIM_TIME` | 0.18 s | Tiempo de bloqueo antes de abrir fuego |
| `CANNON_FIRE_INTERVAL` | 0.16 s | Cadencia de la metralleta |
| `CANNON_ENERGY_COST` | 1.2 | Energía por disparo |
| `CANNON_BURST_ENERGY` | 12 | Energía mínima para abrir una ráfaga |
| `ENERGY_REGEN` | 6.5/s | Regeneración de energía |
| `SHOT_RADIUS` | 0.8 | Radio del haz |
| `COLLISION_COOLDOWN` | 1.8 s | Enfriamiento de colisión por ave |
| `DODGE_ALERT_RADIUS` | 7 | Radio de alerta de esquiva |
| `BOMB_COUNT` | 5 | Bombas de expansión por ronda |
| `BOMB_SPEED` | 7 u/s | Velocidad de la bomba (lenta) |
| `BOMB_RADIUS` | 7 | Radio de la explosión (letal dentro) |
| `BOMB_FUSE` | 8 s | Vida máxima de la bomba |
| `BOMB_ENERGY_COST` | 18 | Energía por bomba |
| `BOMB_COOLDOWN` | 7 s | Tiempo mínimo entre bombas |
| `BOMB_ARM_TIME` | 1.1 s | Tiempo de armado: no se puede derribar |
| `BOMB_MIN_RANGE` | 18 u | Distancia mínima del punto de detonación |
| `BOMB_DETECT_RADIUS` | 32 | Radio de detección de las aves |
| `BOMB_MAX_INTERCEPTORS` | 3 | Aves que planifican el derribo por bomba |
| `LEADER_DOWN_TIME` | ~6 s | Recuperación de un líder |
| `STRATEGY_INTERVAL` | ~2.4 s | Reunión de líderes |

## Rendimiento y potencia de cómputo

### Complejidad

| Proceso | Coste |
| --- | --- |
| Rejilla espacial | O(n + celdas) |
| Boids (vecinas) | O(n·k), con `k` vecinas reales |
| FSM | O(n) por paso |
| Juego de sectores | O(n·18) repartido en decisiones escalonadas |
| Cañones | O(n) por cañón y disparo (hitscan) |
| Bombas | O(n) por detonación (área) |
| Jerarquía de líderes | O(4) cada ~2.4 s |
| Renderizado | O(n) vértices + coste de relleno |

### Mediciones

Medido en el entorno de desarrollo (AMD Radeon 890M, Chrome, 1920×937, 24 hilos). Los valores dependen del estado del enjambre y de la densidad del racimo:

| Aves | FPS observados | Simulación aproximada |
| ---: | ---: | ---: |
| 100 | ~60 | ~0.04 ms/paso |
| 1 000 | ~60 | ~1.2 ms/paso |
| 3 000 | ~60 | — |
| 5 000 | ~22 en asedio denso | ~26 ms/paso en Node; hasta ~60 ms en racimos muy densos |

La capa de mando no es el cuello de botella:

- La jerarquía son cuatro escuadrones y se actualiza cada ~2.4 s.
- La FSM es O(1) por ave.
- El juego de sectores solo evalúa 18 opciones cuando a cada ave le toca replantearse el sector.
- En una medición densa a 5000 aves, la coordinación completa añadió aproximadamente **3 ms (~5 %)** frente al Boids base.

Lo que domina el coste es la **búsqueda de vecinas** y el **renderizado**. A 5000 aves en un volumen fijo la densidad es alta: cada ave ve muchas más vecinas y la ventaja de la rejilla se reduce. En pantalla, la mezcla aditiva y el relleno de miles de aves también pesan.

### Cómo escalar más

- Limitar el número de vecinas por ave.
- Aumentar el volumen de simulación o reducir la percepción con la cantidad.
- Bajar la frecuencia de planificación de sectores.
- Usar LOD o sprites a distancia.
- Mover la simulación a un `Web Worker` o a la GPU.
- Reducir la cantidad de aves o la resolución del render.

Para 100–3000 aves la experiencia es fluida en el equipo de prueba. 5000 es el modo de estrés.

## Depuración

En desarrollo, la simulación y la escena quedan expuestas en `window.__boids`:

```js
__boids.simulation.getStateCounts()
// [distribución, espera, ataque, retirada, evasión]

__boids.simulation.getCommandInfo()
// comandante, líderes, estrategia, plan y registro

__boids.simulation.getCombatInfo()
// salud/energía del objetivo, aves vivas, plan, estado y cañones

__boids.simulation.getCode(42)
// "C-011"

__boids.simulation.leaderOfSquad
__boids.simulation.commander
__boids.simulation.downTimers
__boids.simulation.health
__boids.simulation.targetHealth
__boids.simulation.targetEnergy
__boids.simulation.battleState
__boids.simulation.bombs
__boids.simulation.caution
__boids.scene.totalImpacts
__boids.scene.totalBlocks
__boids.scene.totalKills
__boids.scene.totalCollisions
__boids.scene.totalShots
__boids.scene.totalBombsLaunched
__boids.scene.totalBombExplosions
__boids.scene.totalBombIntercepts
```

Los eventos de combate se consumen de la simulación y se dibujan en la escena: `consumeShots()`, `consumeKills()` y `consumeCollisions()` vacían sus colas. Si llamas a `setTarget()` directamente desde DevTools, reinicia también `scene.totalKills`, `scene.totalCollisions` y `scene.totalShots` a mano; los botones y el clic lo hacen por ti.

`setCount()` también está disponible en la simulación, pero si se usa directamente no se sincroniza el deslizador de Vue; para probar desde la interfaz es mejor usar el control de cantidad.

El hook solo existe con `import.meta.env.DEV`; no se publica en la compilación de producción.

## Limitaciones y próximos pasos

- Los cañones son hitscan con bloqueo telegrafiado: no simulan proyectiles ni balística.
- Las bombas siempre detonan: interceptarlas solo desplaza la explosión, no la cancela.
- La explosión es letal dentro del radio: no existe el daño parcial.
- La memoria de daño es un estado por ave (0–3), no un aprendizaje real entre partidas.
- Las colisiones son esféricas y no hay mallas de colisión; las aves son geometría instanciada.
- Los líderes derribados por pulsos se recuperan como miembros; los derribados por cañones mueren de forma permanente.
- La comunicación entre líderes es una simulación local por ticks de estrategia, no una red real.
- Los cuatro escuadrones y los 18 sectores están fijados en el código, aunque son fáciles de cambiar.
- A 5000 aves el rendimiento cae en hardware integrado.

Posibles extensiones:

- Más tipos de defensa (torretas, campos de minas, escudos móviles).
- Doctrinas de ataque por escuadrón y formaciones explícitas.
- Comunicación con latencia y pérdida de paquetes.
- Exportar métricas de la simulación y del combate.
- Ejecutar la simulación en un worker para liberar el hilo principal.

## Tecnologías

- [Vue 3](https://vuejs.org/) — interfaz y reactividad.
- [Three.js](https://threejs.org/) — escena, cámara, instancing y shaders WebGL.
- [Vite](https://vite.dev/) — desarrollo y compilación.
- JavaScript moderno con `Float32Array`, `Uint8Array` y `Int32Array`.
- GLSL para el shader de las aves.
- `CanvasTexture` para las etiquetas de códigos.

No se usan texturas ni modelos externos: el ave, el polvo, el escudo, los pulsos y las etiquetas se generan por código.

## Créditos

- Algoritmo de Boids original: **Craig W. Reynolds**, *Flocks, Herds, and Schools: A Distributed Behavioral Model* (1986).
- Three.js y Vue.js por sus respectivas comunidades.
- Diseño y código de esta simulación: proyecto **Enjambre**.

## Licencia

Este repositorio no incluye una licencia explícita. Si vas a reutilizar el código, añade la licencia que corresponda.
