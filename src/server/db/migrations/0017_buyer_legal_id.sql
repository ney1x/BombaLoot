-- ════════════════════════════════════════════════════════════════════
-- Cédula del comprador — solo Nequi, solo con consentimiento explícito.
--
-- Finalidad declarada (ver checkout-schemas.ts y privacidad/page.tsx):
-- identificación del comprador / prevención de fraude, NO facturación
-- electrónica DIAN — ese proceso no existe todavía, así que no se le
-- promete al usuario un uso que no se cumple.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE orders ADD COLUMN buyer_legal_id text;
