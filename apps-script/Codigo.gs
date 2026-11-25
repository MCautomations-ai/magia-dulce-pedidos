/**
 * Magia Dulce · Apps Script de la planilla de pedidos.
 *
 * Va pegado en la planilla (Extensiones > Apps Script) y se publica como aplicación web.
 * - GET: devuelve los productos de la hoja "Productos" para la tienda.
 * - POST: recibe cada pedido pagado (lo manda Netlify), lo guarda en la hoja "Pedidos"
 *   y manda el mail de aviso. Si el mismo pedido llega dos veces, no se duplica.
 *
 * Propiedades del script (Configuración del proyecto > Propiedades del script):
 *   SECRET        la misma clave que APPS_SCRIPT_SECRET en Netlify
 *   AVISO_EMAIL   mail (o varios separados por coma) que recibe cada pedido
 */

var HOJA_PRODUCTOS = 'Productos';
var HOJA_PEDIDOS = 'Pedidos';
var COLS_PEDIDOS = ['Recibido', 'Número', 'Estado', 'Para el día', 'Cliente', 'WhatsApp', 'Entrega', 'Dirección',
  'Detalle', 'Total', 'Pagado', 'Saldo', 'Aclaraciones', 'ID de pago'];

function doGet() {
  try {
    return json({ ok: true, items: leerProductos() });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || body.token !== secret) return json({ ok: false, error: 'No autorizado' });
    var p = body.pedido || {};
    if (!p.numero) return json({ ok: false, error: 'Falta el número de pedido' });

    lock.waitLock(20000);
    var hoja = hojaPedidos();
    var numeros = hoja.getLastRow() > 1 ? hoja.getRange(2, 2, hoja.getLastRow() - 1, 1).getValues() : [];
    for (var i = 0; i < numeros.length; i++) {
      if (String(numeros[i][0]) === String(p.numero)) return json({ ok: true, repetido: true });
    }

    hoja.appendRow([
      new Date(), p.numero, p.estado || 'Pagado', fechaLinda(p.fecha), p.cliente || '', "'" + (p.telefono || ''),
      p.modo || '', p.direccion || '', p.detalle || '', Number(p.total) || 0, Number(p.pagado) || 0,
      Number(p.saldo) || 0, p.nota || '', "'" + (p.pago || '')
    ]);
    SpreadsheetApp.flush();
    avisarPorMail(p);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- Productos ---------- */

// Columnas de la hoja Productos (la primera fila son los títulos, en cualquier orden):
// ID | Categoría | Producto | Tamaño | Descripción | Precio | Foto | Destacado | Agotado
function leerProductos() {
  var hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_PRODUCTOS);
  if (!hoja) throw new Error('No encuentro la hoja "' + HOJA_PRODUCTOS + '"');
  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];
  var t = datos[0].map(function (h) { return normal(h); });
  var c = function (nombre) { return t.indexOf(nombre); };
  var ci = { id: c('id'), cat: c('categoria'), name: c('producto'), size: c('tamano'), desc: c('descripcion'),
    price: c('precio'), foto: c('foto'), hot: c('destacado'), off: c('agotado') };
  if (ci.name < 0 || ci.price < 0) throw new Error('Faltan las columnas Producto o Precio');

  var items = [];
  var usados = {};
  for (var r = 1; r < datos.length; r++) {
    var fila = datos[r];
    var name = String(fila[ci.name] || '').trim();
    var price = Number(String(fila[ci.price]).replace(/[^\d.]/g, ''));
    if (!name || !(price > 0)) continue;
    var id = ci.id >= 0 ? String(fila[ci.id] || '').trim() : '';
    if (!id || usados[id]) {
      id = 'p' + (r + 1);
      if (ci.id >= 0) hoja.getRange(r + 1, ci.id + 1).setValue(id);
    }
    usados[id] = true;
    items.push({
      id: id,
      cat: ci.cat >= 0 ? String(fila[ci.cat] || '').trim() || 'Otros' : 'Otros',
      name: name,
      size: ci.size >= 0 ? String(fila[ci.size] || '').trim() : '',
      desc: ci.desc >= 0 ? String(fila[ci.desc] || '').trim() : '',
      price: Math.round(price),
      foto: ci.foto >= 0 ? String(fila[ci.foto] || '').trim() : '',
      hot: ci.hot >= 0 && si(fila[ci.hot]),
      off: ci.off >= 0 && si(fila[ci.off])
    });
  }
  return items;
}

/* ---------- Pedidos ---------- */

function hojaPedidos() {
  var libro = SpreadsheetApp.getActive();
  var hoja = libro.getSheetByName(HOJA_PEDIDOS);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_PEDIDOS);
    hoja.appendRow(COLS_PEDIDOS);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, COLS_PEDIDOS.length).setFontWeight('bold');
  }
  return hoja;
}

function avisarPorMail(p) {
  var para = PropertiesService.getScriptProperties().getProperty('AVISO_EMAIL');
  if (!para) return;
  var plata = function (n) { return '$' + Number(n || 0).toLocaleString('es-AR'); };
  var entrega = p.modo === 'Envío' ? 'Envío a ' + (p.direccion || '-') : 'Retiro en el local';
  var filas = [
    ['Para el día', fechaLinda(p.fecha)],
    ['Entrega', entrega],
    ['Cliente', (p.cliente || '-') + ' · ' + (p.telefono || '-')],
    ['Total', plata(p.total)],
    ['Pagado con Mercado Pago', plata(p.pagado)]
  ];
  if (Number(p.saldo) > 0) filas.push(['Saldo a cobrar', plata(p.saldo)]);
  if (p.nota) filas.push(['Aclaraciones', p.nota]);

  var html = '<div style="font-family:Arial,sans-serif;max-width:560px;color:#2B1113">'
    + '<h2 style="color:#B3131B;margin:0 0 4px">Nuevo pedido ' + esc(p.numero) + '</h2>'
    + (p.estado && p.estado !== 'Pagado' ? '<p style="color:#B3131B;font-weight:bold">' + esc(p.estado) + '</p>' : '<p style="margin:0 0 16px;color:#1F7A4D;font-weight:bold">Pago acreditado</p>')
    + '<pre style="font-family:Arial,sans-serif;font-size:15px;background:#FFF6F5;border:1px solid #F1D3D0;border-radius:8px;padding:12px;white-space:pre-wrap">' + esc(p.detalle || '') + '</pre>'
    + '<table style="border-collapse:collapse;font-size:15px">'
    + filas.map(function (f) { return '<tr><td style="padding:4px 16px 4px 0;color:#7B5659">' + esc(f[0]) + '</td><td style="padding:4px 0;font-weight:bold">' + esc(f[1]) + '</td></tr>'; }).join('')
    + '</table></div>';

  MailApp.sendEmail({
    to: para,
    subject: 'Nuevo pedido ' + p.numero + ' · para el ' + fechaLinda(p.fecha) + ' · ' + (p.cliente || ''),
    htmlBody: html,
    body: 'Nuevo pedido ' + p.numero + '\n\n' + (p.detalle || '') + '\n\n' + filas.map(function (f) { return f[0] + ': ' + f[1]; }).join('\n'),
    name: 'Pedidos Magia Dulce'
  });
}

/* ---------- Utilidades ---------- */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function normal(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function si(v) {
  return v === true || /^(si|sí|x|true|1)$/i.test(String(v || '').trim());
}
function fechaLinda(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

// Para probar el mail desde el editor: elegí esta función y tocá Ejecutar.
function probarMail() {
  avisarPorMail({ numero: 'MD-PRUEBA1', cliente: 'Prueba', telefono: '11 2345 6789', modo: 'Retiro en el local',
    fecha: '2026-12-24', detalle: '1 x Chocotorta (Grande) · $56.000', total: 56000, pagado: 56000, saldo: 0 });
}
