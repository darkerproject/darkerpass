// Simulación local del backend (sin Google ni Mercado Pago reales).
// Carga api/Codigo.gs con versiones falsas de los servicios de Apps Script y recorre los casos principales.
// Uso: node backend/pruebas/simular.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'api', 'Codigo.gs'), 'utf8');

function hoja(filas) {
  const d = filas.map(f => f.slice());
  const txt = v => v instanceof Date ? [String(v.getDate()).padStart(2,'0'), String(v.getMonth()+1).padStart(2,'0'), v.getFullYear()].join('-') : String(v == null ? '' : v);
  return {
    _d: d,
    getDataRange: () => ({ getValues: () => d.map(f => f.slice()), getDisplayValues: () => d.map(f => f.map(txt)) }),
    getLastRow: () => d.length,
    appendRow: f => { d.push(f.slice()); },
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (d[r-1+i] || [])[c-1+j]; return v == null ? '' : v; })),
      getValue: () => { const v = (d[r-1] || [])[c-1]; return v == null ? '' : v; },
      getDisplayValue: () => txt((d[r-1] || [])[c-1]),
      setNumberFormat() { return this; },
      setValue(v) { d[r-1][c-1] = v; return this; }
    })
  };
}

function mundo(opts = {}) {
  const manana = new Date(Date.now() + 5 * 86400000), ayer = new Date(Date.now() - 5 * 86400000);
  const cfg = [
    ['HOJA','LUGAR','FECHA','HORA','EMAILS','PRECIO BASE','PRECIO + BEBIDA','PRECIO PREVENTA','IMAGEN','BANDAS','ACTIVO','NUEVA FECHA','SELECCION_ARTISTA','AFORO'],
    ['KIDS IN THE DARK FEBRERO','Feria Bar (Barranco)',manana,'9:00 p. m.','secreto@x.com',60,75,45,'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view','Los Zafiros, Mar de Fondo, Niebla','SI','','SI', opts.aforo || ''],
    ['NOCHE INDIE','La Noche',manana,'8:00 p. m.','',50,'','','','','TRUE','','NO',''],
    ['EVENTO APAGADO','X',manana,'8:00 p. m.','',50,'','','','','NO','','NO',''],
    ['EVENTO VIEJO','X',ayer,'8:00 p. m.','',50,'','','','','SI','','NO','']
  ];
  const hojas = { EVENTOS_CONFIG: hoja(cfg),
    'KIDS IN THE DARK FEBRERO': hoja([['TIMESTAMP','NOMBRE','TIPO','DNI','CORREO','ARTISTA','PAGO','ACEPTO','QR','LINK','ESTADO','CORREO_RECIBIDO','FECHA_ENVIO']].concat(opts.previas || [])),
    'NOCHE INDIE': hoja([['TIMESTAMP','NOMBRE']]) };
  const props = { MP_ACCESS_TOKEN: 'TOKEN-SECRETO', TICKETS_URL: 'https://tickets.test/exec', CLAVE_TICKETS: 'clave123' };
  const cache = {}, llamadas = [], ordenes = {};
  let n = 0;
  const resp = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj) });
  const ctx = {
    console, JSON, Math, Date, String, Number, Object, Array, parseFloat, isNaN, encodeURIComponent,
    Logger: { log() {} },
    Session: { getScriptTimeZone: () => 'America/Lima' },
    Utilities: { getUuid: () => 'uuid-' + (++n), formatDate: (f) => f.toISOString().slice(0, 10) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ _t: t, setMimeType() { return this; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; },
      deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.bloqueado, waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: nombre => hojas[nombre] || null }) },
    UrlFetchApp: { fetch: (url, o) => {
      const cuerpo = o.payload ? JSON.parse(o.payload) : null;
      llamadas.push({ url, metodo: o.method, cuerpo, cabeceras: o.headers || {} });
      if (url === 'https://api.mercadopago.com/v1/orders') {
        const modo = opts.mp || 'aprobado';
        if (modo === 'caido') return { getResponseCode: () => 500, getContentText: () => 'error' };
        const clave = o.headers['X-Idempotency-Key'];
        const id = ordenes['k_' + clave] || ('ORD' + (++n));
        ordenes['k_' + clave] = id;
        const est = modo === 'aprobado' ? ['processed','accredited'] : modo === 'rechazado' ? ['failed','insufficient_amount'] : ['processing','in_process'];
        const o2 = { id, status: est[0], status_detail: est[1], external_reference: cuerpo.external_reference, total_amount: cuerpo.total_amount,
                     transactions: { payments: [{ status: est[0], status_detail: est[1] }] } };
        ordenes[id] = o2; return resp(modo === 'rechazado' ? 402 : 201, o2);
      }
      if (url.indexOf('https://api.mercadopago.com/v1/orders/') === 0) {
        const o2 = ordenes[decodeURIComponent(url.split('/').pop())]; return o2 ? resp(200, o2) : resp(404, {});
      }
      if (url === 'https://tickets.test/exec') {
        if (cuerpo.clave !== 'clave123') return resp(200, { ok: false });
        hojas[cuerpo.evento]._d[cuerpo.fila - 1][11] = 'Sí'; return resp(200, { ok: true });
      }
      return resp(404, {});
    } }
  };
  let src = SRC;
  if (opts.aforo) src = src.replace('SEL_ARTISTA: 12, AFORO: -1', 'SEL_ARTISTA: 12, AFORO: 13');
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const api = {
    get: p => JSON.parse(ctx.doGet({ parameter: p })._t),
    post: (d, p) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(d) }, parameter: p || {} })._t),
    hojas, props, llamadas, ordenes
  };
  return api;
}

let fallos = 0;
function ok(cond, msg) { console.log((cond ? '  ok   ' : '  FALLA ') + msg); if (!cond) fallos++; }
const COMPRA = { accion: 'pagar', evento: 'kids in the dark febrero', tipo: 'general', nombre: '  Camila   Rojas ', dni: '01234567', correo: 'camila@ejemplo.com',
                 artista: 'Niebla', acepto: true, metodo: 'tarjeta', token: 'tok123', medio: { id: 'visa', type: 'credit_card', installments: 1 }, intento: 'intento-1', precio: 1 };

console.log('1. Eventos');
{ const m = mundo(); const r = m.get({ action: 'eventos' });
  ok(r.ok && r.eventos.length === 2, 'solo los activos y no pasados (2)');
  const k = r.eventos.find(e => e.id === 'KIDS IN THE DARK FEBRERO');
  ok(k.tipos.map(t => t.id + t.precio).join() === 'preventa45,general60,bebida75', 'tipos y precios desde el Sheet');
  ok(k.imagen === 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345=w1200', 'enlace de Drive convertido a imagen');
  ok(k.seleccionArtista && k.bandas.length === 3, 'bandas y selección de artista');
  ok(!JSON.stringify(r).includes('secreto@x.com'), 'los correos internos no salen');
  ok(r.eventos.find(e => e.id === 'NOCHE INDIE').tipos.length === 1 && !r.eventos.find(e => e.id === 'NOCHE INDIE').seleccionArtista, 'evento sin bebida, preventa ni artista');
  ok(m.get({ action: 'buscar', q: 'zafíros' }).eventos.length === 1, 'búsqueda por banda, sin importar tildes');
  ok(m.get({ action: 'evento', id: 'EVENTO APAGADO' }).ok === false, 'un evento inactivo no se entrega'); }

console.log('2. Pago aprobado con tarjeta');
{ const m = mundo(); const r = m.post(COMPRA);
  const mp = m.llamadas.find(l => l.url.endsWith('/v1/orders'));
  const f = m.hojas['KIDS IN THE DARK FEBRERO']._d[1];
  ok(r.ok && r.estado === 'aprobado' && !!r.orden, 'responde aprobado con el ID de la orden');
  ok(mp.cuerpo.total_amount === '60.00' && mp.cuerpo.transactions.payments[0].amount === '60.00', 'cobra el precio del Sheet (60.00), no el del navegador');
  ok(mp.cabeceras.Authorization === 'Bearer TOKEN-SECRETO' && mp.cabeceras['X-Idempotency-Key'] === 'intento-1', 'token y clave de idempotencia');
  ok(mp.cuerpo.processing_mode === 'automatic' && mp.cuerpo.type === 'online' && mp.cuerpo.payer.identification.number === '01234567', 'cuerpo de la orden');
  ok(f[1] === 'Camila Rojas' && f[2] === 'General' && f[3] === '01234567' && f[4] === 'camila@ejemplo.com' && f[5] === 'Niebla' && f[6] === r.orden && f[7] === 'SI' && f[11] === 'PAGADO', 'fila A–H correcta, DNI con su cero, L = PAGADO');
  ok(!Object.keys(m.props).some(k => k.startsWith('pend_')) && !!m.props['ord_' + r.orden], 'sin pendientes; orden indexada');
  const e1 = m.post({ accion: 'emitir', orden: r.orden });
  ok(e1.ok && e1.ticket === 'enviado' && m.llamadas.find(l => l.url.includes('tickets.test')).cuerpo.fila === 2, 'pide el ticket de la fila 2 al sistema existente');
  ok(m.post({ accion: 'emitir', orden: r.orden }).ticket === 'ya_enviado' && m.llamadas.filter(l => l.url.includes('tickets.test')).length === 1, 'no emite dos veces');
  m.post(COMPRA);
  ok(m.hojas['KIDS IN THE DARK FEBRERO']._d.length === 2, 'reintento con la misma clave: no duplica la fila'); }

console.log('3. Pago con Yape');
{ const m = mundo(); const r = m.post(Object.assign({}, COMPRA, { metodo: 'yape', celular: '987 654 321', medio: null }));
  const pm = m.llamadas[0].cuerpo;
  ok(r.estado === 'aprobado' && pm.transactions.payments[0].payment_method.id === 'yape' && pm.transactions.payments[0].payment_method.type === 'debit_card', 'medio yape / debit_card');
  ok(pm.payer.phone.area_code === '51' && pm.payer.phone.number === '987654321', 'celular con código 51'); }

console.log('4. Rechazos y validaciones');
{ const m = mundo({ mp: 'rechazado' }); const r = m.post(COMPRA);
  ok(r.estado === 'rechazado' && /saldo/.test(r.mensaje) && m.hojas['KIDS IN THE DARK FEBRERO']._d.length === 1, 'rechazado: mensaje claro y sin fila');
  ok(!Object.keys(m.props).some(k => k.startsWith('pend_')), 'rechazado: no deja pendiente');
  const v = (extra, campo) => { const mm = mundo(); const rr = mm.post(Object.assign({}, COMPRA, extra)); ok(rr.estado === 'invalido' && rr.campo === campo && mm.llamadas.length === 0, 'inválido (' + campo + '): no llega a cobrar'); };
  v({ dni: '123' }, 'dni'); v({ correo: 'x' }, 'correo'); v({ tipo: 'vip' }, 'tipo'); v({ artista: 'Otra Banda' }, 'artista'); v({ acepto: false }, 'terminos'); v({ token: '' }, 'token');
  ok(mundo().post(Object.assign({}, COMPRA, { evento: 'EVENTO APAGADO' })).estado === 'evento_no_disponible', 'evento inactivo: no se vende');
  ok(mundo({ mp: 'caido' }).post(COMPRA).estado === 'error_pago', 'Mercado Pago caído: error controlado');
  const b = mundo({ bloqueado: true }); ok(b.post(COMPRA).estado === 'ocupado' && b.llamadas.length === 0, 'sin bloqueo disponible: no cobra'); }

console.log('5. Aforo');
{ const previas = [[new Date(),'A','General','1','a@a.com','','X1','SI','','','','Sí',''], [new Date(),'B','General','2','b@b.com','','X2','SI','','','','RECHAZADO','']];
  const lleno = mundo({ aforo: 1, previas }); const r = lleno.post(COMPRA);
  ok(r.estado === 'agotado' && lleno.llamadas.length === 0, 'aforo completo: agotado y no cobra');
  ok(mundo({ aforo: 2, previas }).post(COMPRA).estado === 'aprobado', 'las rechazadas no cuentan para el aforo'); }

console.log('6. Pago en revisión + aviso de Mercado Pago');
{ const m = mundo({ mp: 'pendiente' }); const r = m.post(COMPRA);
  ok(r.estado === 'pendiente' && m.hojas['KIDS IN THE DARK FEBRERO']._d.length === 1 && Object.keys(m.props).some(k => k.startsWith('pend_')), 'pendiente: sin fila y con la compra guardada');
  m.post({ type: 'order', data: { id: r.orden } });
  ok(m.hojas['KIDS IN THE DARK FEBRERO']._d.length === 1, 'aviso de una orden aún no aprobada: no hace nada');
  Object.assign(m.ordenes[r.orden], { status: 'processed', status_detail: 'accredited' });
  m.post({}, { type: 'order', 'data.id': r.orden });
  const f = m.hojas['KIDS IN THE DARK FEBRERO']._d[1];
  ok(f && f[6] === r.orden && f[11] === 'Sí', 'aviso de orden aprobada: escribe la fila y sale el ticket');
  m.post({ type: 'order', data: { id: r.orden } });
  ok(m.hojas['KIDS IN THE DARK FEBRERO']._d.length === 2 && m.llamadas.filter(l => l.url.includes('tickets.test')).length === 1, 'aviso repetido: ni fila ni ticket duplicados');
  ok(m.post({ type: 'order', data: { id: 'NO-EXISTE' } }).ok === true, 'aviso de una orden desconocida: se ignora'); }

console.log(fallos ? '\n' + fallos + ' pruebas fallaron' : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
