// Utilidades compartidas. Sin dependencias: solo Node.
const MENU_TTL = 60 * 1000;
let cache = { at: 0, items: null };

function reply(status, obj, extra) {
  return {
    statusCode: status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}),
    body: JSON.stringify(obj)
  };
}

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error('Falta la variable de entorno ' + name);
  return v;
}

const num = (v, def) => {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && String(v == null ? '' : v).trim() !== '' ? n : def;
};

// Reglas del local, configurables desde Netlify sin tocar el código.
function config() {
  const sena = Math.round(num(process.env.SENA_PORCENTAJE, 0));
  return {
    envio: Math.round(num(process.env.ENVIO_COSTO, 0)), // 0 = el envío se coordina aparte
    sena: sena > 0 && sena < 100 ? sena : 0, // 0 = solo pago total
    anticipacion: Math.max(0, Math.round(num(process.env.ANTICIPACION_DIAS, 2))),
    // Pedidos para antes de la anticipación: 'consultar' (por WhatsApp, sin pago online) o 'bloquear'.
    cercano: /^bloquear$/i.test(process.env.FECHA_CERCANA || '') ? 'bloquear' : 'consultar',
    wa: (process.env.WA_NUMBER || '').replace(/\D/g, '')
  };
}

// Fecha de hoy en Buenos Aires, como AAAA-MM-DD.
function hoyAR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function sumarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const fechaLinda = (iso) => { const [y, m, d] = String(iso).split('-'); return d + '/' + m + '/' + y; };

// Lee el menú de la planilla (a través de Apps Script). force=true ignora la memoria.
async function getMenu(force) {
  if (!force && cache.items && Date.now() - cache.at < MENU_TTL) return cache.items;
  try {
    const r = await fetch(need('APPS_SCRIPT_URL'), { redirect: 'follow' });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'La planilla devolvió un error');
    cache = { at: Date.now(), items: d.items };
    return d.items;
  } catch (e) {
    if (cache.items && !force) return cache.items; // si la planilla falla un momento, se sigue mostrando el último menú
    throw e;
  }
}

async function mp(path, opts) {
  const r = await fetch('https://api.mercadopago.com' + path, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + need('MP_ACCESS_TOKEN'), 'Content-Type': 'application/json' }, (opts && opts.headers) || {})
  }));
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!r.ok) { const err = new Error('Mercado Pago respondió ' + r.status); err.detail = data; throw err; }
  return data;
}

// Días de anticipación que necesita un producto: los suyos de la planilla, o la anticipación general.
const diasProducto = (p, cfg) => (p && p.lead != null && p.lead !== '' && Number.isFinite(Number(p.lead)) ? Math.max(0, Number(p.lead)) : cfg.anticipacion);

const money = (n) => '$' + Number(n).toLocaleString('es-AR');
const REF = /^MD-[A-Z0-9]{8}$/;

module.exports = { reply, need, config, hoyAR, sumarDias, fechaLinda, getMenu, mp, money, REF, diasProducto };
