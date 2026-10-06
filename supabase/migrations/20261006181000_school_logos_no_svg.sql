-- O bucket público `school-logos` deixa de aceitar SVG (auditoria 13, A8).
--
-- 20260928130000 já limita o NOME do envio a .png/.jpg/.jpeg/.webp, mas o tipo
-- servido é o `contentType` do envio, e 20261004220451 voltou a pôr image/svg+xml
-- na lista do bucket. Um `logo-<n>.png` enviado como image/svg+xml passava a política
-- e era servido publicamente como SVG (imagem que pode levar código). Os dois ecrãs
-- de definições já só enviam PNG, JPEG e WebP: nada da aplicação depende do SVG.
--
-- Não apaga objectos: o único SVG lá guardado (emblem-angola.svg, de 25/09) fica;
-- a aplicação usa o emblema de /brands. Idempotente.

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
 WHERE id = 'school-logos'
   AND allowed_mime_types IS DISTINCT FROM ARRAY['image/png', 'image/jpeg', 'image/webp'];
