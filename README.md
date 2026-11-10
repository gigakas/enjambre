# Enjambre · Boids 3D con mando y defensa

Simulación 3D de un enjambre de aves con el **algoritmo de Boids**, renderizada con **WebGL** (Three.js). El objetivo se defiende, las aves se reparten con **teoría de juegos**, cada una ejecuta una **máquina de estados finitos (FSM)** y el enjambre opera con una **cadena de mando con relevos automáticos**.

Haz clic o toca en la pantalla para señalar el objetivo defendido.

## Qué incluye

- **Boids 3D**: separación, alineación y cohesión en un volumen tridimensional.
- **Objetivo defensivo**:
  - Escudo direccional adaptativo que persigue al sector más congestionado.
  - Pulsos radiales que repelen a las aves cercanas.
  - El escudo bloquea las pasadas que entran por su cono de cobertura.
- **Distribución por teoría de juegos**: 18 sectores alrededor del objetivo; cada ave elige su mejor respuesta en un juego de congestión que castiga la aglomeración y el riesgo del escudo.
- **FSM por ave**: `DISTRIBUCIÓN → ESPERA → ATAQUE → RETIRADA / EVASIÓN`.
- **Cadena de mando**:
  - Cada ave tiene un código único: `A-001`, `B-014`, `C-023`…
  - Cuatro escuadrones; un líder por escuadrón y un comandante.
  - Los líderes acuerdan un flanco distinto para cada escuadrón.
  - Si un líder es derribado por un pulso defensivo, **el siguiente código de su escuadrón asume el mando**. El comandante pasa al líder superviviente más antiguo. La cadena nunca se rompe: si no queda ningún líder, el código activo más antiguo toma el control global.
  - Un líder derribado vuelve como miembro tras recuperarse; no recupera el mando automáticamente.
- **Visualización de mando**: etiquetas 3D con los códigos, halos de líder, líneas de comunicación entre el comandante y los escuadrones, y un registro de ascensos en el panel.
- **WebGL con instancing**: todas las aves se dibujan en una sola llamada de render; el aleteo y la orientación se calculan en el vertex shader.
- **Escalable** de 50 a 5000 aves con rejilla espacial.
- **Cámara orbital**: arrastra para rotar, rueda/pellizco para acercar.

## Ejecutar

```bash
npm install
npm run dev
```

La URL por defecto es `http://localhost:5173`.

Para producción:

```bash
npm run build
npm run preview
```

## Controles

| Acción | Resultado |
| --- | --- |
| Clic / toque | Fija el objetivo defendido y ordena la ofensiva |
| Arrastrar | Orbita la cámara |
| Rueda / pellizco | Zoom |
| **Parámetros** | Abre o cierra el panel |
| Pausar | Congela el movimiento de las aves |
| Esparcir | Dispersa el enjambre |
| Abortar | Elimina el objetivo |
| Reiniciar | Reinicia aves y jerarquía |

Deslizadores: cantidad de aves, separación, alineación, cohesión, fuerza de ataque, **distribución** (peso de la congestión), **defensa** (intensidad del escudo y los pulsos) y velocidad.

## Cómo funciona

### Boids y rejilla espacial

Cada ave acumula tres fuerzas clásicas: separación, alineación y cohesión. El vecindario se consulta con una rejilla espacial reconstruida por *counting sort* en cada paso, evitando comparar todos contra todos.

### Defensa del objetivo

El escudo apunta a un cono del espacio. Cada 0,22 s se recalcula el sector con más aves y el escudo gira suavemente hacia él. Una pasada que intenta entrar por ese cono es rechazada: el ave recibe un impulso y pasa a `EVASIÓN`.

Cada 5–7 s el objetivo libera un pulso radial. Las aves dentro del radio reciben un empujón y entran en `EVASIÓN`; los líderes alcanzados son derribados. Antes del pulso, los líderes ordenan un repliegue preventivo y las aves que están atacando se retiran.

### Teoría de juegos

Cada ave evalúa 18 sectores. Su pago aproximado es:

```
pago(s) = -distribución · congestión(s)
          - defensa · riesgoEscudo(s)
          - 0.22 · costeDeDesplazamiento(s)
          + 0.55 · alineaciónConElFlancoDelEscuadrón(s)
          + inercia + ruido
```

Las actualizaciones se escalonan en el tiempo y usan un umbral de histéresis. El resultado es una distribución estable alrededor del objetivo que evita el escudo y la aglomeración, en lugar de que todas las aves ataquen por el mismo lado.

### FSM

```
DISTRIBUCIÓN ──► ESPERA ──► ATAQUE ──► RETIRADA
      ▲            │           │
      │            └───────────┴──► EVASIÓN
      └──────────────────────────────┘
```

- **Distribución**: viaja al punto de espera de su sector.
- **Espera**: aguarda una ventana corta y entra en ataque.
- **Ataque**: se lanza en línea recta al objetivo; puede impactar, ser bloqueado por el escudo o replegarse ante un pulso.
- **Retirada**: sale en curva y vuelve a elegir sector.
- **Evasión**: respuesta a un pulso, un bloqueo o un derribo.

Los contadores de cada estado se muestran en el panel.

### Cadena de mando

Con 4 escuadrones (`A`–`D`), el ave con el código más bajo de cada escuadrón es su líder. El comandante es el líder de escuadrón con el código más bajo.

Ejemplo de relevo:

```
A-001 derribada · A-002 asume el escuadrón A
B-001 toma el mando del enjambre
...
B-003 derribada · B-004 asume el escuadrón B
```

El siguiente código se calcula dentro del escuadrón; si no queda ningún código posterior activo, se cierra el círculo entre los códigos anteriores. Si todos los escuadrones quedan sin líder, el código activo más antiguo asume el mando global.

## Estructura

```
src/
├── App.vue                  Interfaz, HUD, cadena de mando y controles
├── composables/
│   └── useBoids.js          RAF, resize, clics y puente Vue ↔ simulación
└── lib/
    ├── flock3d.js           Boids, rejilla, FSM, juego, defensa y jerarquía
    └── birdScene.js         Three.js: instancing, shader, escudo, pulsos,
                             etiquetas y enlaces de mando
```

## Rendimiento y potencia de cómputo

Medido en el equipo de desarrollo (AMD Radeon 890M, Chrome, 1920×937) con el enjambre en asedio:

| Aves | FPS observados | Coste aproximado de simulación |
| ---: | ---: | ---: |
| 100 | ~60 | ~0,04 ms por paso |
| 1 000 | ~60 | ~1,2 ms por paso |
| 3 000 | ~60 | — |
| 5 000 | ~22 (asedio denso) | 20–60 ms por paso según la densidad |

La capa de mando añade muy poco: en una medición densa a 5000 aves, la simulación completa (FSM + juego + defensa + jerarquía) costó ~66 ms por paso frente a ~63 ms del Boids base, es decir, unos **3 ms (~5 %)**, y el cálculo de la estrategia de líderes es O(número de escuadrones) cada ~2,4 s.

Lo que realmente escala es el número de aves y su densidad: más aves implican más vecinas por ave en la rejilla y más píxeles que mezclar en pantalla. El renderizado y la búsqueda de vecinas dominan; los líderes y la FSM son baratos en comparación.

Para escalar más habría que limitar el número de vecinas por ave, usar LOD, bajar la frecuencia de decisiones, mover la simulación a un *worker* o a la GPU, o aceptar menos aves. Para 100–1000 aves la experiencia es fluida a 60 fps.

`window.__boids` está disponible solo en desarrollo para inspeccionar la simulación desde la consola.
