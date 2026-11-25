const { reply, getMenu, config, hoyAR, sumarDias } = require('./_lib');

exports.handler = async () => {
  try {
    const items = await getMenu(false);
    const c = config();
    return reply(200, {
      ok: true,
      items,
      // Reglas para la tienda: costo de envío, seña y desde qué día se toman pedidos.
      config: { envio: c.envio, sena: c.sena, anticipacion: c.anticipacion, desde: sumarDias(hoyAR(), c.anticipacion) }
    }, { 'Cache-Control': 'public, max-age=30' });
  } catch (e) {
    console.error('menu', e.message);
    return reply(502, { ok: false, error: 'No pudimos cargar los productos.' });
  }
};
