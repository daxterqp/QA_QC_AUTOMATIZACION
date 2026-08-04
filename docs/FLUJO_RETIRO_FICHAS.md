# FLUJO — Retirar una ficha del proyecto (soft-delete con respaldo)

> Para cuando se adopta un tipo de ensayo y después el cliente pide sacarlo.
> **Nunca se borra**: la ficha se retira de la vista y el respaldo queda detrás.
> Complementa `docs/PIPELINE_CREACION_FICHAS.md` y `docs/FLUJO_EDICION_FICHAS.md`.

---

## 1. Qué significa "retirar" aquí

| | Retirar (este flujo) | Borrar de verdad |
|---|---|---|
| La ficha desaparece de la app | Sí | Sí |
| Se puede volver atrás | **Sí, un toque** | No |
| Los datos siguen en la base | **Sí** | No |
| Riesgo | Ninguno | Pérdida irreversible |

El mecanismo es el flag **`protocol_templates.is_hidden`** (v39). No hay `DELETE`:
la plantilla y sus ítems siguen íntegros en la nube y en el dispositivo, solo
marcados. Restaurar = quitar el flag.

---

## 2. Alcance real del ocultamiento (verificado en código)

| Pantalla | Comportamiento con `is_hidden = true` |
|---|---|
| Ensayos — crear nuevo | **Oculto** · si el tipo ya tiene ensayos, la tarjeta sigue visible para no perderlos (`EnsayosScreen`) |
| Ensayos — intento de crear | Bloqueado con aviso, aunque se llegue por otra vía |
| Dossier | **Siempre oculto**, sin excepción (`DossierScreen`) |
| Protocolos por ubicación | **Oculto**, salvo que exista una instancia de ese tipo |
| Configuración del proyecto | **Oculto** (la consulta lo excluye) |
| Detalle de muestra | **Oculto** |
| Cargar archivos → Actividades | Visible **tachado** con la etiqueta "Oculto" (es el panel de administración) |

> **Consecuencia práctica:** si la ficha **no tiene ensayos llenados** —el caso
> típico al retirar algo recién adoptado— el ocultamiento equivale a un borrado:
> no aparece en ninguna pantalla operativa.
>
> Si **sí tiene ensayos**, esos ensayos permanecen visibles **a propósito**: son
> trabajo ya ejecutado y firmado; ocultarlos rompería la trazabilidad del dossier.
> Para sacarlos también, ver §5.

---

## 3. Procedimiento normal (desde la app, sin SQL)

Solo el **CREADOR** lo ve.

1. Proyecto → **Cargar archivos** → pestaña **Actividades**.
2. Ubicar el tipo en "Tipos de ensayo cargados".
3. Tocar el ícono de visibilidad (ojo) de esa fila.
4. La fila queda **tachada** con la etiqueta **Oculto** → ya desapareció del resto de la app.

El cambio se guarda local y se empuja a la nube en el momento; se propaga al
resto de usuarios en su siguiente sincronización.

**Restaurar:** el mismo botón. Vuelve tal cual estaba, con sus ítems y sus ensayos.

---

## 4. Antes de retirar — checklist de 30 segundos

1. **¿Tiene ensayos?** Ensayos → filtrar por ese tipo. Si hay, leer §5.
2. **¿Alguien lo referencia?** Si otra ficha lo llama con `xref-[TIPO]`, esa
   llamada quedará sin fuente. Revisar antes.
3. **¿Está en un plan de protocolos por ubicación?** Las ubicaciones que lo
   esperaban van a mostrar un pendiente que ya nadie puede llenar → actualizar
   el plan.
4. **Respaldo formal** (recomendado si la ficha ya se usó): dejar el snapshot en
   `ficha_edit_backups` antes de tocar nada (§6).

---

## 5. Si la ficha YA tiene ensayos llenados

Retirar el tipo **no** oculta sus ensayos. Opciones, de menor a mayor impacto:

- **Recomendada — dejarlos:** oculta el tipo (no se crean nuevos) y los ensayos
  existentes siguen en su dossier. Es lo correcto cuando el trabajo se ejecutó.
- **Sacarlos del dossier:** mandar esos ensayos a la **papelera** (recuperable,
  módulo v43/v62) uno por uno. Siguen restaurables.
- **Retiro total:** snapshot completo (§6) y luego papelera + ocultar el tipo.

> ⚠ No borrar ensayos con `DELETE` directo: rompe correlativos y referencias.
> La papelera existe justamente para esto.

---

## 6. Respaldo formal antes de un retiro grande (SQL, opcional)

Reutiliza la tabla `ficha_edit_backups` del flujo v95 (RLS sin políticas = solo
service role). Guarda plantilla + ítems + instancias + valores + filas de resumen:

```sql
-- Snapshot ANTES de retirar. Cambiar <TPL_ID> y <PROJECT_ID>.
insert into ficha_edit_backups (id, template_id, project_id, reason, snapshot_json, created_at)
select
  gen_random_uuid(),
  t.id,
  t.project_id,
  'retiro de ficha (soft-delete)',
  jsonb_build_object(
    'template',      to_jsonb(t),
    'template_items',(select coalesce(jsonb_agg(to_jsonb(ti)), '[]'::jsonb)
                        from protocol_template_items ti where ti.template_id = t.id),
    'protocols',     (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                        from protocols p where p.template_id = t.id),
    'protocol_items',(select coalesce(jsonb_agg(to_jsonb(pi)), '[]'::jsonb)
                        from protocol_items pi
                        join protocols p2 on p2.id = pi.protocol_id
                       where p2.template_id = t.id),
    'summary_rows',  (select coalesce(jsonb_agg(to_jsonb(sr)), '[]'::jsonb)
                        from protocol_summary_rows sr
                        join protocols p3 on p3.id = sr.protocol_id
                       where p3.template_id = t.id)
  ),
  (extract(epoch from now()) * 1000)::bigint
from protocol_templates t
where t.id = '<TPL_ID>' and t.project_id = '<PROJECT_ID>';
```

Retirar / restaurar por SQL (equivalente al botón de la app):

```sql
-- RETIRAR
update protocol_templates
   set is_hidden = true,
       updated_at = (extract(epoch from now()) * 1000)::bigint
 where id = '<TPL_ID>';

-- RESTAURAR
update protocol_templates
   set is_hidden = false,
       updated_at = (extract(epoch from now()) * 1000)::bigint
 where id = '<TPL_ID>';
```

> El bump de `updated_at` es **obligatorio**: el sync móvil es last-write-wins
> por ese campo; sin bump el dispositivo puede revertir el cambio.

---

## 7. Verificación después de retirar

1. En el celular: **Sincronizar proyecto** y confirmar que el tipo ya no aparece
   en Ensayos → nuevo, ni en Dossier, ni en Configuración.
2. En la web: refrescar y confirmar lo mismo.
3. Si algo sigue apareciendo, revisar que el push a la nube no haya fallado
   (el toggle avisa en consola si el push falla; el cambio local sí queda).

---

## 8. Caso de referencia

**Mercado Mayorista Plaza Unicachi (2026).** Se adoptaron 4 protocolos que en su
Excel original pertenecían a otra obra (*Áreas Comunes Solara*, cliente GRV 5):
`PPIS`, `PPIE`, `PRE`, `PDA`. Si el cliente pide sacarlos, se retiran con este
flujo: al no tener ensayos llenados, desaparecen por completo de la app y se
pueden restaurar con un toque.
