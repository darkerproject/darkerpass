/**************************************************
 * DARKERPASS API — proyecto de Apps Script SEPARADO del Code.gs existente.
 *
 * Qué hace:
 *   GET  ?action=eventos            → eventos activos (con caché)
 *   GET  ?action=evento&id=<HOJA>   → un evento
 *   GET  ?action=buscar&q=<texto>   → eventos que coinciden
 *   POST {accion:"pagar", ...}      → cobra con Mercado Pago y registra la compra
 *   POST {accion:"emitir", ...}     → pide el ticket al sistema existente
 *   POST (aviso de Mercado Pago)    → confirma la orden y completa lo que falte
 *
 * Secretos: van en Configuración del proyecto → Propiedades del script. Nunca aquí.
 *   MP_ACCESS_TOKEN  Access Token de Mercado Pago (prueba o producción)
 *   TICKETS_URL      URL /exec del Web App del Code.gs existente
 *   CLAVE_TICKETS    clave compartida con el Code.gs existente (la misma en ambos)
 **************************************************/

/* ===============================================
 * 1) CONFIGURACIÓN
 * ===============================================*/
const MOTHER_ID   = '1lpF9uKTgK24FtA0L3TTMV_9tbPhLVMfGl0YD4P-RDwk';
const HOJA_CONFIG = 'EVENTOS_CONFIG';

// Columnas de EVENTOS_CONFIG (0 = A). AFORO en -1 significa "todavía no existe la columna":
// cuando Omar la cree, se pone aquí su posición (por ejemplo 13 para la columna N).
const COL = { HOJA: 0, LUGAR: 1, FECHA: 2, HORA: 3, EMAILS: 4, BASE: 5, BEBIDA: 6, PREVENTA: 7,
              IMAGEN: 8, BANDAS: 9, ACTIVO: 10, NUEVA_FECHA: 11, SEL_ARTISTA: 12, AFORO: -1 };

// Tipos de entrada. "nombre" es el texto que se guarda en TIPO_ENTRADA y sale en el ticket.
// POR CONFIRMAR CON OMAR: el texto exacto de cada uno.
const TIPOS = [
  { id: 'preventa', col: COL.PREVENTA, nombre: 'Preventa' },
  { id: 'general',  col: COL.BASE,     nombre: 'General' },
  { id: 'bebida',   col: COL.BEBIDA,   nombre: 'General + bebida' }
];

// Opción "voy por todas": se activa si SELECCION_ARTISTA dice SI_TODAS. POR CONFIRMAR CON OMAR.
const TODAS_LAS_BANDAS = 'Todas las bandas';

// Columnas de la pestaña del evento (1 = A)
const REG = { DNI: 4, PAGO: 7, CORREO_RECIBIDO: 12 };
const ESTADO_PAGADO = 'PAGADO';   // en la columna L hasta que sale el ticket (ahí pasa a "Sí")

const CACHE_SEG = 300;            // los datos de eventos se guardan 5 minutos
const CACHE_KEY = 'EVENTOS_V1';
const MP_API    = 'https://api.mercadopago.com/v1/orders';

/* ===============================================
 * 2) ENTRADAS: doGet / doPost
 * ===============================================*/
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'eventos') return json_({ ok: true, eventos: leerEventos_().map(publico_) });
    if (p.action === 'evento') {
      const ev = buscarEvento_(p.id);
      return json_(ev ? { ok: true, evento: publico_(ev) } : { ok: false, error: 'evento_no_encontrado' });
    }
    if (p.action === 'buscar') {
      const q = normalizar_(p.q);
      const lista = leerEventos_().filter(function (ev) {
        return !q || normalizar_([ev.nombre, ev.lugar, ev.bandas.join(' ')].join(' ')).indexOf(q) !== -1;
      });
      return json_({ ok: true, eventos: lista.map(publico_) });
    }
    return json_({ ok: false, error: 'accion_desconocida' });
  } catch (err) {
    Logger.log('doGet error: ' + err);
    return json_({ ok: false, error: 'error_interno' });
  }
}

function doPost(e) {
  let d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) {}
  const p = (e && e.parameter) || {};
  try {
    if (d.accion === 'pagar')  return json_(pagar_(d));
    if (d.accion === 'emitir') return json_(emitirPorOrden_(String(d.orden || '')));
    // Aviso de Mercado Pago (evento "Order"): llega con type=order y data.id
    if (d.type === 'order' || p.type === 'order') return json_(aviso_((d.data && d.data.id) || p['data.id']));
    return json_({ ok: false, error: 'accion_desconocida' });
  } catch (err) {
    Logger.log('doPost error: ' + err);
    return json_({ ok: false, error: 'error_interno' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===============================================
 * 3) EVENTOS (lectura de EVENTOS_CONFIG, con caché)
 * ===============================================*/
function leerEventos_(sinCache) {
  const cache = CacheService.getScriptCache();
  if (!sinCache) {
    const guardado = cache.get(CACHE_KEY);
    if (guardado) return JSON.parse(guardado);
  }
  const cfg = SpreadsheetApp.openById(MOTHER_ID).getSheetByName(HOJA_CONFIG);
  if (!cfg) return [];
  const rango = cfg.getDataRange();
  const valores = rango.getValues(), textos = rango.getDisplayValues();
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const eventos = [];

  for (let i = 1; i < valores.length; i++) {
    const hoja = String(valores[i][COL.HOJA] || '').trim();
    if (!hoja) continue;
    if (!/^(SI|SÍ|TRUE|VERDADERO)$/i.test(String(textos[i][COL.ACTIVO] || '').trim())) continue;   // solo activos
    const fecha = aFecha_(valores[i][COL.FECHA], textos[i][COL.FECHA]);
    if (fecha && fecha < hoy) continue;                                                            // no los pasados

    const tipos = [];
    TIPOS.forEach(function (t) {
      const precio = aNumero_(valores[i][t.col]);
      if (precio > 0) tipos.push({ id: t.id, nombre: t.nombre, precio: precio });
    });
    const sel = String(textos[i][COL.SEL_ARTISTA] || '').trim().toUpperCase();
    const bandas = String(valores[i][COL.BANDAS] || '').split(',').map(function (b) { return b.trim(); }).filter(Boolean);

    eventos.push({
      id: hoja, nombre: hoja,
      lugar: String(textos[i][COL.LUGAR] || '').trim(),
      fecha: String(textos[i][COL.FECHA] || '').trim(),
      hora:  String(textos[i][COL.HORA] || '').trim(),
      fechaISO: fecha ? Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
      imagen: urlImagen_(String(valores[i][COL.IMAGEN] || '').trim()),
      bandas: bandas,
      seleccionArtista: sel.indexOf('SI') === 0 && bandas.length > 0,
      todasLasBandas: sel === 'SI_TODAS',
      tipos: tipos,
      aforo: COL.AFORO >= 0 ? aNumero_(valores[i][COL.AFORO]) : 0
    });
  }
  eventos.sort(function (a, b) { return (a.fechaISO || '9999') < (b.fechaISO || '9999') ? -1 : 1; });   // el más próximo primero
  try { cache.put(CACHE_KEY, JSON.stringify(eventos), CACHE_SEG); } catch (_) {}
  return eventos;
}

function buscarEvento_(id, sinCache) {
  const clave = String(id || '').trim().toUpperCase();
  return leerEventos_(sinCache).filter(function (ev) { return ev.id.toUpperCase() === clave; })[0] || null;
}

// Lo que ve el navegador: todo menos datos internos
function publico_(ev) {
  return { id: ev.id, nombre: ev.nombre, lugar: ev.lugar, fecha: ev.fecha, hora: ev.hora, fechaISO: ev.fechaISO,
           imagen: ev.imagen, bandas: ev.bandas, seleccionArtista: ev.seleccionArtista,
           todasLasBandas: ev.todasLasBandas, tipos: ev.tipos };
}

function aNumero_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(/[^\d.,]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function aFecha_(valor, texto) {
  let f = null;
  if (valor instanceof Date) f = new Date(valor);
  else {
    const m = String(texto || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);   // dd-MM-yyyy
    if (m) f = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  if (f) f.setHours(0, 0, 0, 0);
  return f;
}
function normalizar_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
// Un enlace de Drive no sirve directo como imagen: se convierte a una dirección que sí carga en <img>.
function urlImagen_(url) {
  const m = url.match(/\/d\/([\w-]{20,})/) || url.match(/[?&]id=([\w-]{20,})/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] + '=w1200' : url;
}

/* ===============================================
 * 4) PAGAR
 * ===============================================*/
function pagar_(d) {
  // --- 1. Validar lo que mandó el navegador ---
  const nombre = String(d.nombre || '').trim().replace(/\s+/g, ' ');
  const dni    = String(d.dni || '').trim();
  const correo = String(d.correo || '').trim();
  if (nombre.length < 2 || nombre.length > 80)  return { ok: false, estado: 'invalido', campo: 'nombre' };
  if (!/^\d{8}$/.test(dni))                      return { ok: false, estado: 'invalido', campo: 'dni' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, estado: 'invalido', campo: 'correo' };
  if (d.acepto !== true)                         return { ok: false, estado: 'invalido', campo: 'terminos' };
  if (!d.token)                                  return { ok: false, estado: 'invalido', campo: 'token' };

  // --- 2. El evento y el precio salen SIEMPRE del Sheet, nunca del navegador ---
  const ev = buscarEvento_(d.evento, true);
  if (!ev) return { ok: false, estado: 'evento_no_disponible' };
  const tipo = ev.tipos.filter(function (t) { return t.id === d.tipo; })[0];
  if (!tipo) return { ok: false, estado: 'invalido', campo: 'tipo' };

  let artista = '';
  if (ev.seleccionArtista) {
    artista = String(d.artista || '').trim();
    const valido = ev.bandas.indexOf(artista) !== -1 || (ev.todasLasBandas && artista === TODAS_LAS_BANDAS);
    if (!valido) return { ok: false, estado: 'invalido', campo: 'artista' };
  }

  // --- 3. Guardar la compra como pendiente, por si algo se corta después de cobrar ---
  const props = PropertiesService.getScriptProperties();
  const ref = 'DP-' + Utilities.getUuid();
  const compra = { ref: ref, evento: ev.id, tipo: tipo.nombre, nombre: nombre, dni: dni, correo: correo, artista: artista, t: Date.now() };
  props.setProperty('pend_' + ref, JSON.stringify(compra));

  // --- 4. Con bloqueo: revisar aforo, cobrar y escribir. Así dos compras no se pisan ni se vende de más ---
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) { props.deleteProperty('pend_' + ref); return { ok: false, estado: 'ocupado' }; }
  try {
    const hoja = SpreadsheetApp.openById(MOTHER_ID).getSheetByName(ev.id);
    if (!hoja) { props.deleteProperty('pend_' + ref); return { ok: false, estado: 'evento_no_disponible' }; }
    if (ev.aforo > 0 && vendidas_(hoja) >= ev.aforo) { props.deleteProperty('pend_' + ref); return { ok: false, estado: 'agotado' }; }

    const orden = crearOrden_(d, compra, tipo.precio);
    // Sin respuesta clara de Mercado Pago: NO se borra la compra pendiente. Si el cobro sí se hizo,
    // el aviso de Mercado Pago la completa; y un reintento con la misma clave no cobra dos veces.
    if (!orden) return { ok: false, estado: 'error_pago' };
    const pago = (orden.transactions && orden.transactions.payments && orden.transactions.payments[0]) || {};

    if (orden.status === 'processed' && orden.status_detail === 'accredited') {
      registrar_(hoja, compra, orden.id);
      props.deleteProperty('pend_' + ref);
      return { ok: true, estado: 'aprobado', orden: orden.id };
    }
    if (orden.status === 'failed' || pago.status === 'failed' || orden.status === 'canceled') {
      props.deleteProperty('pend_' + ref);
      return { ok: false, estado: 'rechazado', detalle: pago.status_detail || orden.status_detail || '',
               mensaje: mensajeRechazo_(pago.status_detail || orden.status_detail) };
    }
    // En revisión o esperando algo: la compra queda pendiente y la completa el aviso de Mercado Pago.
    return { ok: true, estado: 'pendiente', orden: orden.id || '' };
  } finally {
    lock.releaseLock();
  }
}

// Entradas ya vendidas en la pestaña del evento (no cuenta filas vacías ni rechazadas)
function vendidas_(hoja) {
  const ultima = hoja.getLastRow();
  if (ultima < 2) return 0;
  return hoja.getRange(2, 2, ultima - 1, 11).getValues().filter(function (f) {
    return String(f[0]).trim() !== '' && String(f[10]).trim().toUpperCase() !== 'RECHAZADO';
  }).length;
}

// Escribe la fila A–H (+ L y M). Si la orden ya está registrada, devuelve esa fila y no duplica.
function registrar_(hoja, compra, ordenId) {
  const existente = filaDeOrden_(hoja, ordenId);
  if (existente) return existente;
  const ahora = new Date();
  hoja.appendRow([ahora, compra.nombre, compra.tipo, '', compra.correo, compra.artista, ordenId, 'SI', '', '', '', ESTADO_PAGADO, ahora]);
  const fila = hoja.getLastRow();
  hoja.getRange(fila, REG.DNI).setNumberFormat('@').setValue(compra.dni);   // como texto: conserva los ceros a la izquierda
  PropertiesService.getScriptProperties().setProperty('ord_' + ordenId, JSON.stringify({ e: compra.evento, t: Date.now() }));
  return fila;
}

function filaDeOrden_(hoja, ordenId) {
  const ultima = hoja.getLastRow();
  if (ultima < 2 || !ordenId) return 0;
  const col = hoja.getRange(2, REG.PAGO, ultima - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) if (String(col[i][0]).trim() === String(ordenId)) return i + 2;
  return 0;
}

/* ===============================================
 * 5) MERCADO PAGO (Checkout API, API de Orders)
 * ===============================================*/
function crearOrden_(d, compra, precio) {
  const monto = precio.toFixed(2);   // la API pide el monto como texto "00.00"
  const esYape = d.metodo === 'yape';
  const medio = d.medio || {};
  const pagador = { email: compra.correo, identification: { type: 'DNI', number: compra.dni } };
  if (esYape) pagador.phone = { area_code: '51', number: String(d.celular || '').replace(/\D/g, '') };

  const cuerpo = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: monto,
    external_reference: compra.ref,
    payer: pagador,
    transactions: { payments: [{
      amount: monto,
      payment_method: esYape
        ? { id: 'yape', type: 'debit_card', token: String(d.token) }
        : { id: String(medio.id || ''), type: String(medio.type || 'credit_card'), token: String(d.token),
            installments: Number(medio.installments) || 1 }
    }] }
  };
  const r = UrlFetchApp.fetch(MP_API, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + secreto_('MP_ACCESS_TOKEN'),
               // Misma clave = mismo intento: si el navegador reintenta, Mercado Pago no cobra dos veces
               'X-Idempotency-Key': String(d.intento || compra.ref).slice(0, 64) },
    payload: JSON.stringify(cuerpo)
  });
  let datos = null;
  try { datos = JSON.parse(r.getContentText()); } catch (_) {}
  if (!datos || !datos.status) {
    Logger.log('Mercado Pago respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 500));
    return null;
  }
  return datos;
}

function consultarOrden_(ordenId) {
  const r = UrlFetchApp.fetch(MP_API + '/' + encodeURIComponent(ordenId), {
    method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + secreto_('MP_ACCESS_TOKEN') }
  });
  if (r.getResponseCode() !== 200) return null;
  try { return JSON.parse(r.getContentText()); } catch (_) { return null; }
}

function mensajeRechazo_(detalle) {
  const M = {
    bad_filled_card_data: 'Algún dato no coincide. Revisa el número, el vencimiento y el código.',
    invalid_card_token: 'El código venció o no es válido. Genera uno nuevo e inténtalo otra vez.',
    insufficient_amount: 'El medio de pago no tiene saldo suficiente.',
    card_insufficient_amount: 'La tarjeta no tiene saldo suficiente.',
    amount_limit_exceeded: 'El monto supera el límite de tu medio de pago.',
    rejected_by_issuer: 'Tu banco rechazó el pago. Prueba con otro medio.',
    required_call_for_authorize: 'Tu banco necesita que autorices este pago. Comunícate con él o prueba con otro medio.',
    card_disabled: 'La tarjeta está deshabilitada. Comunícate con tu banco o prueba con otra.',
    max_attempts_exceeded: 'Superaste el número de intentos permitidos. Prueba con otro medio de pago.',
    high_risk: 'No pudimos procesar este pago. Prueba con otro medio.',
    invalid_installments: 'El número de cuotas no es válido para esta tarjeta.'
  };
  return M[detalle] || 'No pudimos procesar el pago. Inténtalo de nuevo o prueba con otro medio.';
}

function secreto_(nombre) {
  const v = PropertiesService.getScriptProperties().getProperty(nombre);
  if (!v) throw new Error('Falta la propiedad del script: ' + nombre);
  return v;
}

/* ===============================================
 * 6) TICKET: se lo pide al sistema existente (Code.gs), que ya sabe generar QR, PDF y correo
 * ===============================================*/
function emitirPorOrden_(ordenId) {
  if (!ordenId) return { ok: false, error: 'orden_requerida' };
  const props = PropertiesService.getScriptProperties();
  let indice = null;
  try { indice = JSON.parse(props.getProperty('ord_' + ordenId) || 'null'); } catch (_) {}
  if (!indice) return { ok: false, error: 'orden_no_registrada' };

  const hoja = SpreadsheetApp.openById(MOTHER_ID).getSheetByName(indice.e);
  const fila = hoja ? filaDeOrden_(hoja, ordenId) : 0;
  if (!fila) return { ok: false, error: 'orden_no_registrada' };
  const estado = String(hoja.getRange(fila, REG.CORREO_RECIBIDO).getValue()).trim();
  if (estado === 'Sí' || estado === 'Si') return { ok: true, ticket: 'ya_enviado' };

  const r = UrlFetchApp.fetch(secreto_('TICKETS_URL'), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify({ clave: secreto_('CLAVE_TICKETS'), accion: 'emitir', evento: indice.e, fila: fila,
                              dni: String(hoja.getRange(fila, REG.DNI).getDisplayValue()).trim() })
  });
  let resp = null;
  try { resp = JSON.parse(r.getContentText()); } catch (_) {}
  if (resp && resp.ok) return { ok: true, ticket: 'enviado' };
  // Si falla, la fila queda en PAGADO y aparece en AprobarCompras: desde ahí se puede enviar a mano.
  Logger.log('No se pudo emitir el ticket de ' + ordenId + ': ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  return { ok: false, error: 'ticket_no_emitido' };
}

/* ===============================================
 * 7) AVISO DE MERCADO PAGO (webhook, evento "Order")
 * Apps Script no puede leer las cabeceras, así que no valida la firma: en su lugar
 * vuelve a consultar la orden a Mercado Pago y solo confía en esa respuesta.
 * ===============================================*/
function aviso_(ordenId) {
  if (!ordenId) return { ok: true };
  const orden = consultarOrden_(String(ordenId));
  if (!orden || orden.status !== 'processed' || orden.status_detail !== 'accredited') return { ok: true };

  const props = PropertiesService.getScriptProperties();
  const clavePend = 'pend_' + String(orden.external_reference || '');
  let compra = null;
  try { compra = JSON.parse(props.getProperty(clavePend) || 'null'); } catch (_) {}

  if (compra) {   // pago aprobado cuya fila aún no existe (pago en revisión, o corte después de cobrar)
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      const hoja = SpreadsheetApp.openById(MOTHER_ID).getSheetByName(compra.evento);
      if (hoja) { registrar_(hoja, compra, orden.id); props.deleteProperty(clavePend); }
    } finally { lock.releaseLock(); }
  }
  emitirPorOrden_(orden.id);    // no duplica: si el ticket ya salió, no hace nada
  if (Math.random() < 0.05) limpiar_();
  return { ok: true };
}

// Borra del registro interno las compras de más de 45 días (las filas del Sheet no se tocan)
function limpiar_() {
  const props = PropertiesService.getScriptProperties(), todo = props.getProperties(), limite = Date.now() - 45 * 86400000;
  Object.keys(todo).forEach(function (k) {
    if (k.indexOf('ord_') !== 0 && k.indexOf('pend_') !== 0) return;
    try { if ((JSON.parse(todo[k]).t || 0) < limite) props.deleteProperty(k); } catch (_) {}
  });
}

/* ===============================================
 * 8) PRUEBAS DESDE EL EDITOR (menú Ejecutar)
 * ===============================================*/
// Lista los eventos que la web va a mostrar. Sirve para comprobar que lee bien el Sheet.
function PROBAR_EVENTOS() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  Logger.log(JSON.stringify(leerEventos_(true).map(publico_), null, 2));
}

// Hace una compra de PRUEBA con Yape de principio a fin (token de prueba → orden → fila → ticket).
// Requiere: credenciales de PRUEBA en las propiedades y un evento activo. Cambia los 3 valores de abajo.
function PROBAR_COMPRA_YAPE() {
  const EVENTO = 'NOMBRE EXACTO DE LA PESTAÑA DE PRUEBA';
  const CORREO = 'tu-correo@ejemplo.com';
  const PUBLIC_KEY_PRUEBA = 'APP_USR-cdaf3a1a-5f36-4e31-8c8e-3b6a2e7b4703';
  const CELULAR = '111111111';   // 111111111 = aprobado · 111111113 = sin saldo (ver datos de prueba de Mercado Pago)

  const t = UrlFetchApp.fetch('https://api.mercadopago.com/platforms/pci/yape/v1/payment?public_key=' + PUBLIC_KEY_PRUEBA, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ phoneNumber: CELULAR, otp: '123456', requestId: Utilities.getUuid() })
  });
  const token = JSON.parse(t.getContentText()).id;
  if (!token) { Logger.log('No se pudo crear el token de Yape: ' + t.getContentText()); return; }

  const ev = buscarEvento_(EVENTO, true);
  if (!ev) { Logger.log('Evento no encontrado o no activo: ' + EVENTO); return; }
  const res = pagar_({ evento: EVENTO, tipo: ev.tipos[0].id, nombre: 'Compra de Prueba', dni: '12345678', correo: CORREO,
                       artista: ev.seleccionArtista ? ev.bandas[0] : '', acepto: true, metodo: 'yape', token: token, celular: CELULAR });
  Logger.log('Resultado del pago: ' + JSON.stringify(res));
  if (res.estado === 'aprobado') Logger.log('Ticket: ' + JSON.stringify(emitirPorOrden_(res.orden)));
}
