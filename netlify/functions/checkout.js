const crypto = require('crypto');
const { reply, config, hoyAR, sumarDias, fechaLinda, getMenu, mp, money, diasProducto } = require('./_lib');

const MODOS = ['Retiro en el local', 'Envío'];
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Método no permitido' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Pedido inválido' }); }

  const cfg = config();
  const cliente = clean(b.cliente, 80);
  const telefono = clean(b.telefono, 30);
  const modo = MODOS.includes(b.modo) ? b.modo : '';
  const direccion = clean(b.direccion, 160);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha || '')) ? b.fecha : '';
  const nota = clean(b.nota, 300);
  const sena = b.pago === 'sena' && cfg.sena > 0;

  if (!cliente) return reply(400, { ok: false, error: 'Falta el nombre.' });
  if (telefono.replace(/\D/g, '').length < 8) return reply(400, { ok: false, error: 'Falta un WhatsApp de contacto.' });
  if (!modo) return reply(400, { ok: false, error: 'Elegí retiro o envío.' });
  if (modo === 'Envío' && !direccion) return reply(400, { ok: false, error: 'Falta la dirección de entrega.' });
  if (!fecha) return reply(400, { ok: false, error: 'Elegí para qué día es el pedido.' });
  if (fecha > sumarDias(hoyAR(), 120)) return reply(400, { ok: false, error: 'Elegí una fecha más cercana.' });
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 40) return reply(400, { ok: false, error: 'El pedido está vacío.' });

  try {
    // Los precios se toman de la planilla en este momento, nunca de lo que manda el navegador.
    const menu = await getMenu(true);
    const byId = {};
    menu.forEach((p) => { byId[p.id] = p; });

    const faltan = [];
    const items = [];
    for (const it of b.items) {
      const q = parseInt(it.q, 10);
      const p = byId[it.id];
      if (!p || p.off) { faltan.push(String(it.id)); continue; }
      if (!(q >= 1 && q <= 50)) return reply(400, { ok: false, error: 'Cantidad inválida.' });
      items.push({ p, q });
    }
    if (faltan.length) return reply(409, { ok: false, error: 'Algunos productos ya no están disponibles. Actualizamos la lista.', agotados: faltan });

    // La fecha tiene que respetar la anticipación del producto que más necesita.
    const desde = sumarDias(hoyAR(), Math.max.apply(null, items.map((x) => diasProducto(x.p, cfg))));
    if (fecha < desde) return reply(400, { ok: false, error: 'Para pagar online, este pedido se puede hacer a partir del ' + fechaLinda(desde) + '.' });

    const nombreItem = (p) => (p.size && p.size.toLowerCase() !== 'unidad' ? p.name + ' (' + p.size + ')' : p.name);
    const envio = modo === 'Envío' ? cfg.envio : 0;
    const subtotal = items.reduce((t, x) => t + x.p.price * x.q, 0);
    const total = subtotal + envio;
    const pagado = sena ? Math.round(total * cfg.sena / 100) : total;
    const saldo = total - pagado;
    const detalle = items.map((x) => x.q + ' x ' + nombreItem(x.p) + ' · ' + money(x.p.price * x.q)).join('\n')
      + (envio ? '\nEnvío · ' + money(envio) : '');
    const ref = 'MD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const site = (process.env.SITE_URL || 'https://' + event.headers.host).replace(/\/$/, '');

    // Con seña se cobra un solo ítem por el monto de la seña; si no, el detalle completo.
    const mpItems = sena
      ? [{ id: 'sena', title: ('Seña ' + cfg.sena + '% pedido ' + ref).slice(0, 120), quantity: 1, unit_price: pagado, currency_id: 'ARS' }]
      : items.map((x) => ({ id: x.p.id, title: nombreItem(x.p).slice(0, 120), quantity: x.q, unit_price: x.p.price, currency_id: 'ARS' }))
          .concat(envio ? [{ id: 'envio', title: 'Envío', quantity: 1, unit_price: envio, currency_id: 'ARS' }] : []);

    const pref = await mp('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: mpItems,
        external_reference: ref,
        statement_descriptor: 'MAGIA DULCE',
        back_urls: { success: site + '/?pedido=' + ref, pending: site + '/?pedido=' + ref, failure: site + '/?pedido=' + ref },
        auto_return: 'approved',
        notification_url: site + '/api/webhook',
        // Solo medios que se acreditan al instante: el pedido se prepara cuando ya está pago.
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
        metadata: { numero: ref, cliente, telefono, modo, direccion, fecha, nota, detalle, total, pagado, saldo }
      })
    });

    return reply(200, { ok: true, url: pref.init_point, ref });
  } catch (e) {
    console.error('checkout', e.message, e.detail ? JSON.stringify(e.detail) : '');
    return reply(502, { ok: false, error: 'No pudimos preparar el pago. Probá de nuevo en un momento.' });
  }
};
