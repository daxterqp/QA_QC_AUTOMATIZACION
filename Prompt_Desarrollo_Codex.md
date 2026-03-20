# Prompt Maestro para Desarrollo Codex: Proyecto QAQC_Automatizado (S-CUA MVP)

**Contexto General:**
Actúa como un Desarrollador Full-Stack Senior experto en React Native (Expo), TypeScript y AWS Serverless. Vamos a construir el MVP de "S-CUA", una plataforma Offline-First para Aseguramiento y Control de Calidad (QA/QC) en obras de construcción. 

La prioridad arquitectónica es la **ingesta de datos ultrarrápida en campo sin conexión a internet**, capturando fotos e inspecciones en menos de 3 clics y sincronizando en segundo plano cuando se recupere la señal (ej: al salir de un sótano).

---

## 🏗️ Fase 1: Setup del Proyecto y Base de Datos Local (Offline-First)

**Objetivo:** Configurar el entorno de React Native e implementar la base de datos reactiva y ultrarrápida para manejar el modo Offline.

**Instrucciones para Claude/Codex:**
1. Inicializa un proyecto en React Native usando **Expo (Bare Workflow)** con TypeScript.
2. Instala e implementa **WatermelonDB** (SQLite) como motor local reactivo. 
3. Crea el esquema de base de datos local (Schema & Models) en WatermelonDB con las siguientes tablas principales:
   * `projects` (id, name, status)
   * `protocols` (id, project_id, status: "PENDING"|"APPROVED"|"REJECTED", protocol_number, location_reference, latitude, longitude, is_locked)
   * `protocol_items` (id, protocol_id, item_description, is_compliant, comments)
   * `evidences` (id, protocol_item_id, s3_url_placeholder, local_uri, sync_status: "PENDING"|"SYNCED")
4. Configura el adaptador de SQLite y cerciórate de que las clases del modelo (`Model`) extiendan correctamente y tengan las asociaciones `@relation` y `@children` definidas (ej: un Protocol tiene muchos ProtocolItems).

---

## 📸 Fase 2: Módulo de Cámara de Alta Velocidad y Compresión

**Objetivo:** Lograr una captura fotográfica instantánea (en milisegundos) y comprimir la imagen en segundo plano para no bloquear la UI del capataz.

**Instrucciones para Claude/Codex:**
1. Integra la librería `react-native-vision-camera` para acceso nativo de bajo nivel (JSI) a la cámara.
2. Configura la vista de la cámara para que pre-cargue en memoria al abrir el módulo de inspección, garantizando "cero tiempos de carga".
3. Implementa la captura de la foto. Al presionar el obturador, la foto debe guardarse *inmediatamente* en WatermelonDB (tabla `evidences` con `sync_status="PENDING"` y la URI local).
4. Integra `react-native-compressor` (o similar) en un hilo secundario (Background Worker/Task). Cuando la foto se tome, redúcela de ~4MB a ~400KB sin bloquear el hilo principal de React (UI no se debe congelar).

---

## ☁️ Fase 3: Sincronización en Segundo Plano y Subida S3 Directa

**Objetivo:** Subir los datos y fotos a AWS cuando haya señal, delegando el peso de los archivos directamente a S3 sin colapsar el backend.

**Instrucciones para Claude/Codex:**
1. Implementa **NetInfo** para detectar cambios en la conectividad de red.
2. Crea un **Sync Manager** (puedes basarte en el motor de sincronización nativo de WatermelonDB o hacer un Background Fetch custom) que se active al detectar conexión.
3. El proceso de sincronización debe seguir este patrón exacto:
   * La App recolecta todas las fotos (`evidences`) con `sync_status="PENDING"`.
   * Llama a un endpoint de nuestro backend (Ej: `POST /api/upload-urls`) enviando la cantidad de fotos.
   * El Backend responde con un array de **Presigned URLs de Amazon S3**.
   * La App ejecuta la subida local directa (`fetch` o `axios` PUT) del archivo físico `.jpg` hacia esas URLs de S3.
   * Si la subida a S3 fue exitosa (HTTP 200), la app hace una última llamada REST/GraphQL al backend enviando el JSON del protocolo y cambiando el estado local a `sync_status="SYNCED"`.
4. Asegúrate de manejar errores (ej: pérdida de señal a la mitad de la subida) para que la cola se pause y se reanude posteriormente.

---

## 🔐 Fase 4: Validaciones, Middlewares y Trazabilidad (Backend AWS Lambda)

**Objetivo:** Desarrollar los servicios backend que reciben la sincronización, protegen la data (inmutabilidad) y generan el PDF automatizado.

**Instrucciones para Claude/Codex:**
1. Crea un stack Serverless básico (AWS SAM, Serverless Framework o AWS CDK) usando Node.js/TypeScript.
2. **Segregación de Roles:** Implementa un middleware en las funciones Lambda (integrado con AWS Cognito) donde el Rol `OPERATOR` solo puede crear protocolos (quedan en "PENDING"), mientras que los roles `SUPERVISOR|RESIDENT` son los únicos que pueden hacer un PUT para cambiar el estado a "APPROVED".
3. **Inmutabilidad:** En el endpoint de actualización de un Protocolo, si la base de datos (PostgreSQL/Aurora) indica que `is_locked = TRUE`, rechaza cualquier intento de modificación con un HTTP 403 Forbidden. Al aprobar un protocolo, establece este campo en `TRUE`.
4. **Firmado y PDF (Worker):**
   * Configura una AWS SQS queue que se dispare cuando un protocolo pase a estado "APPROVED".
   * Crea una Lambda (suscriptora a esa SQS) que use `PDFKit` (o equivalente ligero).
   * La Lambda debe: Leer la firma del supervisor desde un bucket S3 de firmas, las fotos del protocolo, y construir un PDF inmutable con la fecha/hora del servidor (timestamp backend, no del móvil).
   * Guarda ese PDF en S3 y registra su URL en el registro del protocolo.

---

**Nota para la IA generativa:** 
Por favor, entrégame el código de la Fase 1 primero (Setup y WatermelonDB Models). Espera mi feedback y confirmación de que funciona correctamente antes de proceder a la creación del código de la Fase 2 (Cámara). Mantén un código limpio, fuertemente tipado en TypeScript y modular.
