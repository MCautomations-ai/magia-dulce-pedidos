const { reply, need, mp } = require('./_lib');

// Mercado Pago avisa acá cuando cambia un pago. Se vuelve a consultar el pago a Mercado Pago:
// nunca se confía en lo que dice el aviso.
exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) {}
    const type = q.type || q.topic || body.type || body.topic;
    const id = q['data.id'] || q.id || (body.data && body.data.id);
    if (type !== 'payment' || !id) return reply(200, { ok: true, ignorado: true });

    const pay = await mp('/v1/payments/' + encodeURIComponent(id));
    if (pay.status !== 'approved') return reply(200, { ok: true, estado: pay.status });

    const m = pay.metadata || {};
    const numero = pay.external_reference || m.numero;
    if (!numero) return reply(200, { ok: true, ignorado: 'sin referencia' });

    const cobrado = Number(pay.transaction_amount) || 0;
    const coincide = Number(m.pagado) === cobrado;

    // La planilla guarda el pedido y manda el mail. Si Mercado Pago avisa dos veces, no se duplica.
    const r = await fetch(need('APPS_SCRIPT_URL'), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: need('APPS_SCRIPT_SECRET'),
        pedido: {
          numero,
          cliente: m.cliente,
          telefono: m.telefono,
          detalle: m.detalle,
          total: Number(m.total) || cobrado,
          pagado: cobrado,
          saldo: Number(m.saldo) || 0,
          modo: m.modo,
          direccion: m.direccion,
          fecha: m.fecha,
          nota: m.nota,
          pago: pay.id,
          estado: coincide ? 'Pagado' : 'REVISAR: el monto cobrado no coincide con el pedido'
        }
      })
    });
    const d = await r.json();
    if (!d.ok) throw new Error('La planilla rechazó el pedido: ' + (d.error || ''));
    return reply(200, { ok: true });
  } catch (e) {
    console.error('webhook', e.message, e.detail ? JSON.stringify(e.detail) : '');
    return reply(500, { ok: false }); // Mercado Pago reintenta solo
  }
};
