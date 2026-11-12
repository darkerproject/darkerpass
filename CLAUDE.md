# DarkerPass — Contexto del proyecto

Este archivo es el traspaso completo del proyecto DarkerPass a Claude Code. Léelo entero antes de tocar código. Está escrito para que una sesión nueva sepa qué existe, cómo está construido, qué decisiones ya se tomaron y qué falta.

Dueño del proyecto: Omar. Todo se conversa y se escribe en **español**.

---

## 1. Qué es DarkerPass

DarkerPass es una plataforma de venta de entradas para eventos en vivo en Lima, Perú (conciertos y fiestas de la escena independiente). Es una sub-marca de **Darker Project**.

- **Dominio oficial:** `darkerpass.com` (ya es de Omar). Todavía **no** está conectado a nada.
- **Repo:** `darkerproject/darkerpass` en GitHub, cuenta **darkerproject**.
- **Hosting:** Vercel, **todavía no configurado**. Ver la sección 1.1 para el orden de publicación.
- **Stack:** HTML estático + CSS + JavaScript vanilla, sin framework ni build. Cada página es un solo `.html` con su `<style>` y `<script>` adentro.
- **Backend:** Google Sheets como base de datos + Google Apps Script como API (publicado como Web App). No hay servidor propio.
- **Sitio hermano:** la web de Darker Project vive en **otro repo** (es la landing de Darker Project, con una escena 3D en Three.js). Este repo es solo DarkerPass. **No asumas su dominio:** pregúntale a Omar a dónde debe apuntar el enlace "Darker Project" del menú.

### 1.1 Orden de publicación

Omar va a publicar en este orden, y el código tiene que funcionar en cada etapa:

1. **Armar la página en GitHub**, en este repo.
2. **Importar el repo en Vercel y publicarlo.** Vercel le da una URL provisional del tipo `darkerpass-xxxx.vercel.app`, que sirve para revisar cómo luce.
3. **Recién después, conectar el dominio oficial `darkerpass.com`** en Vercel (Settings → Domains, más la configuración de DNS donde está registrado el dominio).

Consecuencias para el código:
- Todos los enlaces internos deben ser **relativos** (`index.html`, `busqueda.html`, `comprar.html?evento=…`), para que funcionen igual en la URL provisional de Vercel y en `darkerpass.com`.
- **No escribas `darkerpass.com` fijo** en ningún enlace interno.
- La home tiene que llamarse `index.html` y estar en la raíz del repo, para que Vercel la sirva en `/`.
- Vercel publica la rama `main`. Lo que quede en otras ramas no se ve hasta hacer merge.

La plataforma tiene dos lados:
1. **Público (compradores):** ver eventos, buscar y comprar entradas. Las 3 páginas de este repo.
2. **Organizadores (productores):** iniciar sesión, ver sus eventos y crear eventos nuevos. **Todavía no existe.** Es el siguiente bloque de trabajo.

---

## 2. Estado actual de los archivos

| Archivo | Qué es | Estado |
|---|---|---|
| `darkerpass.html` | Home pública | Diseño terminado. Datos de ejemplo fijos en el HTML. **Debe renombrarse a `index.html`** (ver sección 7). |
| `busqueda.html` | Resultados de búsqueda | Diseño terminado. Resultados de ejemplo fijos. |
| `comprar.html` | Compra de entrada en pasos | Diseño terminado para 4 pasos. Falta el paso condicional de artista y la conexión a datos. |

Ninguna de las tres está conectada todavía a Google Sheets. Todo lo que muestran (flyers, precios, número de Yape, resultados) es contenido de ejemplo.

### 2.1 Sistema visual compartido

- **Azul de marca:** `#0057FF` (hover `#3375FF`, presionado `#0048d6`).
- **Header** (idéntico en las 3 páginas): barra azul fija de 64px, logo PNG embebido en base64 a la izquierda (enlaza a la home), botón hamburguesa a la derecha.
  - **Desktop:** la hamburguesa abre `#nav-overlay`, una fila de enlaces blancos a la izquierda de la hamburguesa: Home, Artistas, Organizadores, Darker Project.
  - **Móvil (≤768px):** la hamburguesa abre `#mc`, un carrusel centrado en el header con flechas y swipe que muestra un enlace a la vez. Los enlaces están en el array `ITEMS` del script.
  - No hay modo oscuro.
- **Footer** (en home y búsqueda): fondo `#0a0a0a`, íconos sociales (Instagram, YouTube, X, Spotify, WhatsApp), enlaces de texto y copyright "© 2026 Darker Project".
- **Botones:** forma de pill (`border-radius: 999px`), azul con texto blanco.
- **Tipografía:** Helvetica Neue en home y búsqueda. En `comprar.html` se usa el stack de sistema de Apple (`-apple-system, "SF Pro Display", … "Helvetica Neue"`).
- **Estilo general:** minimalista, limpio, mucho aire. Omar compara la página de compra con el estilo de Apple.

### 2.2 `darkerpass.html` (home)

- **Hero:** imagen JPEG embebida en base64, altura `calc(50vh + 32px)` (mín. 320px; 280px en móvil). Ocupa justo la mitad del área visible bajo el header al abrir la página. Esto fue intencional: la gente debe ver eventos sin hacer scroll.
- **Texto del hero:** "Tu siguiente experiencia / está aquí.", alineado a la derecha (`bottom: 102px; right: 48px`; en móvil `76px / 20px`).
- **`#hero-pill`:** buscador fijo dentro del banner, debajo del texto. Es casi transparente (`rgba(255,255,255,0.08)` con `backdrop-filter: blur(20px)`) y solo tiene el input "Busca un evento o artista" y el botón de lupa. Posición `bottom: 38px; right: 48px`, ancho `clamp(280px, 32vw, 420px)`. En móvil ocupa todo el ancho con 20px de margen.
- **`#pill`:** un segundo buscador flotante que aparece cuando el hero sale de la pantalla al hacer scroll. Este sí lleva la etiqueta "DarkerPass".
- **Ninguno de los dos buscadores está conectado.** Deben llevar a `busqueda.html?q=<texto>` al presionar la lupa o Enter.
- **Secciones:**
  - "Próximos Eventos": carrusel horizontal de `.reciente-card` (460px de ancho: flyer a la izquierda en 3:4, info a la derecha con título, fecha, distrito, ciudad y botón "Entradas").
  - "Kids in the Dark": carrusel de flyers (`images/kitd/desktop/flyer-01…17.webp`).
  - "Otros Eventos": carrusel de flyers (`images/otros/desktop/evento-01…07.webp`).
  - Cada sección tiene un enlace "Ver todos" (hoy en `#`). Los carruseles se arrastran con el mouse en desktop.
- Los botones "Entradas" están en `#`.

### 2.3 `busqueda.html`

- **Desktop:** grid de dos columnas (`1fr 380px`).
  - **Izquierda, card 1 "Buscar eventos":** pill de búsqueda blanco y dos dropdowns tipo pill: "Filtros" (esta semana, este mes, distritos, gratis) y "Ordenar por" (relevancia, recientes, próximos, precio).
  - **Izquierda, card 2 "Resultados de búsqueda":** contador ("6 eventos encontrados") y grid `repeat(auto-fill, minmax(180px, 1fr))` de cards compactas (flyer 3:4 arriba, título, fecha, lugar, botón "Entradas").
  - **Derecha, `.busqueda-sidebar`:** columna de anuncios. Hoy tiene uno, `.org-ad` ("Para organizadores", degradado azul, botón "Empezar ahora"). **No es sticky a propósito:** a futuro habrá varios anuncios apilados y deben hacer scroll junto con el contenido.
- **Móvil:** todo en una columna, resultados en 2 columnas, el sidebar baja al final.
- El input trae `value="indie"` de ejemplo. Los resultados, filtros y orden no funcionan aún.

### 2.4 `comprar.html`

**Layout desktop:**
- La página **no hace scroll** (`body { overflow: hidden }`). Todo pasa dentro de las cards.
- Enlace "Volver" en la esquina superior izquierda, bajo el header (`position: absolute; top: 82px; left: 44px`). Lleva a la página anterior (hoy fijo a `busqueda.html`).
- Título "Reserva tu entrada" y subtítulo, alineados con el borde izquierdo del card del flyer.
- Dos cards de la misma altura, `--card-h: clamp(440px, calc(100vh - 340px), 580px)`:
  - **Card del flyer:** siempre en **4:5**. Su altura es `--card-h` y el ancho sale de la proporción. Se queda fijo durante todos los pasos.
  - **Card de pasos:** máximo 560px de ancho.
- Todo el bloque está centrado y subido con `margin-top: -80px` en `.content`. El "Volver" no se mueve.

**Layout móvil (≤880px):** sí hay scroll. El flyer va arriba a todo el ancho (sigue en 4:5) y el card de pasos debajo.

**Card de pasos:**
- Arriba: "Paso X de 4" y segmentos de progreso.
- Esquina superior derecha: botón "Atrás", visible solo en los pasos donde tiene sentido. No va al lado del botón "Siguiente".
- Los campos y el botón "Siguiente" ocupan todo el ancho del card.

**Pasos actuales:**
1. **Tus datos:** nombre completo, DNI (8 dígitos), tipo de entrada (select), correo. Con validación.
2. **Realiza tu pago:** texto explicativo, bloque con el número de Yape/Plin (con botón "Copiar") y el titular, número de operación (obligatorio) y captura de pago (opcional).
3. **Términos y condiciones:** texto con scroll interno, con degradado arriba y abajo, y botón "Acepto y continúo". Hoy es texto de relleno; Omar pasará el texto real (es el mismo para todos los eventos).
4. **Confirmación:** check, "¡Registro recibido!", mensaje de que se verificará el pago y la entrada llegará al correo registrado (muestra el correo del paso 1), y botón pill "Salir" que lleva a la home.

Placeholders que serán dinámicos: el flyer, los tipos de entrada con precios, el número de Yape/Plin y el titular.

---

## 3. El sistema que ya existe en Google (no lo rompas)

Omar ya tiene un sistema completo funcionando en Google Sheets + Apps Script. Hoy los compradores llegan por Google Forms y por un bot de WhatsApp. La web debe **conectarse a ese sistema, no reemplazarlo**.

### 3.1 Los Sheets

**DARKERPASS MOTHER** — ID `1lpF9uKTgK24FtA0L3TTMV_9tbPhLVMfGl0YD4P-RDwk`. Es el Sheet principal. Pestañas:
- `EVENTOS_CONFIG`: una fila por evento. Es la **fuente de verdad**: todo el sistema (apps, correos, verificaciones, clones) lee de aquí.
- `BANDAS_CONFIG`: las bandas de cada evento y cómo se les paga.
- `CLONES_MAP`: qué Sheet clon corresponde a cada evento.
- **Una pestaña por evento**, nombrada igual que el evento (ej. `KIDS IN THE DARK FEBRERO`). Ahí caen los registros de compra.

**DARKERPASS CMS** — ID `1dnjmpwindgfKDb_8f1EluUtwuGX3sRHBjQRo9U_6mGk`. Pestaña `EVENTOS_CMS`. Es donde se crean y editan eventos. Fila 1 = título, fila 2 = encabezados, fila 3 = ejemplos, los datos empiezan en la **fila 4**.

**Sheets clon:** uno por evento, en otra carpeta de Drive. Son una copia en tiempo real de la pestaña del evento, para compartir con bandas y productores sin darles acceso al Mother.

**Carpeta de Drive `DARKERPASS FLYERS`:** aquí se suben los flyers. Su URL pública va en la columna IMAGEN.

### 3.2 Columnas de `EVENTOS_CMS` (y de `EVENTOS_CONFIG`)

Las dos tienen las mismas columnas en el mismo orden. Los nombres cambian un poco entre una y otra:

| Col | `EVENTOS_CMS` | `EVENTOS_CONFIG` | Contenido |
|---|---|---|---|
| A | NOMBRE DE EVENTO / HOJA | HOJA | Nombre del evento = nombre de su pestaña |
| B | LUGAR | LUGAR | Ej. "Feria Bar (Sánchez Carrión 110, Barranco)" |
| C | FECHA | FECHA | |
| D | HORA | HORA | |
| E | EMAILS PARA INVITACIÓN AL SHEET | EMAILS | Correos separados por coma a los que se comparte el clon |
| F | PRECIO BASE | PRECIO BASE | Soles |
| G | PRECIO BEBIDA | PRECIO + BEBIDA | Vacío si no aplica |
| H | PRECIO PREVENTA | PRECIO PREVENTA | Vacío si no aplica |
| I | IMAGEN | IMAGEN | URL del flyer en Drive |
| J | BANDAS | BANDAS | Nombres separados por coma |
| K | ACTIVO | ACTIVO | El ejemplo del CMS dice TRUE/FALSE, pero los datos reales usan SI/NO. Acepta ambos. |
| L | NUEVA FECHA (EN CASO DE POSPONER) | igual | |
| M | `SELECCION_ARTISTA` | `SELECCION_ARTISTA` | **Nueva.** SI/NO. Omar la agrega a mano en ambos Sheets. |

**Cómo funciona hoy el CMS:**
- Al escribir el nombre del evento en la columna A, Apps Script **crea automáticamente la pestaña del evento** en el Mother, con la plantilla de registros.
- Al llenar las demás columnas, los datos se copian a `EVENTOS_CONFIG`.
- **Pendiente:** la columna M también tiene que copiarse a `EVENTOS_CONFIG` con lo demás. Para eso hay que editar el Apps Script existente. Pide a Omar su `Code.gs` antes de tocarlo.

### 3.3 Columnas de cada pestaña de evento (registros de compra)

| Col | Campo | Quién lo llena |
|---|---|---|
| A | TIMESTAMP | **Web** (o Apps Script al recibir) |
| B | NOMBRE | **Web** |
| C | TIPO_ENTRADA | **Web** |
| D | DNI | **Web** |
| E | CORREO | **Web** |
| F | ARTISTA | **Web**. Vacío si el evento no pide elegir artista. |
| G | PAGO | **Web** (número de operación) |
| H | ACEPTO_TERMINOS | **Web** |
| I | CODIGO_QR | Sistema existente |
| J | LINK_QR | Sistema existente |
| K | ESTADO | Sistema existente. Vacío hasta el día del evento; al escanear el QR pasa a "USADO". |
| L | CORREO_RECIBIDO | Sistema existente |
| M | FECHA_ENVIO | Sistema existente |

**La web solo escribe A–H.** De la I en adelante lo maneja el Apps Script que ya existe. La columna F se mantiene en todos los eventos aunque quede vacía: nunca se reordenan columnas por evento.

### 3.4 `BANDAS_CONFIG`

Bloques de 3 columnas por evento, uno al lado del otro (A–C, D–F, G–I…). Cada bloque tiene:
- Encabezado: el nombre del evento.
- Filas: nombre de la banda | Pago (`Porcentual` o `Fijo`, con dropdown) | `S/ / %` (el valor).

Sirve para el reparto de dinero. Algunas bandas cobran un porcentaje de las entradas vendidas a su nombre, y por eso existe la columna ARTISTA en los registros.

### 3.5 El resto del sistema existente

- **Flujo de aprobación:** llega un registro → Apps Script avisa a Omar por correo → Omar aprueba en la app **AprobarCompras** → al cliente le llega su ticket con QR por correo.
- **staff_app:** escanea los QR en la puerta del evento y marca ESTADO = USADO.
- **Canal WhatsApp:** un bot llamado **Noir** (n8n + Claude Haiku) toma los datos por chat y los guarda en la pestaña del evento.
- En una conversación anterior se planteó que el canal web podría mandar sus datos a un webhook de n8n, para converger en el mismo nodo "Guardar Registro" que usa WhatsApp. La alternativa es un `doPost` en Apps Script. **Está por decidir** (ver sección 8).

### 3.6 Reglas críticas del sistema

- **El QR codifica el nombre de la pestaña del evento.** Si se renombra una pestaña con tickets ya emitidos, esos QR dejan de funcionar. Nunca renombrar pestañas.
- **Cada cambio en `Code.gs` necesita un nuevo Deploy** en Apps Script para llegar a las apps publicadas.
- El logo del ticket está fijo en `Code.gs` (`DRIVE_LOGO_EVENTO_ID`).
- `EVENTOS_CONFIG` manda. Si algo está mal ahí, sale mal en todo el sistema.

---

## 4. Reglas de negocio para la web

### 4.1 Selección de artista (paso condicional en la compra)

El organizador decide al crear el evento si la audiencia elige por qué artista viene. Si `SELECCION_ARTISTA = SI`, la compra pasa de 4 a 5 pasos:

1. Datos (nombre, DNI, tipo de entrada, correo)
2. **Elegir artista**
3. Pago
4. Términos
5. Listo

Si es NO, el paso 2 se salta, el flujo queda en 4 pasos y la columna F va vacía.

El contador "Paso X de N", los segmentos de progreso y la navegación adelante/atrás tienen que calcularse según el número de pasos del evento.

Hay **tres modos** que el organizador puede elegir:
1. Sin selección de bandas.
2. Con selección, eligiendo una sola banda.
3. Con selección, y una opción extra al final de la lista: "Voy por todas las bandas".

Nunca se eligen varias bandas a la vez. **Pendiente:** la columna M solo dice SI/NO, así que hace falta definir cómo se distingue el modo 2 del 3 (ver sección 8).

La lista de bandas sale de la columna J (`BANDAS`, separada por comas).

### 4.2 Tipos de entrada y precios

Salen de las columnas F, G y H del evento: precio base, precio con bebida y precio de preventa. Si G o H están vacías, esa opción no se muestra. El texto exacto que se guarda en `TIPO_ENTRADA` está por definir con Omar.

### 4.3 Datos de pago

El número de Yape/Plin y el nombre del titular son **por evento** y vienen del Sheet. La columna exacta todavía no existe en `EVENTOS_CONFIG` (ver sección 8).

---

## 5. Arquitectura planeada

**Una sola página por tipo, con datos según la URL.** No se crea una página por evento.

- `comprar.html?evento=<id>` carga el flyer, los precios, las bandas, el modo de artista y los datos de pago de ese evento.
- `busqueda.html?q=<texto>` muestra los eventos que coinciden.
- La home lista los eventos con `ACTIVO = SI/TRUE`.

**Identificador del evento:** lo más directo es usar el nombre de la pestaña (`HOJA`) con `encodeURIComponent`, porque es la clave que ya usa todo el sistema. Confírmalo con Omar antes de implementarlo.

**API en Apps Script (Web App).** Endpoints propuestos:
- `GET ?action=eventos` → lista de eventos activos.
- `GET ?action=evento&id=<HOJA>` → datos de un evento.
- `GET ?action=buscar&q=<texto>` → eventos que coinciden.
- `POST` con un registro → agrega una fila A–H a la pestaña del evento.

**Notas técnicas para Apps Script:**
- Responder JSON con `ContentService.createTextOutput(JSON.stringify(...)).setMimeType(ContentService.MimeType.JSON)`.
- Hacer el `fetch` POST con `Content-Type: text/plain` (cuerpo en JSON como texto) para evitar el preflight de CORS, que Apps Script no maneja.
- Usar `LockService` al escribir filas para que dos compras simultáneas no choquen.

**Flujo completo:**
```
Organizador crea evento (plataforma web)
   → DARKERPASS CMS (fila nueva)
   → Apps Script crea la pestaña del evento + copia a EVENTOS_CONFIG
   → el evento aparece en la home y tiene su comprar.html?evento=…
Comprador: home / búsqueda → comprar.html?evento=…
   → POST registro → fila A–H en la pestaña del evento
   → el sistema existente genera QR, avisa a Omar, Omar aprueba, sale el ticket
```

---

## 6. Plataforma de organizadores (siguiente bloque grande)

**Por qué va antes de conectar la compra:** la página de compra solo funciona para eventos que existen, y la pestaña de registros de un evento se crea cuando el evento se crea. Por eso Omar decidió construir primero la plataforma de creación.

**Pantallas:**
1. **Login.**
2. **Dashboard:** la lista de eventos de ese organizador (nombre, fecha, activo o no) y un botón "+ Crear evento".
3. **Crear evento:** formulario con los mismos campos del CMS (sección 3.2), el flyer subido como archivo (se guarda en Drive, carpeta `DARKERPASS FLYERS`, y su URL va a la columna I), las bandas, y la pregunta "¿Deseas que la audiencia seleccione por cuál artista viene?" (→ columna M).
4. **Editar evento:** el mismo formulario con los datos ya cargados. Puede venir después.

**Primera versión:** solo visual, con datos de ejemplo, y los puntos de conexión marcados con comentarios. El backend se conecta después.

**Lo que la plataforma envía va al CMS, no directo a `EVENTOS_CONFIG`.** El CMS ya sabe crear la pestaña y copiar los datos.

Se enlaza desde "Organizadores" en el menú y desde "Empezar ahora" en el anuncio de `busqueda.html`.

---

## 7. Tareas para dejar el repo listo en Vercel

1. **Renombrar** `darkerpass.html` → `index.html`. Actualizar todos los enlaces a `darkerpass.html` en las 3 páginas: el "Home" de `#nav-overlay`, el array `ITEMS` del carrusel móvil y el botón "Salir" de `comprar.html`.
2. **Enlace "Darker Project" del menú:** hoy apunta a `index.html`, que después del renombre sería la home de DarkerPass, así que hay que cambiarlo. **No lo apuntes a ningún dominio sin confirmar con Omar** a dónde debe llevar. Mientras no lo confirme, déjalo en `#`. Está en `#nav-overlay` y en el array `ITEMS`, en las 3 páginas.
3. **Logo:** su `href="index.html"` ya queda bien después del renombre.
4. **Botones "Entradas"** (home y búsqueda): apuntarlos a `comprar.html` por ahora. Más adelante, a `comprar.html?evento=…`.
5. **Buscadores** de la home (`#hero-pill` y `#pill`) y de búsqueda: al presionar la lupa o Enter, ir a `busqueda.html?q=<texto>`.
6. **Imágenes de eventos: NO se suben al repo.** Los HTML apuntan a `images/kitd/desktop/…` e `images/otros/desktop/…`, pero esa carpeta no existe en el repo y así se queda. Esos flyers son de ejemplo: cuando se conecte el Sheet, cada flyer vendrá de la columna IMAGEN (URL de Drive que sube el productor). Hasta entonces, esas imágenes salen rotas y está aceptado. Si Omar lo pide, se puede poner un fondo neutro como placeholder en lugar del ícono de imagen rota.
7. **La foto del banner (hero) se queda embebida en base64 dentro de `index.html`.** Es decisión de Omar por ahora: no tiene el archivo a mano para subirlo aparte. No la extraigas a un archivo. Lo mismo con el logo (PNG base64 repetido en las 3 páginas): se queda como está.
8. **Opcional, más adelante:** mover el header, el menú y el footer a un CSS/JS compartido, porque hoy están triplicados en las 3 páginas.
9. **Antes del lanzamiento oficial:** Vercel publica todos los archivos del repo, así que hoy `CLAUDE.md` se puede abrir en `/CLAUDE.md`. No tiene contraseñas ni claves, pero sí detalles internos (IDs de Sheets, cómo funciona el sistema). La solución propuesta es mover los archivos del sitio a una carpeta (ej. `site/`) y configurar esa carpeta como **Root Directory** en Vercel, dejando `CLAUDE.md` fuera. Proponlo y confírmalo con Omar antes de hacerlo, porque cambia la configuración de Vercel.

**Estructura del repo:**
```
/
├── index.html      (antes darkerpass.html; banner y logo embebidos)
├── busqueda.html
├── comprar.html
└── CLAUDE.md
```

**Páginas enlazadas que aún no existen:**
- `artistas.html` (menú).
- Plataforma de organizadores (menú "Organizadores" y botón "Empezar ahora").
- Footer: Contacto, Preguntas frecuentes, Trabaja con nosotros, Política de privacidad, Términos de uso. Las dos últimas importan antes del lanzamiento real, porque la web cobra y pide DNI y correo.
- El enlace de WhatsApp del footer de la home es un placeholder (`https://wa.me/51XXXXXXXXX`).
- Los "Ver todos" de la home están en `#`.

---

## 8. Decisiones pendientes (pregúntale a Omar)

1. **Tipo de login de organizadores:** login con Google (recomendado: es nativo con Apps Script y todo el sistema ya vive en Google) o usuario y contraseña propios.
2. **Registro de organizadores:** ¿cualquiera se registra, o Omar los aprueba o invita?
3. **Cómo se sabe qué eventos son de qué organizador** para el dashboard. ¿Se usa la columna E (EMAILS) o se agrega una columna nueva tipo `PRODUCTOR_EMAIL`?
4. **Modo "Voy por todas las bandas":** la columna M solo dice SI/NO. ¿Otro valor en M (ej. `SI_TODAS`) o una columna aparte? ¿Qué texto exacto se guarda en ARTISTA en ese caso?
5. **Datos de pago por evento:** en qué columnas viven el número de Yape/Plin y el titular.
6. **Captura de pago (opcional) en la compra:** la plantilla de registros no tiene columna para ella. ¿Se descarta o se agrega una columna con el link en Drive?
7. **Texto exacto de `TIPO_ENTRADA`** para cada precio.
8. **Ruta de los registros web:** `doPost` de Apps Script o el webhook de n8n compartido con el bot de WhatsApp.
9. **Bandas en la plataforma:** ¿el organizador también define desde la web el tipo de pago de cada banda (fijo o porcentual, y el valor) para `BANDAS_CONFIG`, o eso lo sigue llenando Omar a mano?
10. **Identificador de evento en la URL:** nombre de la pestaña o un slug aparte.
11. **Destino del enlace "Darker Project" del menú:** a qué dirección debe llevar.

---

## 9. Herramienta de imágenes (fuera del repo)

Omar optimiza las imágenes con un script propio en `~/image-optimizer/` en su MacBook (Node.js + `sharp`):
- Fotos originales en `originals/<categoría>/`.
- Se corre con `node optimize.js`.
- Genera WebP en `images/<categoría>/<tamaño>/`: `mobile` (750px, calidad 75), `desktop` (1440px, calidad 90, con `sharpen` sigma 0.5) y `full` (1920px, calidad 80).
Por ahora este repo **no usa** imágenes de esta herramienta: el banner está embebido en el HTML y los flyers de eventos vendrán de Google Drive (subidos por los organizadores), no del repo.

---

## 10. Cómo trabajar con Omar

- Escribe y responde en **español**.
- Antes de un cambio grande, resume lo que entendiste y espera su confirmación. Él suele cerrar sus pedidos con "dime si entiendes o tienes dudas".
- Es muy preciso con lo visual: posiciones, tamaños, alineaciones, proporciones. Cuando pide "un poco más", ajusta en pasos pequeños y dile el valor exacto que cambiaste.
- Respeta al pie de la letra las proporciones que fija (ej. el flyer **siempre** 4:5). Si una restricción técnica choca con lo que pide, explícaselo antes de improvisar.
- Prefiere lo minimalista y funcional por encima de lo decorativo.
- No toques el Apps Script existente sin ver antes su `Code.gs`. Todo el sistema de QR, correos y aprobación depende de él.
