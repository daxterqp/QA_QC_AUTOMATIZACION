# 06 — Preguntas frecuentes y solución de problemas

## Sincronización y datos

**"Creé un ensayo en el celular y no aparece en la PC (o al revés)."**
Los datos viajan al reconectar y en vivo en las pantallas principales. En el
celular: haga *pull-to-refresh* (arrastre la lista hacia abajo). En la PC:
botón **Actualizar** del encabezado. Si el celular estuvo sin señal, revise el
chip de sincronización (esquina superior): tóquelo para ver la cola y
reintentar.

**"El chip de sincronización está en rojo."**
Alguna subida falló de forma permanente (p. ej. estuvo semanas sin señal).
Tóquelo → verá el detalle por operación → **Reintentar**. Los datos siguen a
salvo en el teléfono; nada se descarta solo.

**"Me salió: 'Sincronización incompleta (N errores)'."**
Aviso de que parte del último envío no subió — se reintenta solo. Si persiste
un día entero, revise conexión y avise a soporte. Sus datos locales están
intactos.

**"El código de mi ensayo cambió (era 013 y ahora es 014)."**
Normal: dos equipos crearon ensayos sin señal a la vez y al sincronizar el
sistema reacomodó el correlativo para que no haya duplicados. Las referencias
internas no se rompen (van por identidad, no por código).

**"Borré un ensayo por error."**
Menú del proyecto → **Papelera de Reciclaje** → restaurar. Vuelve completo
(valores, fotos, firmas). Si su código ya fue reutilizado, toma el próximo
libre.

## Campo

**"No tengo señal, ¿puedo trabajar?"**
Sí — TODO: crear, llenar, fotos, GPS, firmas, enviar. La app está diseñada
offline-first. Solo necesitará señal el primer login del teléfono y para que
los demás vean sus datos.

**"La foto salió sin la marca (logo/fecha/GPS)."**
No debería pasar — repórtelo de inmediato. Mientras tanto: verifique que tomó
la foto DESDE la app (no adjuntada de galería) y que el proyecto tiene el
logo cargado en Configuración → Estampado. La app espera a tener el logo antes
de estampar, incluso sin señal.

**"El GPS no me asigna el sector."**
Requiere que el Creador haya dibujado los polígonos de los sectores (Cargar
archivos → Sectores). Si el punto cae fuera de todos, la barra lo dice y puede
asignarlo manualmente (queda marcado como manual). A cielo abierto el primer
fix puede tardar ~30 s.

**"No puedo editar un ensayo."**
Si está **En revisión** o **Aprobado**, es solo-lectura por diseño. El Jefe de
calidad puede tocar **Editar** en la auditoría para habilitar corrección
(queda trazado).

**"No me deja borrar un ensayo cualquiera."**
El proyecto está en modo "Solo el último creado" (evita huecos de numeración).
El Creador puede cambiar el modo en Configuración → Eliminación de ensayos.

## FLOW (la IA)

**"FLOW dice que el modelo está saturado."**
Reintenta solo; si persiste, toque el ícono de **reintentar** de la respuesta
o pruebe en unos segundos.

**"FLOW no responde sin señal."**
Correcto: la IA necesita internet (el resto de la app no). El briefing de la
bienvenida (pendientes, NC) sí sale de datos locales.

**"El modo voz no arranca / pide reinstalar."**
El módulo de voz es nativo: si el APK es antiguo, actualice la app. Verifique
también el permiso de micrófono del sistema.

**"FLOW no sabe de qué trata mi obra."**
Pida al Creador escribir la **Descripción del proyecto** (Configuración →
Asistente IA). Con eso FLOW deja de interpretar y responde con contexto real.

**"FLOW dice que sus cifras pueden ser parciales."**
Algunos ensayos aún no sincronizaron sus valores numéricos. Abra Tablas
Resumen (o espere la sincronización) y vuelva a preguntar; los conteos y
estados siempre están completos.

## Cuenta y permisos

**"No veo un módulo que antes estaba."**
El Creador lo desactivó en Configuración, o su rol no lo incluye. Los módulos
se prenden por proyecto.

**"Entré con Google y no veo mis proyectos."**
Su cuenta quedó como Visualizador sin accesos. Pida al Creador que le asigne
el proyecto y el rol. Verá los proyectos DEMO mientras tanto (si existen).

**"¿Puedo usar el mismo usuario en dos teléfonos?"**
Sí. Cada teléfono mantiene su copia local y ambos convergen contra la nube.

## Contacto de soporte

WhatsApp del implementador + horario. Ante cualquier duda de datos: **nunca
desinstale la app sin consultar** — si hay pendientes de subir (chip gris/
ámbar), primero sincronice.
