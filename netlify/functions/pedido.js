const { reply, mp, config, REF } = require('./_lib');

// La pantalla "pedido confirmado" consulta acá el estado del pago.
exports.handler = async (event) => {
  const ref = String((event.queryStringParameters || {}).ref || '');
  if (!REF.test(ref)) return reply(400, { ok: false, error: 'Referencia inválida' });
  try {
    const r = await mp('/v1/payments/search?sort=date_created&criteria=desc&external_reference=' + encodeURIComponent(ref));
    const pays = (r.results || []);
    const ok = pays.find((p) => p.status === 'approved');
    const pay = ok || pays[0];
    const wa = config().wa;
    if (!pay) return reply(200, { ok: true, estado: 'none', wa });
    const m = pay.metadata || {};
    const estado = pay.status === 'approved' ? 'approved'
      : (pay.status === 'rejected' || pay.status === 'cancelled') ? 'rejected' : 'pending';
    const pagado = Number(pay.transaction_amount) || Number(m.pagado) || 0;
    return reply(200, {
      ok: true, estado, wa,
      pedido: {
        numero: ref, cliente: m.cliente, telefono: m.telefono, detalle: m.detalle,
        total: Number(m.total) || pagado, pagado, saldo: Number(m.saldo) || 0,
        modo: m.modo, direccion: m.direccion, fecha: m.fecha, nota: m.nota
      }
    });
  } catch (e) {
    console.error('pedido', e.message);
    return reply(502, { ok: false, error: 'No pudimos consultar el pago.' });
  }
};
