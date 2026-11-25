# Magia Dulce · web de pedidos

Tienda de pedidos con cobro por Mercado Pago, sobre la misma base que La Liria. Los productos se leen de una planilla de Google que maneja MC Automations (el cliente no tiene acceso). Cada pedido pagado queda registrado en la hoja "Pedidos", llega por mail y, como último paso, la web guía al cliente para que envíe el pedido por WhatsApp.

## Cómo funciona
- `index.html`: la tienda, el panel del pedido y la pantalla final (pago recibido → enviar por WhatsApp).
- `fotos/`: logo y fotos de los productos. En la planilla, la columna Foto lleva el nombre del archivo (ej: `chocotorta.jpg`) o un link `https://...`. Si un producto no tiene foto, se muestra una ilustración.
- `netlify/functions/`: el servidor.
  - `menu.js`: lee los productos de la planilla y le pasa a la tienda las reglas (envío, seña, anticipación).
  - `checkout.js`: toma los precios de la planilla (no del navegador), valida la fecha y crea el pago en Mercado Pago.
  - `webhook.js`: Mercado Pago avisa acá cuando se acredita un pago; se verifica con Mercado Pago y se manda a la planilla.
  - `pedido.js`: consulta el estado del pago para la pantalla final.
- `apps-script/Codigo.gs`: el código que va dentro de la planilla. Devuelve los productos, guarda cada pedido (sin duplicarlo si Mercado Pago avisa dos veces) y manda el mail.
- `apps-script/productos-ejemplo.csv`: productos de ejemplo para importar en la hoja "Productos".

## Puesta en marcha

### 1. Planilla (en el Drive de MC Automations)
1. Crear una planilla nueva, por ejemplo "Magia Dulce · Pedidos".
2. Renombrar la primera hoja a **Productos** e importar `apps-script/productos-ejemplo.csv` (Archivo > Importar > Subir > Reemplazar la hoja actual).
3. Columnas de Productos: `ID | Categoría | Producto | Tamaño | Descripción | Precio | Foto | Destacado | Agotado`.
   - Cada tamaño va en su propia fila con el mismo Producto y Categoría: la tienda los agrupa y muestra los botones de tamaño.
   - En Tamaño se puede agregar un detalle después de un punto medio: `Grande · 18 porciones`.
   - Destacado y Agotado: escribir `Sí` (o tildar una casilla).
   - Si el ID queda vacío, el script lo completa solo. No cambiar el ID de un producto que ya se vendió.
4. La hoja **Pedidos** se crea sola con el primer pedido.

### 2. Apps Script
1. En la planilla: Extensiones > Apps Script. Borrar lo que haya y pegar `apps-script/Codigo.gs`.
2. Configuración del proyecto (engranaje) > Propiedades del script:
   - `SECRET`: una clave larga inventada (la misma va en Netlify).
   - `AVISO_EMAIL`: el mail de Magia Dulce que recibe los pedidos (se pueden poner varios separados por coma, por ejemplo el del local y el de MC).
3. Probar el mail: elegir la función `probarMail` y tocar Ejecutar. La primera vez pide permisos: aceptarlos.
4. Implementar > Nueva implementación > Aplicación web. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**. Copiar la URL (termina en `/exec`).
5. Cada vez que se cambie el código: Implementar > Administrar implementaciones > editar > Nueva versión (así la URL no cambia).

### 3. Netlify
1. Nuevo sitio desde este repositorio de GitHub. No necesita comando de build.
2. Nombre del sitio: por ejemplo `magiadulce` → `https://magiadulce.netlify.app`.
3. Variables de entorno (Site configuration > Environment variables):

| Variable | Qué es |
|---|---|
| `APPS_SCRIPT_URL` | URL de la aplicación web de Apps Script (termina en `/exec`) |
| `APPS_SCRIPT_SECRET` | La misma clave que `SECRET` en las propiedades del script |
| `MP_ACCESS_TOKEN` | Access Token de Mercado Pago de la cuenta de Magia Dulce (de prueba primero, `TEST-...`) |
| `SITE_URL` | Dirección del sitio, sin barra final (ej: `https://magiadulce.netlify.app`) |
| `WA_NUMBER` | WhatsApp de Magia Dulce, con código de país y sin signos (ej: `5491123456789`) |
| `ENVIO_COSTO` | Costo fijo del envío en pesos (ej: `3500`). Vacío o `0`: el envío se muestra "a coordinar" |
| `SENA_PORCENTAJE` | Porcentaje de seña (ej: `50`). Vacío o `0`: solo pago total |
| `ANTICIPACION_DIAS` | Días de anticipación para tomar pedidos (por defecto `2`) |

4. Después de cargar o cambiar variables: Deploys > Trigger deploy.

Estas claves no van en el código ni en GitHub: solo en Netlify.

### 4. Mercado Pago
1. Con acceso a la cuenta de Magia Dulce: Tus integraciones > Crear aplicación (Checkout Pro).
2. Primero usar las credenciales de prueba y hacer un pedido con una tarjeta de prueba. Verificar que llegue el mail, que aparezca en la hoja Pedidos y que el botón de WhatsApp abra el mensaje.
3. Después cambiar `MP_ACCESS_TOKEN` por el de producción y volver a desplegar.
4. Solo se aceptan medios que se acreditan al instante (tarjeta y dinero en cuenta): el pedido se prepara cuando ya está pago.

## Mantenimiento del día a día
- **Precios, productos, agotados:** se cambian en la hoja Productos. La web los toma en menos de un minuto.
- **Fotos:** subirlas a `fotos/` en GitHub (jpg o webp, idealmente 1200 px de ancho y menos de 300 KB) y escribir el nombre del archivo en la columna Foto. También sirve un link `https://` a una imagen.
- **Sección de temporada (ej. fiestas):** crear una categoría nueva en la hoja (ej. `Fiestas`) con sus productos; aparece sola como botón en la tienda.
