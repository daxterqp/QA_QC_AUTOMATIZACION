-- v64 — Config de estampado de fotos a NIVEL PROYECTO (sincronizada).
--
-- Antes: stamp_enabled / stamp_gps / stamp_size vivían en AsyncStorage del dispositivo
-- (per-device), mientras stamp_comment ya era columna del proyecto (sincronizada). Eso
-- causaba que distintos usuarios del mismo proyecto estamparan distinto. Ahora TODA la
-- config de estampado es columna del proyecto → consistente entre usuarios/dispositivos/web.
--
-- Móvil: schema WatermelonDB v45 (addColumns projects stamp_enabled/stamp_gps/stamp_size);
-- StampContext lee del modelo de proyecto; FileUploadScreen guarda en el modelo + push.
-- Web: types Project + applyStamp(size) + callers (size + gate enabled) + ConfiguracionTab
-- (toggles enabled/GPS + selector de tamaño).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS stamp_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stamp_gps     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stamp_size    text    NOT NULL DEFAULT 'normal';
