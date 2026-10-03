-- ════════════════════════════════════════════════════════════════════
-- Fase 6C — Sistema de imágenes.
--
-- Decisión de diseño (aprobada en la revisión de Fase 6): un producto
-- puede tener varias imágenes, una marcada como principal, con
-- orden/prioridad — nunca una sola columna `image_url` fija. Mismo
-- criterio para `game_visuals`: banners/hero reutilizables por juego,
-- con ventana de vigencia opcional, pensados para Home hero, tarjetas de
-- producto y páginas de juego sin que el modelo tenga que cambiar cuando
-- se agregue un nuevo lugar donde mostrarlos.
--
-- Ningún binario en Postgres: solo `image_url` (CDN/object storage
-- externo). No hay endpoint de subida de archivos en esta fase — no hay
-- credenciales de storage configuradas todavía (mismo criterio que
-- `admin-health.ts` con Wompi/PayPal: no se inventa una integración que
-- no existe). El admin carga una URL ya alojada.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url   text NOT NULL,
  alt_text    text,
  is_primary  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_images_product_idx ON product_images (product_id, sort_order);

-- A lo sumo una imagen principal activa por producto — lo aplica la base,
-- no una convención que el código tenga que recordar en cada UPDATE.
CREATE UNIQUE INDEX product_images_one_primary_idx ON product_images (product_id)
  WHERE is_primary AND is_active;

CREATE TABLE game_visuals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  image_url   text NOT NULL,
  title       text,
  cta_text    text,
  cta_link    text,
  sort_order  integer NOT NULL DEFAULT 0,
  valid_from  timestamptz,
  valid_until timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_visuals_window CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE INDEX game_visuals_game_idx ON game_visuals (game_id, sort_order);
