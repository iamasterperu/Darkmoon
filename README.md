# Dark Moon Store

Catálogo web tipo app con panel de administración.

- Tienda: `/` (los pedidos se envían por WhatsApp)
- Panel: `/admin` (cambiar precios, fotos, productos, promo y número de WhatsApp)

Corre en Cloudflare Workers con una base de datos D1. Las fotos que se suben desde el panel se guardan en la misma base de datos.

## Estructura

- `src/worker.js`: API del catálogo, login del panel, productos, ajustes y fotos.
- `public/index.html`: la tienda.
- `public/admin.html`: el panel.
- `public/catalog.json`: productos iniciales. Se cargan solos la primera vez que arranca la base de datos.
- `public/img/`: fotos iniciales y logos.

## Puesta en marcha en Cloudflare

1. Crear la base de datos D1 `darkmoon` y poner su ID en `database_id` dentro de `wrangler.jsonc`.
2. Conectar este repositorio en Workers & Pages (Import a repository). Cada push a `main` se publica solo.
3. En el Worker, en Settings > Variables and Secrets, crear el secreto `ADMIN_PASSWORD` con la contraseña del panel.

Las tablas se crean solas en el primer uso.

## Desarrollo local

```
npm install
echo ADMIN_PASSWORD=prueba123 > .dev.vars
npx wrangler dev
```
