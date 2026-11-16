# Instalar el backend de DarkerPass

Son dos partes: un cambio pequeño en tu `Code.gs` de siempre (para que el ticket salga con el mismo código de hoy) y un proyecto nuevo de Apps Script con la API. Hazlas en este orden. Todo se prueba con las credenciales de **prueba** de Mercado Pago: no se cobra dinero real.

Ningún secreto va en este repo ni en un chat. Los tres secretos se escriben directo en **Propiedades del script**.

---

## Parte A. Cambio en tu `Code.gs` existente

Antes de tocar nada, haz una copia de seguridad: en el editor, abre `Code.gs`, selecciona todo, copia y guárdalo en un archivo de texto.

### A1. Reemplazar `ap_aprobarRegistro`

Busca el bloque que empieza con el comentario `/* ---------- APROBAR Y ENVIAR TICKET ---------- */` y termina justo antes de `/* ---------- RECHAZAR REGISTRO ---------- */`. Borra ese bloque completo (el comentario y toda la función `ap_aprobarRegistro`) y pega esto en su lugar:

```javascript
/* ---------- APROBAR Y ENVIAR TICKET ---------- */

// La usa la app AprobarCompras. Hace lo mismo que antes: valida la sesión y emite el ticket.
function ap_aprobarRegistro(token, eventoNombre, numeroFila) {
  if (!ap_validarSesion(token)) {
    return { success: false, error: 'sesion_invalida', message: 'Sesión expirada' };
  }
  return emitirTicket_(eventoNombre, numeroFila);
}

// Genera el QR y el PDF, envía el correo y marca la fila como enviada.
// La usan AprobarCompras (arriba) y las compras web con Mercado Pago (doPost, abajo).
function emitirTicket_(eventoNombre, numeroFila) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(eventoNombre);
    if (!hoja) {
      return { success: false, message: 'Evento no encontrado' };
    }

    const fila = hoja.getRange(numeroFila, 1, 1, hoja.getLastColumn()).getValues()[0];

    // Verificar si ya fue aprobado
    const correoEnviado = (fila[COL_APROBAR.CORREO_ENVIADO] || '').toString().trim();
    if (correoEnviado === 'Sí' || correoEnviado === 'Si') {
      return { success: false, message: 'Este registro ya fue aprobado.' };
    }

    const nombre = fila[COL_APROBAR.NOMBRE];
    const tipoEntrada = fila[COL_APROBAR.TIPO_ENTRADA];
    const dni = fila[COL_APROBAR.DNI];
    const correo = fila[COL_APROBAR.CORREO];

    if (!correo || !correo.toString().includes('@')) {
      return { success: false, message: 'Correo electrónico no válido.' };
    }

    // Obtener config del evento
    const cfg = getEventoConfig_(eventoNombre) || {};
    const EVENTO_TITULO = eventoNombre;
    const EVENTO_LUGAR = cfg.lugar || "Lugar del evento";
    const EVENTO_FECHA = cfg.fecha || FECHA_DEL_EVENTO;
    const EVENTO_HORA = cfg.hora || "8:00 p.m.";

    // Generar QR
    const qrData = WEB_APP_URL
      + "?nombre=" + encodeURIComponent(nombre)
      + "&dni=" + encodeURIComponent(dni)
      + "&tipoEntrada=" + encodeURIComponent(tipoEntrada)
      + "&eventoTitulo=" + encodeURIComponent(EVENTO_TITULO);

    const qrUrlSheet = "https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=" + encodeURIComponent(qrData);
    const qrUrlLink = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" + encodeURIComponent(qrData);
    const qrUrlEmail = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent(qrData);

    const imagenQR = UrlFetchApp.fetch(qrUrlEmail).getBlob().setName('qr.png');

    // Generar PDF
    const logoEventoData = driveFileToDataUrl_(DRIVE_LOGO_EVENTO_ID_PDF);
    const logoMarcaData = driveFileToDataUrl_(DRIVE_LOGO_MARCA_ID);
    const qrEmailDataUrl = 'data:image/png;base64,' + Utilities.base64Encode(imagenQR.getBytes());

    const ticketHtmlPure = buildTicketHtmlPure_(
      nombre, dni, tipoEntrada,
      EVENTO_TITULO, EVENTO_LUGAR, EVENTO_FECHA, EVENTO_HORA,
      logoEventoData, logoMarcaData, qrEmailDataUrl
    );

    const subfolder = getOrCreateTicketsSubfolder_(EVENTO_TITULO);
    const pdf = crearTicketPDFEn_(ticketHtmlPure, 'Ticket_' + dni, subfolder.getId());

    // Preparar imágenes para el correo
    const logoEventoBlobEmail = DriveApp.getFileById(DRIVE_LOGO_EVENTO_ID).getBlob().setName('logoEvento.png');
    const logoMarcaBlobEmail = DriveApp.getFileById(DRIVE_LOGO_MARCA_ID).getBlob().setName('logoMarca.png');

    // HTML del correo
    // (Se quitó el enlace "Descargar imagen (PNG)": abría el verificador de QR y podía marcar la entrada como usada.)
    const html =
      '<div style="width:600px;max-width:100%;font-family:Arial,Helvetica,sans-serif;color:#111;margin:0 auto;">' +
        '<p>Hola ' + nombre + '!</p>' +
        '<p>Tu pago ha sido confirmado! Gracias por tu compra para <strong>' + EVENTO_TITULO + '</strong>.</p>' +
        '<p>Aquí te entregamos tu entrada para el evento.</p>' +
        buildEmailTicketHtmlCID_(nombre, dni, tipoEntrada, EVENTO_TITULO, EVENTO_LUGAR, EVENTO_FECHA, EVENTO_HORA) +
        '<p style="margin-top:16px;">' +
          '<a href="' + pdf.fileUrl + '">Descargar ticket en PDF</a>' +
        '</p>' +
        '<p>¡Nos vemos ahí! 🎸</p>' +
        '<p>El equipo de <em>Darker Project</em></p>' +
      '</div>';

    // Enviar correo
    MailApp.sendEmail({
      to: correo,
      subject: "🎟️ Tu ticket para " + EVENTO_TITULO,
      htmlBody: html,
      inlineImages: {
        "codigoQR": imagenQR,
        "logoEvento": logoEventoBlobEmail,
        "logoMarca": logoMarcaBlobEmail
      },
      attachments: [pdf.pdfBlob]
    });

    // Actualizar Sheet
    const fechaHora = new Date();
    hoja.getRange(numeroFila, COL_APROBAR.CORREO_ENVIADO + 1).setValue("Sí");
    hoja.getRange(numeroFila, COL_APROBAR.FECHA_ENVIO + 1).setValue(fechaHora);
    hoja.getRange(numeroFila, COL_APROBAR.QR_IMG + 1).setFormula('=IMAGE("' + qrUrlSheet + '", 1)');
    hoja.getRange(numeroFila, COL_APROBAR.QR_LINK + 1).setValue(qrUrlLink);
    hoja.setRowHeight(numeroFila, 60);

    // Sincronizar clon
    try {
      syncTabToCloneSAFE(eventoNombre);
    } catch (err) {
      Logger.log('emitirTicket_ sync error: ' + err);
    }

    return { success: true, message: '✅ Ticket enviado a ' + correo };

  } catch (error) {
    Logger.log('emitirTicket_ error: ' + error);
    return { success: false, message: 'Error: ' + error.toString() };
  }
}

/* ---------- COMPRAS WEB: el backend nuevo pide aquí el ticket de una fila ya pagada ---------- */

// Solo acepta pedidos que traen la clave secreta (propiedad del script CLAVE_TICKETS).
// No toca doGet: las apps de staff, namesearch, aprobar y el QR público siguen igual.
function doPost(e) {
  var salida = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  };
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var clave = PropertiesService.getScriptProperties().getProperty('CLAVE_TICKETS');
    if (!clave || d.clave !== clave) return salida({ ok: false, error: 'no_autorizado' });
    if (d.accion !== 'emitir') return salida({ ok: false, error: 'accion_desconocida' });

    var lock = LockService.getScriptLock();   // un pedido a la vez: evita enviar dos correos por la misma fila
    lock.waitLock(30000);
    try {
      var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(d.evento);
      var fila = Number(d.fila);
      if (!hoja || !fila || fila < 2) return salida({ ok: false, error: 'fila_no_encontrada' });
      // La fila debe ser la de ese comprador
      if (String(hoja.getRange(fila, 4).getDisplayValue()).trim() !== String(d.dni || '').trim()) {
        return salida({ ok: false, error: 'fila_no_coincide' });
      }
      var enviado = String(hoja.getRange(fila, 12).getValue()).trim();
      if (enviado === 'Sí' || enviado === 'Si') return salida({ ok: true, ya_enviado: true });

      var r = emitirTicket_(d.evento, fila);
      return salida({ ok: r.success === true, mensaje: r.message });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('doPost error: ' + err);
    return salida({ ok: false, error: 'error_interno' });
  }
}
```

Qué cambia respecto a hoy:

- `ap_aprobarRegistro` hace exactamente lo mismo, pero el trabajo vive en `emitirTicket_`.
- El correo ya no trae el enlace "Descargar imagen (PNG)". El PDF adjunto y su enlace siguen igual.
- Hay un `doPost` nuevo. `doGet` no se toca.

### A2. Crear la clave compartida

1. Inventa una clave larga, de 30 caracteres o más, con letras y números al azar. No la uses en ningún otro lado.
2. En el editor de Apps Script: engranaje **Configuración del proyecto** → **Propiedades del script** → **Agregar propiedad**.
   - Propiedad: `CLAVE_TICKETS`
   - Valor: tu clave
3. Guárdala un momento: la vas a pegar otra vez en el proyecto nuevo (paso B3).

### A3. Publicar la versión nueva

Tu `Code.gs` tiene **dos** implementaciones publicadas, y hay que actualizar las dos:

- La del QR y la app de staff: la URL que está en la constante `WEB_APP_URL` (empieza con `…/s/AKfycbzzcQhf8…`).
- La de AprobarCompras: la URL del correo "Nueva compra pendiente" (empieza con `…/s/AKfycbwYjK8CRs…`).

Para cada una: **Implementar** → **Administrar implementaciones** → lápiz de editar → en **Versión** elige **Nueva versión** → **Implementar**. Así la URL no cambia y los QR ya emitidos siguen funcionando.

Google te va a pedir autorizar permisos nuevos; acepta.

### A4. Comprobar que no se rompió nada

Abre AprobarCompras y aprueba un registro de prueba en un evento de prueba. Debe llegar el correo con el ticket, igual que siempre y sin el enlace PNG.

---

## Parte B. Proyecto nuevo: DarkerPass API

### B1. Crear el proyecto

1. Entra a `https://script.google.com` con la cuenta `darkerproject.pe@gmail.com` → **Nuevo proyecto**.
2. Ponle de nombre **DarkerPass API**.
3. Borra lo que trae `Código.gs` y pega el contenido completo de `backend/api/Codigo.gs` de este repo.
4. Guarda.

### B2. Probar que lee los eventos

En la barra superior elige la función `PROBAR_EVENTOS` → **Ejecutar**. Autoriza los permisos. En el registro de ejecución deben salir tus eventos activos, con sus precios.

Si sale `[]`, revisa que el evento tenga `SI` en la columna ACTIVO y una fecha de hoy en adelante.

### B3. Guardar los secretos

**Configuración del proyecto** → **Propiedades del script**. Agrega las tres:

| Propiedad | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | El Access Token de **prueba** de Mercado Pago |
| `CLAVE_TICKETS` | La misma clave del paso A2 |
| `TICKETS_URL` | La URL completa de `WEB_APP_URL` de tu `Code.gs` (termina en `/exec`) |

### B4. Probar una compra completa, sin la web

1. Crea un evento de prueba en tu CMS (por ejemplo `PRUEBA WEB`), activo y con fecha futura.
2. En `Codigo.gs`, dentro de `PROBAR_COMPRA_YAPE`, cambia `EVENTO` por el nombre exacto de esa pestaña y `CORREO` por un correo tuyo.
3. Ejecuta `PROBAR_COMPRA_YAPE`.

Debe pasar esto: el registro dice `"estado":"aprobado"`, aparece una fila nueva en la pestaña del evento con el ID de la orden en la columna G, y te llega el correo con el ticket. No se cobra nada: es el celular de prueba de Mercado Pago.

Para ver un rechazo, cambia `CELULAR` a `111111113` (sin saldo): no debe aparecer ninguna fila.

### B5. Publicar la API

**Implementar** → **Nueva implementación** → tipo **Aplicación web**:

- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier usuario**

Copia la URL que termina en `/exec`. Esa es la única URL de la API: pásasela a Claude para conectar la web. Es pública, no es un secreto.

Para comprobarla, ábrela en el navegador agregando `?action=eventos` al final. Debe mostrar tus eventos en texto.

### B6. Avisos de Mercado Pago

En Mercado Pago Developers → tu aplicación → **Configuración de webhooks** → modo **Prueba**:

- URL: la misma URL `/exec` del paso B5.
- Evento: **Order (Mercado Pago)**.

Guarda y usa **Simular notificación**. Importante: Apps Script responde a estos avisos con una redirección, y Mercado Pago espera una respuesta directa. Si la simulación marca error aunque la URL sea correcta, avísale a Claude: en ese caso el aviso se recibe en n8n. Los pagos con tarjeta y Yape se confirman al instante y no dependen de este aviso; es un respaldo.

---

## Cuando cambies el código

Cada cambio en cualquiera de los dos proyectos necesita **Administrar implementaciones → editar → Nueva versión** para llegar a la URL publicada.

## Pasar a producción (más adelante)

Cambia el valor de `MP_ACCESS_TOKEN` por el Access Token de producción, configura el webhook en modo Producción y cambia la Public Key en la web. Antes de eso: Vercel en plan Pro, y los términos y la política de privacidad publicados.
