const tour: Record<string, { es: string; en: string; pt: string }> = {
  // ── Botones / UI del overlay ──
  'tour.skip': { es: 'Saltar tutorial', en: 'Skip tutorial', pt: 'Pular tutorial' },
  'tour.start': { es: 'Empezar', en: 'Start', pt: 'Começar' },
  'tour.exit': { es: 'Salir', en: 'Exit', pt: 'Sair' },
  'tour.back': { es: 'Atrás', en: 'Back', pt: 'Voltar' },
  'tour.finish': { es: 'Finalizar', en: 'Finish', pt: 'Concluir' },
  'tour.next': { es: 'Siguiente', en: 'Next', pt: 'Próximo' },
  'tour.waitingHintDefault': { es: 'Navega a la pantalla del siguiente paso', en: 'Go to the next step’s screen', pt: 'Navegue até a tela do próximo passo' },
  // ── 0: Bienvenida ──
  'tour.welcome.title': {
    es: '¡Bienvenido a Flow-QA/QC!',
    en: 'Welcome to Flow-QA/QC!',
    pt: 'Bem-vindo ao Flow-QA/QC!',
  },
  'tour.welcome.message': {
    es: 'Sistema de Control de Calidad para proyectos de construcción. Te guiaremos por todas las funciones principales paso a paso.',
    en: 'Quality Control system for construction projects. We will guide you through all the main features step by step.',
    pt: 'Sistema de Controle de Qualidade para projetos de construção. Vamos guiá-lo por todas as funções principais passo a passo.',
  },

  // ── 1-7: Pantalla Proyectos ──
  'tour.nav_new_btn.title': {
    es: 'Crear Nuevo Proyecto',
    en: 'Create New Project',
    pt: 'Criar Novo Projeto',
  },
  'tour.nav_new_btn.message': {
    es: 'Los Jefes de Obra y Creadores pueden iniciar un nuevo proyecto de calidad. Se define nombre y contraseña de acceso.',
    en: 'Site Managers and Creators can start a new quality project. A name and access password are defined.',
    pt: 'Os Gerentes de Obra e Criadores podem iniciar um novo projeto de qualidade. Define-se nome e senha de acesso.',
  },
  'tour.nav_join_btn.title': {
    es: 'Ingresar a un Proyecto',
    en: 'Join a Project',
    pt: 'Entrar em um Projeto',
  },
  'tour.nav_join_btn.message': {
    es: 'Si un Jefe de Obra ya creó el proyecto, únete usando el nombre exacto del proyecto y su contraseña de acceso.',
    en: 'If a Site Manager has already created the project, join using the exact project name and its access password.',
    pt: 'Se um Gerente de Obra já criou o projeto, junte-se usando o nome exato do projeto e sua senha de acesso.',
  },
  'tour.nav_dashboard_btn.title': {
    es: 'Dashboard de Estadísticas',
    en: 'Statistics Dashboard',
    pt: 'Painel de Estatísticas',
  },
  'tour.nav_dashboard_btn.message': {
    es: 'Accede al resumen estadístico de todos tus proyectos: protocolos aprobados, pendientes, no conformidades y avance semanal.',
    en: 'Access the statistical summary of all your projects: approved protocols, pending ones, non-conformities and weekly progress.',
    pt: 'Acesse o resumo estatístico de todos os seus projetos: protocolos aprovados, pendentes, não conformidades e avanço semanal.',
  },
  'tour.project_card.title': {
    es: 'Tarjeta de Proyecto',
    en: 'Project Card',
    pt: 'Cartão do Projeto',
  },
  'tour.project_card.message': {
    es: 'Cada tarjeta representa un proyecto. Toca el nombre para entrar y explorar sus ubicaciones de inspección.',
    en: 'Each card represents a project. Tap the name to enter and explore its inspection locations.',
    pt: 'Cada cartão representa um projeto. Toque no nome para entrar e explorar seus locais de inspeção.',
  },
  'tour.project_observaciones_chip.title': {
    es: 'Observaciones del Proyecto',
    en: 'Project Observations',
    pt: 'Observações do Projeto',
  },
  'tour.project_observaciones_chip.message': {
    es: 'Accede directamente al tablón de observaciones del plano: comentarios entre supervisores QC y el Jefe de Obra.',
    en: 'Access the drawing observations board directly: comments between QC supervisors and the Site Manager.',
    pt: 'Acesse diretamente o quadro de observações da planta: comentários entre supervisores de QC e o Gerente de Obra.',
  },
  'tour.project_dosier_chip.title': {
    es: 'Dosier del Proyecto',
    en: 'Project Dossier',
    pt: 'Dossiê do Projeto',
  },
  'tour.project_dosier_chip.message': {
    es: 'El expediente de calidad: todos los protocolos aprobados organizados por especialidad, listos para exportar en PDF.',
    en: 'The quality file: all approved protocols organized by discipline, ready to export as PDF.',
    pt: 'O processo de qualidade: todos os protocolos aprovados organizados por especialidade, prontos para exportar em PDF.',
  },
  'tour.project_cargar_chip.title': {
    es: 'Cargar Archivos',
    en: 'Upload Files',
    pt: 'Carregar Arquivos',
  },
  'tour.project_cargar_chip.message': {
    es: 'Al entrar al proyecto, tap en "Cargar archivos" para subir protocolos, ubicaciones, equipos, sectores y planos.',
    en: 'When entering the project, tap "Upload files" to upload protocols, locations, equipment, sectors and drawings.',
    pt: 'Ao entrar no projeto, toque em "Carregar arquivos" para enviar protocolos, locais, equipamentos, setores e plantas.',
  },

  // ── 8-10: LocationList ──
  'tour.location_item.title': {
    es: 'Ubicaciones del Proyecto',
    en: 'Project Locations',
    pt: 'Locais do Projeto',
  },
  'tour.location_item.message': {
    es: 'Cada ubicación es un sector o área del proyecto con sus propios protocolos de control de calidad asignados.',
    en: 'Each location is a sector or area of the project with its own assigned quality control protocols.',
    pt: 'Cada local é um setor ou área do projeto com seus próprios protocolos de controle de qualidade atribuídos.',
  },
  'tour.location_item.waitingHint': {
    es: 'Toca el nombre del proyecto para ingresar',
    en: 'Tap the project name to enter',
    pt: 'Toque no nome do projeto para entrar',
  },
  'tour.location_filters.title': {
    es: 'Filtros de Ubicación',
    en: 'Location Filters',
    pt: 'Filtros de Local',
  },
  'tour.location_filters.message': {
    es: 'Filtra las ubicaciones por nombre o por especialidad para encontrar rápidamente el sector que necesitas inspeccionar.',
    en: 'Filter locations by name or discipline to quickly find the sector you need to inspect.',
    pt: 'Filtre os locais por nome ou por especialidade para encontrar rapidamente o setor que precisa inspecionar.',
  },
  'tour.location_progress_bar.title': {
    es: 'Progreso de Protocolos',
    en: 'Protocol Progress',
    pt: 'Progresso dos Protocolos',
  },
  'tour.location_progress_bar.message': {
    es: 'El indicador numérico muestra cuántos protocolos han sido aprobados del total asignado a esta ubicación. Toca la ubicación para ver sus protocolos.',
    en: 'The numeric indicator shows how many protocols have been approved out of the total assigned to this location. Tap the location to view its protocols.',
    pt: 'O indicador numérico mostra quantos protocolos foram aprovados do total atribuído a este local. Toque no local para ver seus protocolos.',
  },

  // ── 11: LocationProtocols ──
  'tour.protocol_row.title': {
    es: 'Protocolos de Inspección',
    en: 'Inspection Protocols',
    pt: 'Protocolos de Inspeção',
  },
  'tour.protocol_row.message': {
    es: 'Cada fila es un protocolo. La barra de color izquierda indica el estado: naranja = pendiente, verde = aprobado, rojo = rechazado.',
    en: 'Each row is a protocol. The left color bar indicates the status: orange = pending, green = approved, red = rejected.',
    pt: 'Cada linha é um protocolo. A barra de cor à esquerda indica o estado: laranja = pendente, verde = aprovado, vermelho = rejeitado.',
  },
  'tour.protocol_row.waitingHint': {
    es: 'Toca una ubicación para ver sus protocolos',
    en: 'Tap a location to view its protocols',
    pt: 'Toque em um local para ver seus protocolos',
  },

  // ── 12-14: ProtocolFill ──
  'tour.protocol_item_row.title': {
    es: 'Ítems de Inspección',
    en: 'Inspection Items',
    pt: 'Itens de Inspeção',
  },
  'tour.protocol_item_row.message': {
    es: 'Cada ítem es un punto de control. Márcalo con: Sí ✔ si cumple, No ✗ si no cumple, o N/A cuando la pregunta no aplica a este proyecto específico.',
    en: 'Each item is a control point. Mark it with: Yes ✔ if it complies, No ✗ if it does not comply, or N/A when the question does not apply to this specific project.',
    pt: 'Cada item é um ponto de controle. Marque com: Sim ✔ se atende, Não ✗ se não atende, ou N/A quando a pergunta não se aplica a este projeto específico.',
  },
  'tour.protocol_item_row.waitingHint': {
    es: 'Toca un protocolo para llenarlo',
    en: 'Tap a protocol to fill it out',
    pt: 'Toque em um protocolo para preenchê-lo',
  },
  'tour.protocol_camera_btn.title': {
    es: 'Evidencia Fotográfica',
    en: 'Photographic Evidence',
    pt: 'Evidência Fotográfica',
  },
  'tour.protocol_camera_btn.message': {
    es: 'Toma una foto como evidencia del ítem. Se estampa automáticamente con fecha, hora y logo del proyecto.',
    en: 'Take a photo as evidence of the item. It is automatically stamped with date, time and project logo.',
    pt: 'Tire uma foto como evidência do item. É carimbada automaticamente com data, hora e logo do projeto.',
  },
  'tour.protocol_submit_btn.title': {
    es: 'Enviar para Aprobación',
    en: 'Submit for Approval',
    pt: 'Enviar para Aprovação',
  },
  'tour.protocol_submit_btn.message': {
    es: 'Con todos los ítems completados, envía el protocolo al Jefe de Obra para su revisión y aprobación formal.',
    en: 'With all items completed, submit the protocol to the Site Manager for formal review and approval.',
    pt: 'Com todos os itens preenchidos, envie o protocolo ao Gerente de Obra para revisão e aprovação formal.',
  },

  // ── 15-22: PlanViewer ──
  'tour.plan_viewer_draw_toggle.title': {
    es: 'Anotar el Plano',
    en: 'Annotate the Drawing',
    pt: 'Anotar a Planta',
  },
  'tour.plan_viewer_draw_toggle.message': {
    es: 'Activa el botón "+ Anotar plano" para marcar observaciones:\n• Toca el plano → crea un punto de observación puntual\n• Arrastra en el plano → dibuja un recuadro de área\nCada anotación queda numerada y genera un hilo de comentarios para el equipo.',
    en: 'Activate the "+ Annotate drawing" button to mark observations:\n• Tap the drawing → creates a point observation\n• Drag on the drawing → draws an area box\nEach annotation is numbered and generates a comment thread for the team.',
    pt: 'Ative o botão "+ Anotar planta" para marcar observações:\n• Toque na planta → cria um ponto de observação pontual\n• Arraste na planta → desenha um retângulo de área\nCada anotação fica numerada e gera um fio de comentários para a equipe.',
  },
  'tour.plan_viewer_draw_toggle.waitingHint': {
    es: 'Toca el botón "Planos" para abrir el visor',
    en: 'Tap the "Drawings" button to open the viewer',
    pt: 'Toque no botão "Plantas" para abrir o visualizador',
  },
  'tour.plan_measurement_btn.title': {
    es: 'Medición sobre el Plano',
    en: 'Measurement on the Drawing',
    pt: 'Medição sobre a Planta',
  },
  'tour.plan_measurement_btn.message': {
    es: 'El botón con icono de cinta métrica abre el módulo de Medición para este mismo plano. Podrás calibrar, medir distancias, áreas y calcular ladrillos, volumen y locetas sin salir del visor.',
    en: 'The button with the tape measure icon opens the Measurement module for this same drawing. You can calibrate, measure distances and areas, and calculate bricks, volume and tiles without leaving the viewer.',
    pt: 'O botão com o ícone de trena abre o módulo de Medição para esta mesma planta. Você poderá calibrar, medir distâncias, áreas e calcular tijolos, volume e ladrilhos sem sair do visualizador.',
  },
  'tour.plan_measurement_btn.waitingHint': {
    es: 'Permanece en el visor de planos para ver esta opción',
    en: 'Stay in the drawing viewer to see this option',
    pt: 'Permaneça no visualizador de plantas para ver esta opção',
  },
  'tour.plan_zoom_options.title': {
    es: 'Control de Zoom',
    en: 'Zoom Control',
    pt: 'Controle de Zoom',
  },
  'tour.plan_zoom_options.message': {
    es: 'Cambia la escala con los botones de la barra superior derecha:\n• 1x → vista normal\n• 1.5x / 2x → detalle medio\n• 3x → máximo detalle para inspección fina',
    en: 'Change the scale with the buttons on the top right bar:\n• 1x → normal view\n• 1.5x / 2x → medium detail\n• 3x → maximum detail for fine inspection',
    pt: 'Altere a escala com os botões da barra superior direita:\n• 1x → visualização normal\n• 1.5x / 2x → detalhe médio\n• 3x → detalhe máximo para inspeção fina',
  },
  'tour.plan_zoom_options.waitingHint': {
    es: 'Permanece en el visor de planos para ver esta opción',
    en: 'Stay in the drawing viewer to see this option',
    pt: 'Permaneça no visualizador de plantas para ver esta opção',
  },
  'tour.plan_selector.title': {
    es: 'Cambiar entre Planos',
    en: 'Switch Between Drawings',
    pt: 'Alternar entre Plantas',
  },
  'tour.plan_selector.message': {
    es: 'El selector "PLANO ACTIVO" debajo del encabezado muestra el plano actual. Si la ubicación tiene varios planos PDF cargados:\n• Toca el selector → se despliega la lista con todos los planos disponibles\n• Elige otro plano → el visor lo carga sin salir de la pantalla\nSolo aparece cuando hay más de un plano asociado a la ubicación.',
    en: 'The "ACTIVE DRAWING" selector below the header shows the current drawing. If the location has several PDF drawings loaded:\n• Tap the selector → the list of all available drawings expands\n• Choose another drawing → the viewer loads it without leaving the screen\nIt only appears when there is more than one drawing associated with the location.',
    pt: 'O seletor "PLANTA ATIVA" abaixo do cabeçalho mostra a planta atual. Se o local tiver várias plantas PDF carregadas:\n• Toque no seletor → exibe a lista com todas as plantas disponíveis\n• Escolha outra planta → o visualizador a carrega sem sair da tela\nSó aparece quando há mais de uma planta associada ao local.',
  },
  'tour.plan_selector.waitingHint': {
    es: 'Solo aparece si la ubicación tiene más de un plano. Toca Siguiente si no aparece.',
    en: 'It only appears if the location has more than one drawing. Tap Next if it does not appear.',
    pt: 'Só aparece se o local tiver mais de uma planta. Toque em Próximo se não aparecer.',
  },
  'tour.plan_viewer_annotation_list.title': {
    es: 'Lista de Observaciones del Plano',
    en: 'Drawing Observations List',
    pt: 'Lista de Observações da Planta',
  },
  'tour.plan_viewer_annotation_list.message': {
    es: 'La sección "OBSERVACIONES" al final de la pantalla lista todas las marcas del plano. Cada tarjeta muestra el número, comentario y estado (pendiente/cerrado).',
    en: 'The "OBSERVATIONS" section at the bottom of the screen lists all the marks on the drawing. Each card shows the number, comment and status (pending/closed).',
    pt: 'A seção "OBSERVAÇÕES" no final da tela lista todas as marcas da planta. Cada cartão mostra o número, comentário e estado (pendente/fechado).',
  },
  'tour.plan_reply_btn.title': {
    es: 'Agregar Comentario',
    en: 'Add Comment',
    pt: 'Adicionar Comentário',
  },
  'tour.plan_reply_btn.message': {
    es: 'El botón "+ Responder" abre el formulario para escribir un comentario y adjuntar fotos como evidencia. Toda la conversación queda registrada para el equipo.',
    en: 'The "+ Reply" button opens the form to write a comment and attach photos as evidence. The entire conversation is recorded for the team.',
    pt: 'O botão "+ Responder" abre o formulário para escrever um comentário e anexar fotos como evidência. Toda a conversa fica registrada para a equipe.',
  },
  'tour.plan_reply_btn.waitingHint': {
    es: 'Toca la observación para desplegarla',
    en: 'Tap the observation to expand it',
    pt: 'Toque na observação para expandi-la',
  },
  'tour.plan_reply_form.title': {
    es: 'Comentarios y Evidencia Fotográfica',
    en: 'Comments and Photographic Evidence',
    pt: 'Comentários e Evidência Fotográfica',
  },
  'tour.plan_reply_form.message': {
    es: 'Escribe tu comentario y adjunta fotos como evidencia. El ícono de cámara captura la evidencia fotográfica. Toda la conversación queda registrada formando un hilo de información del equipo.',
    en: 'Write your comment and attach photos as evidence. The camera icon captures the photographic evidence. The entire conversation is recorded, forming an information thread for the team.',
    pt: 'Escreva seu comentário e anexe fotos como evidência. O ícone de câmera captura a evidência fotográfica. Toda a conversa fica registrada, formando um fio de informação da equipe.',
  },
  'tour.plan_reply_form.waitingHint': {
    es: 'Toca "+ Responder" para abrir el formulario',
    en: 'Tap "+ Reply" to open the form',
    pt: 'Toque em "+ Responder" para abrir o formulário',
  },
  'tour.plan_dwg_btn.title': {
    es: 'Archivo DWG',
    en: 'DWG File',
    pt: 'Arquivo DWG',
  },
  'tour.plan_dwg_btn.message': {
    es: 'El botón "DWG" en la esquina superior derecha abre el archivo técnico del plano en formato DWG. Solo aparece cuando el proyecto tiene un archivo DWG cargado en esa ubicación.',
    en: 'The "DWG" button in the top right corner opens the technical drawing file in DWG format. It only appears when the project has a DWG file loaded in that location.',
    pt: 'O botão "DWG" no canto superior direito abre o arquivo técnico da planta em formato DWG. Só aparece quando o projeto tem um arquivo DWG carregado nesse local.',
  },
  'tour.plan_dwg_btn.waitingHint': {
    es: 'Solo aparece si el proyecto tiene archivo DWG cargado. Toca Siguiente para continuar si no aparece.',
    en: 'It only appears if the project has a DWG file loaded. Tap Next to continue if it does not appear.',
    pt: 'Só aparece se o projeto tiver um arquivo DWG carregado. Toque em Próximo para continuar se não aparecer.',
  },

  // ── Puente → AnnotationComments ──
  'tour.bridge_to_observaciones.title': {
    es: '¡Sigamos explorando funcionalidades!',
    en: "Let's keep exploring features!",
    pt: 'Vamos continuar explorando funcionalidades!',
  },
  'tour.bridge_to_observaciones.message': {
    es: 'Ahora veremos el Tablón de Observaciones del plano.',
    en: 'Now we will look at the drawing Observations Board.',
    pt: 'Agora veremos o Quadro de Observações da planta.',
  },

  // ── AnnotationComments ──
  'tour.annotation_row.title': {
    es: 'Tablón de Observaciones',
    en: 'Observations Board',
    pt: 'Quadro de Observações',
  },
  'tour.annotation_row.message': {
    es: 'Aquí se listan todas las observaciones marcadas sobre los planos. Cada tarjeta muestra el número de protocolo, ubicación, comentario inicial y la última respuesta del equipo.',
    en: 'Here all the observations marked on the drawings are listed. Each card shows the protocol number, location, initial comment and the latest team reply.',
    pt: 'Aqui são listadas todas as observações marcadas sobre as plantas. Cada cartão mostra o número do protocolo, local, comentário inicial e a última resposta da equipe.',
  },
  'tour.annotation_row.waitingHint': {
    es: 'Toca "Observaciones" en la tarjeta del proyecto',
    en: 'Tap "Observations" on the project card',
    pt: 'Toque em "Observações" no cartão do projeto',
  },
  'tour.annotation_status_badge.title': {
    es: 'Estado de la Observación',
    en: 'Observation Status',
    pt: 'Estado da Observação',
  },
  'tour.annotation_status_badge.message': {
    es: 'El borde de color indica el estado: rojo = abierta/pendiente, verde = cerrada/resuelta. El Jefe de Obra puede marcarla como "Completado" cuando el equipo resuelve el problema.',
    en: 'The colored border indicates the status: red = open/pending, green = closed/resolved. The Site Manager can mark it as "Completed" when the team resolves the issue.',
    pt: 'A borda colorida indica o estado: vermelho = aberta/pendente, verde = fechada/resolvida. O Gerente de Obra pode marcá-la como "Concluído" quando a equipe resolve o problema.',
  },
  'tour.annotation_tap_row.title': {
    es: 'Acceso Directo al Plano',
    en: 'Direct Access to the Drawing',
    pt: 'Acesso Direto à Planta',
  },
  'tour.annotation_tap_row.message': {
    es: 'Toca cualquier observación para ir directamente al plano PDF donde fue marcada. Verás la anotación resaltada con su número y contexto exacto.',
    en: 'Tap any observation to go directly to the PDF drawing where it was marked. You will see the annotation highlighted with its number and exact context.',
    pt: 'Toque em qualquer observação para ir diretamente à planta PDF onde foi marcada. Você verá a anotação destacada com seu número e contexto exato.',
  },
  'tour.plan_header_info.title': {
    es: 'Plano de la Observación',
    en: 'Observation Drawing',
    pt: 'Planta da Observação',
  },
  'tour.plan_header_info.message': {
    es: 'Nos lleva directamente al plano donde se realizó la observación. El encabezado superior muestra el número de protocolo y la ubicación exacta.',
    en: 'It takes us directly to the drawing where the observation was made. The top header shows the protocol number and the exact location.',
    pt: 'Leva-nos diretamente à planta onde a observação foi feita. O cabeçalho superior mostra o número do protocolo e o local exato.',
  },
  'tour.plan_header_info.waitingHint': {
    es: 'Toca la observación para ir al plano',
    en: 'Tap the observation to go to the drawing',
    pt: 'Toque na observação para ir à planta',
  },

  // ── Puente → Planos (medición) ──
  'tour.bridge_to_planos.title': {
    es: 'Exploremos el apartado de Planos',
    en: "Let's explore the Drawings section",
    pt: 'Vamos explorar a seção de Plantas',
  },
  'tour.bridge_to_planos.message': {
    es: 'Vamos al módulo de Planos donde puedes medir distancias, áreas y volúmenes directamente sobre los PDFs.',
    en: 'Let us go to the Drawings module where you can measure distances, areas and volumes directly on the PDFs.',
    pt: 'Vamos ao módulo de Plantas onde você pode medir distâncias, áreas e volumes diretamente sobre os PDFs.',
  },
  'tour.planos_button.title': {
    es: 'Acceso a Planos',
    en: 'Access to Drawings',
    pt: 'Acesso a Plantas',
  },
  'tour.planos_button.message': {
    es: 'Al entrar a un proyecto, tap en "Planos" en el menú intermedio para ver todos los planos disponibles.',
    en: 'When entering a project, tap "Drawings" in the intermediate menu to view all available drawings.',
    pt: 'Ao entrar em um projeto, toque em "Plantas" no menu intermediário para ver todas as plantas disponíveis.',
  },
  'tour.planos_button.waitingHint': {
    es: 'Toca un proyecto y luego "Planos"',
    en: 'Tap a project and then "Drawings"',
    pt: 'Toque em um projeto e depois em "Plantas"',
  },
  'tour.planos_list_card.title': {
    es: 'Lista de Planos por Especialidad',
    en: 'Drawings List by Discipline',
    pt: 'Lista de Plantas por Especialidade',
  },
  'tour.planos_list_card.message': {
    es: 'Los planos están agrupados por especialidad (Arquitectura, Cimentación, Estructuras, etc.). Toca el encabezado de cada especialidad para desplegar u ocultar sus planos. Dentro de cada grupo, toca un plano para entrar al modo de medición.',
    en: 'The drawings are grouped by discipline (Architecture, Foundations, Structures, etc.). Tap the header of each discipline to expand or hide its drawings. Within each group, tap a drawing to enter measurement mode.',
    pt: 'As plantas estão agrupadas por especialidade (Arquitetura, Fundações, Estruturas, etc.). Toque no cabeçalho de cada especialidade para expandir ou ocultar suas plantas. Dentro de cada grupo, toque em uma planta para entrar no modo de medição.',
  },
  'tour.planos_list_card.waitingHint': {
    es: 'Despliega una especialidad y toca un plano',
    en: 'Expand a discipline and tap a drawing',
    pt: 'Expanda uma especialidade e toque em uma planta',
  },

  // ── Medición: herramientas ──
  'tour.measurement_pan.title': {
    es: 'Mover (Pan)',
    en: 'Move (Pan)',
    pt: 'Mover (Pan)',
  },
  'tour.measurement_pan.message': {
    es: 'Herramienta por defecto. Arrastra con un dedo para mover el plano y pellizca con dos dedos para hacer zoom hasta 20x.',
    en: 'Default tool. Drag with one finger to move the drawing and pinch with two fingers to zoom up to 20x.',
    pt: 'Ferramenta padrão. Arraste com um dedo para mover a planta e pince com dois dedos para dar zoom até 20x.',
  },
  'tour.measurement_pan.waitingHint': {
    es: 'Toca un plano para abrir modo medición',
    en: 'Tap a drawing to open measurement mode',
    pt: 'Toque em uma planta para abrir o modo de medição',
  },
  'tour.measurement_calibrate.title': {
    es: 'Calibración',
    en: 'Calibration',
    pt: 'Calibração',
  },
  'tour.measurement_calibrate.message': {
    es: 'Paso obligatorio antes de medir. Arrastra una línea sobre una medida conocida del plano (por ejemplo 5 m), escribe esa medida real en el recuadro y pulsa ✓. La app convertirá píxeles a metros para todas las mediciones.',
    en: 'Mandatory step before measuring. Drag a line over a known measurement on the drawing (for example 5 m), enter that real measurement in the box and press ✓. The app will convert pixels to meters for all measurements.',
    pt: 'Passo obrigatório antes de medir. Arraste uma linha sobre uma medida conhecida da planta (por exemplo 5 m), digite essa medida real na caixa e pressione ✓. O app converterá pixels em metros para todas as medições.',
  },
  'tour.measurement_measure.title': {
    es: 'Medir distancia',
    en: 'Measure distance',
    pt: 'Medir distância',
  },
  'tour.measurement_measure.message': {
    es: 'Arrastra dos puntos para crear una cota. Al tocar un segmento existente puedes editar sus extremos. Para eliminar, selecciona la línea y toca el icono de papelera.',
    en: 'Drag two points to create a dimension. By tapping an existing segment you can edit its endpoints. To delete, select the line and tap the trash icon.',
    pt: 'Arraste dois pontos para criar uma cota. Ao tocar em um segmento existente você pode editar suas extremidades. Para excluir, selecione a linha e toque no ícone de lixeira.',
  },
  'tour.measurement_polyline.title': {
    es: 'Trazo (Polilínea)',
    en: 'Path (Polyline)',
    pt: 'Traço (Polilinha)',
  },
  'tour.measurement_polyline.message': {
    es: 'Toca en secuencia para agregar vértices. Toca cerca del primer punto para cerrar la figura. Usa "Atrás" para deshacer el último vértice y "Listo" para finalizar. Al seleccionar un trazo puedes extenderlo, calcular ladrillos/volumen o eliminarlo.',
    en: 'Tap in sequence to add vertices. Tap near the first point to close the figure. Use "Back" to undo the last vertex and "Done" to finish. When selecting a path you can extend it, calculate bricks/volume or delete it.',
    pt: 'Toque em sequência para adicionar vértices. Toque perto do primeiro ponto para fechar a figura. Use "Voltar" para desfazer o último vértice e "Pronto" para finalizar. Ao selecionar um traço você pode estendê-lo, calcular tijolos/volume ou excluí-lo.',
  },
  'tour.measurement_sketch.title': {
    es: 'Dibujar a mano alzada',
    en: 'Freehand drawing',
    pt: 'Desenhar à mão livre',
  },
  'tour.measurement_sketch.message': {
    es: 'Traza con el dedo como si fuera un lápiz. Al soltar, la app simplifica y suaviza el contorno automáticamente para convertirlo en un trazo editable.',
    en: 'Draw with your finger as if it were a pencil. When you release, the app automatically simplifies and smooths the outline to turn it into an editable path.',
    pt: 'Trace com o dedo como se fosse um lápis. Ao soltar, o app simplifica e suaviza o contorno automaticamente para convertê-lo em um traço editável.',
  },
  'tour.measurement_print.title': {
    es: 'Imprimir',
    en: 'Print',
    pt: 'Imprimir',
  },
  'tour.measurement_print.message': {
    es: 'Genera un PDF del plano con TODAS las anotaciones visibles (cotas, trazos, áreas) y abre el diálogo para compartirlo o guardarlo.',
    en: 'Generates a PDF of the drawing with ALL visible annotations (dimensions, paths, areas) and opens the dialog to share or save it.',
    pt: 'Gera um PDF da planta com TODAS as anotações visíveis (cotas, traços, áreas) e abre a caixa de diálogo para compartilhá-lo ou salvá-lo.',
  },
  'tour.measurement_toggle_area.title': {
    es: 'Mostrar / Ocultar Áreas',
    en: 'Show / Hide Areas',
    pt: 'Mostrar / Ocultar Áreas',
  },
  'tour.measurement_toggle_area.message': {
    es: 'Activa este toggle (letra A) para que se muestre el relleno y la etiqueta de m² en todos los polígonos cerrados. Útil para verificar superficies de losas, habitaciones o zonas de trabajo. Desactívalo si quieres ver el plano sin sombras.',
    en: 'Activate this toggle (letter A) to display the fill and the m² label on all closed polygons. Useful for verifying surfaces of slabs, rooms or work zones. Deactivate it if you want to see the drawing without shading.',
    pt: 'Ative este botão (letra A) para exibir o preenchimento e o rótulo de m² em todos os polígonos fechados. Útil para verificar superfícies de lajes, ambientes ou zonas de trabalho. Desative-o se quiser ver a planta sem sombras.',
  },
  'tour.measurement_toggle_angles.title': {
    es: 'Mostrar / Ocultar Ángulos',
    en: 'Show / Hide Angles',
    pt: 'Mostrar / Ocultar Ângulos',
  },
  'tour.measurement_toggle_angles.message': {
    es: 'Activa el toggle de ángulos (θ°) para ver el ángulo interior en cada vértice de polilíneas y polígonos. Ideal para verificar esquinas a 90°, alineamientos o ángulos de diseño. Los arcos dibujan siempre el ángulo interno (el más corto).',
    en: 'Activate the angles toggle (θ°) to see the interior angle at each vertex of polylines and polygons. Ideal for verifying 90° corners, alignments or design angles. The arcs always draw the interior angle (the shortest one).',
    pt: 'Ative o botão de ângulos (θ°) para ver o ângulo interno em cada vértice de polilinhas e polígonos. Ideal para verificar cantos a 90°, alinhamentos ou ângulos de projeto. Os arcos desenham sempre o ângulo interno (o mais curto).',
  },
  'tour.measurement_fab_bricks.title': {
    es: 'Metrado de Ladrillos',
    en: 'Brick Takeoff',
    pt: 'Quantitativo de Tijolos',
  },
  'tour.measurement_fab_bricks.message': {
    es: 'Selecciona primero un trazo (polilínea = perímetro de muro) o un área (polígono) y toca este botón. Ingresa altura de pared, tipo de ladrillo (KK18, pandereta, caravista, hueco…), junta y % de desperdicio, y la app calcula el total de unidades. El resultado queda guardado en el elemento.',
    en: 'First select a path (polyline = wall perimeter) or an area (polygon) and tap this button. Enter wall height, brick type (KK18, pandereta, exposed, hollow…), joint and waste %, and the app calculates the total units. The result is saved in the element.',
    pt: 'Selecione primeiro um traço (polilinha = perímetro de muro) ou uma área (polígono) e toque neste botão. Insira a altura da parede, tipo de tijolo (KK18, pandereta, aparente, vazado…), junta e % de desperdício, e o app calcula o total de unidades. O resultado fica salvo no elemento.',
  },
  'tour.measurement_fab_bricks.waitingHint': {
    es: 'Primero traza un polígono o polilínea y selecciónalo',
    en: 'First draw a polygon or polyline and select it',
    pt: 'Primeiro desenhe um polígono ou polilinha e selecione-o',
  },
  'tour.measurement_fab_volume.title': {
    es: 'Metrado de Volumen',
    en: 'Volume Takeoff',
    pt: 'Quantitativo de Volume',
  },
  'tour.measurement_fab_volume.message': {
    es: 'Con un trazo o área seleccionado, este botón calcula volumen en m³:\n• Polígono: área × altura (útil para losas, zapatas, falsos techos)\n• Polilínea: perímetro × altura × espesor (útil para sobrecimientos y muros de concreto)\nEl valor queda persistido en el elemento.',
    en: 'With a path or area selected, this button calculates volume in m³:\n• Polygon: area × height (useful for slabs, footings, dropped ceilings)\n• Polyline: perimeter × height × thickness (useful for stem walls and concrete walls)\nThe value is persisted in the element.',
    pt: 'Com um traço ou área selecionado, este botão calcula o volume em m³:\n• Polígono: área × altura (útil para lajes, sapatas, forros)\n• Polilinha: perímetro × altura × espessura (útil para baldrames e muros de concreto)\nO valor fica persistido no elemento.',
  },
  'tour.measurement_fab_tiles.title': {
    es: 'Metrado de Locetas / Cerámicos',
    en: 'Tiles / Ceramics Takeoff',
    pt: 'Quantitativo de Ladrilhos / Cerâmicos',
  },
  'tour.measurement_fab_tiles.message': {
    es: 'Con un área (polígono) seleccionada, calcula cuántas piezas de cerámico, porcelanato o loseta necesitas según el formato elegido (30×30, 45×45, 60×60, etc.), considerando junta y % de desperdicio. Ideal para pisos y enchapes.',
    en: 'With an area (polygon) selected, it calculates how many pieces of ceramic, porcelain or tile you need according to the chosen format (30×30, 45×45, 60×60, etc.), considering joint and waste %. Ideal for floors and wall claddings.',
    pt: 'Com uma área (polígono) selecionada, calcula quantas peças de cerâmica, porcelanato ou ladrilho você precisa conforme o formato escolhido (30×30, 45×45, 60×60, etc.), considerando junta e % de desperdício. Ideal para pisos e revestimentos.',
  },
  'tour.measurement_fab_calc.title': {
    es: 'Calculadora flotante',
    en: 'Floating calculator',
    pt: 'Calculadora flutuante',
  },
  'tour.measurement_fab_calc.message': {
    es: 'Abre una calculadora simple con operaciones + − × ÷ y paréntesis, útil para sumar metrados sin salir del plano.',
    en: 'Opens a simple calculator with + − × ÷ operations and parentheses, useful for adding up takeoffs without leaving the drawing.',
    pt: 'Abre uma calculadora simples com operações + − × ÷ e parênteses, útil para somar quantitativos sem sair da planta.',
  },

  // ── Puente → Dossier ──
  'tour.bridge_to_dossier.title': {
    es: '¡Sigamos explorando funcionalidades!',
    en: "Let's keep exploring features!",
    pt: 'Vamos continuar explorando funcionalidades!',
  },
  'tour.bridge_to_dossier.message': {
    es: 'Ahora veremos el Dosier del proyecto.',
    en: 'Now we will look at the project Dossier.',
    pt: 'Agora veremos o Dossiê do projeto.',
  },

  // ── Dossier ──
  'tour.dossier_protocol_list.title': {
    es: 'Dosier del Proyecto',
    en: 'Project Dossier',
    pt: 'Dossiê do Projeto',
  },
  'tour.dossier_protocol_list.message': {
    es: 'Reúne todos los protocolos enviados a revisión organizados por fecha.\nLa franja de color indica el estado:\n• Naranja: pendiente de aprobación\n• Verde: aprobado por el Jefe de Obra\n• Rojo: rechazado, requiere correcciones\nToca cualquier tarjeta para ver el protocolo completo con sus ítems y evidencias.',
    en: 'It gathers all protocols submitted for review organized by date.\nThe color strip indicates the status:\n• Orange: pending approval\n• Green: approved by the Site Manager\n• Red: rejected, requires corrections\nTap any card to view the full protocol with its items and evidence.',
    pt: 'Reúne todos os protocolos enviados para revisão organizados por data.\nA faixa de cor indica o estado:\n• Laranja: pendente de aprovação\n• Verde: aprovado pelo Gerente de Obra\n• Vermelho: rejeitado, requer correções\nToque em qualquer cartão para ver o protocolo completo com seus itens e evidências.',
  },
  'tour.dossier_protocol_list.waitingHint': {
    es: 'Toca "Dosier" en la tarjeta del proyecto',
    en: 'Tap "Dossier" on the project card',
    pt: 'Toque em "Dossiê" no cartão do projeto',
  },
  'tour.dossier_protocol_header.title': {
    es: 'Protocolo Realizado',
    en: 'Completed Protocol',
    pt: 'Protocolo Realizado',
  },
  'tour.dossier_protocol_header.message': {
    es: 'Nos lleva directamente al protocolo realizado. El encabezado muestra el número de protocolo, la ubicación inspeccionada y su estado actual.',
    en: 'It takes us directly to the completed protocol. The header shows the protocol number, the inspected location and its current status.',
    pt: 'Leva-nos diretamente ao protocolo realizado. O cabeçalho mostra o número do protocolo, o local inspecionado e seu estado atual.',
  },
  'tour.dossier_protocol_header.waitingHint': {
    es: 'Toca una tarjeta del Dosier para ver el protocolo',
    en: 'Tap a Dossier card to view the protocol',
    pt: 'Toque em um cartão do Dossiê para ver o protocolo',
  },
  'tour.dossier_protocol_back_btn.title': {
    es: 'Volver al Dosier',
    en: 'Back to the Dossier',
    pt: 'Voltar ao Dossiê',
  },
  'tour.dossier_protocol_back_btn.message': {
    es: 'Toca la flecha ← para regresar al Dosier y continuar con el flujo de exportación del expediente.',
    en: 'Tap the ← arrow to return to the Dossier and continue with the file export flow.',
    pt: 'Toque na seta ← para voltar ao Dossiê e continuar com o fluxo de exportação do processo.',
  },
  'tour.dossier_protocol_back_btn.waitingHint': {
    es: 'Toca la flecha ← para regresar al Dosier',
    en: 'Tap the ← arrow to return to the Dossier',
    pt: 'Toque na seta ← para voltar ao Dossiê',
  },
  'tour.dossier_export_btn.title': {
    es: 'Exportar Dosier PDF',
    en: 'Export Dossier PDF',
    pt: 'Exportar Dossiê PDF',
  },
  'tour.dossier_export_btn.message': {
    es: 'Genera el PDF oficial del Dosier con carátula, índice y todos los protocolos. Toca para generar y abrir la vista previa.',
    en: 'Generates the official Dossier PDF with cover page, index and all protocols. Tap to generate and open the preview.',
    pt: 'Gera o PDF oficial do Dossiê com capa, índice e todos os protocolos. Toque para gerar e abrir a pré-visualização.',
  },
  'tour.dossier_preview_pdf.title': {
    es: 'Vista Previa del Dosier',
    en: 'Dossier Preview',
    pt: 'Pré-visualização do Dossiê',
  },
  'tour.dossier_preview_pdf.message': {
    es: 'El PDF generado incluye carátula del proyecto, índice y todos los protocolos aprobados con sus evidencias. Desliza hacia abajo para navegar entre páginas.',
    en: 'The generated PDF includes the project cover page, index and all approved protocols with their evidence. Swipe down to navigate between pages.',
    pt: 'O PDF gerado inclui capa do projeto, índice e todos os protocolos aprovados com suas evidências. Deslize para baixo para navegar entre as páginas.',
  },
  'tour.dossier_preview_pdf.waitingHint': {
    es: 'Toca el botón exportar para abrir la vista previa',
    en: 'Tap the export button to open the preview',
    pt: 'Toque no botão exportar para abrir a pré-visualização',
  },
  'tour.dossier_preview_actions.title': {
    es: 'Descargar y Compartir',
    en: 'Download and Share',
    pt: 'Baixar e Compartilhar',
  },
  'tour.dossier_preview_actions.message': {
    es: 'Los botones en la esquina superior derecha permiten:\n• Descargar ↓: guarda el PDF en una carpeta del dispositivo\n• Compartir ↯: envía por WhatsApp, correo u otras apps instaladas',
    en: 'The buttons in the top right corner allow you to:\n• Download ↓: saves the PDF to a folder on the device\n• Share ↯: sends via WhatsApp, email or other installed apps',
    pt: 'Os botões no canto superior direito permitem:\n• Baixar ↓: salva o PDF em uma pasta do dispositivo\n• Compartilhar ↯: envia por WhatsApp, e-mail ou outros apps instalados',
  },

  // ── Puente → Dashboard ──
  'tour.bridge_to_dashboard.title': {
    es: '¡Sigamos explorando funcionalidades!',
    en: "Let's keep exploring features!",
    pt: 'Vamos continuar explorando funcionalidades!',
  },
  'tour.bridge_to_dashboard.message': {
    es: 'Ahora veremos el Dashboard de estadísticas.',
    en: 'Now we will look at the statistics Dashboard.',
    pt: 'Agora veremos o Painel de estatísticas.',
  },

  // ── Dashboard / Historical ──
  'tour.dashboard_project_filter.title': {
    es: 'Filtro por Proyecto',
    en: 'Filter by Project',
    pt: 'Filtro por Projeto',
  },
  'tour.dashboard_project_filter.message': {
    es: 'Selecciona un proyecto para ver sus estadísticas específicas o deja "Todos" para el resumen general.',
    en: 'Select a project to view its specific statistics or leave "All" for the general summary.',
    pt: 'Selecione um projeto para ver suas estatísticas específicas ou deixe "Todos" para o resumo geral.',
  },
  'tour.dashboard_project_filter.waitingHint': {
    es: 'Toca "Dashboard" en la barra inferior',
    en: 'Tap "Dashboard" in the bottom bar',
    pt: 'Toque em "Painel" na barra inferior',
  },
  'tour.dashboard_first_project.title': {
    es: 'Seleccionar un Proyecto',
    en: 'Select a Project',
    pt: 'Selecionar um Projeto',
  },
  'tour.dashboard_first_project.message': {
    es: 'Toca el nombre del proyecto para filtrar todas las secciones del dashboard con sus datos específicos. El chip activo aparece en azul navy.',
    en: 'Tap the project name to filter all dashboard sections with its specific data. The active chip appears in navy blue.',
    pt: 'Toque no nome do projeto para filtrar todas as seções do painel com seus dados específicos. O chip ativo aparece em azul-marinho.',
  },
  'tour.dashboard_first_project.waitingHint': {
    es: 'Toca el nombre de un proyecto para filtrar el dashboard',
    en: 'Tap a project name to filter the dashboard',
    pt: 'Toque no nome de um projeto para filtrar o painel',
  },
  'tour.dashboard_date_filters.title': {
    es: 'Filtros por Fecha',
    en: 'Date Filters',
    pt: 'Filtros por Data',
  },
  'tour.dashboard_date_filters.message': {
    es: 'Define un rango de fechas para acotar el análisis. Los filtros afectan todos los gráficos: aprobados/rechazados y observaciones abiertas/resueltas.',
    en: 'Define a date range to narrow the analysis. The filters affect all charts: approved/rejected and open/resolved observations.',
    pt: 'Defina um intervalo de datas para delimitar a análise. Os filtros afetam todos os gráficos: aprovados/rejeitados e observações abertas/resolvidas.',
  },
  'tour.dashboard_approved_rejected.title': {
    es: 'Aprobados vs Rechazados',
    en: 'Approved vs Rejected',
    pt: 'Aprovados vs Rejeitados',
  },
  'tour.dashboard_approved_rejected.message': {
    es: 'Muestra la proporción de protocolos aprobados frente a rechazados en el período seleccionado. Toca la tarjeta para ir directamente al Dosier del proyecto.',
    en: 'Shows the proportion of approved versus rejected protocols in the selected period. Tap the card to go directly to the project Dossier.',
    pt: 'Mostra a proporção de protocolos aprovados em relação aos rejeitados no período selecionado. Toque no cartão para ir diretamente ao Dossiê do projeto.',
  },
  'tour.dashboard_obs_status.title': {
    es: 'Observaciones Abiertas vs Resueltas',
    en: 'Open vs Resolved Observations',
    pt: 'Observações Abertas vs Resolvidas',
  },
  'tour.dashboard_obs_status.message': {
    es: 'Estado de las observaciones marcadas en los planos: abiertas (pendientes de resolución) vs resueltas. Toca para ir al Tablón de Observaciones.',
    en: 'Status of the observations marked on the drawings: open (pending resolution) vs resolved. Tap to go to the Observations Board.',
    pt: 'Estado das observações marcadas nas plantas: abertas (pendentes de resolução) vs resolvidas. Toque para ir ao Quadro de Observações.',
  },
  'tour.dashboard_weekly.title': {
    es: 'Avance Semanal',
    en: 'Weekly Progress',
    pt: 'Avanço Semanal',
  },
  'tour.dashboard_weekly.message': {
    es: 'El gráfico de barras muestra los protocolos aprobados por semana desde el inicio del proyecto. Toca cualquier barra para ver el detalle de esa semana específica.',
    en: 'The bar chart shows the protocols approved per week since the start of the project. Tap any bar to see the detail of that specific week.',
    pt: 'O gráfico de barras mostra os protocolos aprovados por semana desde o início do projeto. Toque em qualquer barra para ver o detalhe daquela semana específica.',
  },
  'tour.dashboard_specialty.title': {
    es: 'Avance por Especialidad',
    en: 'Progress by Discipline',
    pt: 'Avanço por Especialidade',
  },
  'tour.dashboard_specialty.message': {
    es: 'Distribución de protocolos por especialidad o categoría. Permite identificar qué áreas del proyecto tienen mayor actividad de control de calidad.',
    en: 'Distribution of protocols by discipline or category. It allows you to identify which areas of the project have the most quality control activity.',
    pt: 'Distribuição de protocolos por especialidade ou categoria. Permite identificar quais áreas do projeto têm maior atividade de controle de qualidade.',
  },
  'tour.dashboard_notes.title': {
    es: 'Anotaciones del Dashboard',
    en: 'Dashboard Notes',
    pt: 'Anotações do Painel',
  },
  'tour.dashboard_notes.message': {
    es: 'Registra observaciones generales del proyecto: avances, incidencias o acuerdos del equipo. Las anotaciones quedan guardadas con fecha y autor para el historial del proyecto.',
    en: 'Record general project observations: progress, incidents or team agreements. The notes are saved with date and author for the project history.',
    pt: 'Registre observações gerais do projeto: avanços, incidentes ou acordos da equipe. As anotações ficam salvas com data e autor para o histórico do projeto.',
  },

  // ── Puente → Cargar Archivos ──
  'tour.bridge_to_cargar.title': {
    es: '¡Sigamos explorando funcionalidades!',
    en: "Let's keep exploring features!",
    pt: 'Vamos continuar explorando funcionalidades!',
  },
  'tour.bridge_to_cargar.message': {
    es: 'Ahora veremos cómo cargar archivos al proyecto: actividades, ubicaciones, planos PDF, DWG y configuración.',
    en: 'Now we will look at how to upload files to the project: activities, locations, PDF drawings, DWG and configuration.',
    pt: 'Agora veremos como carregar arquivos no projeto: atividades, locais, plantas PDF, DWG e configuração.',
  },

  // ── FileUpload ──
  'tour.fileupload_entry.title': {
    es: 'Cargar Archivos al Proyecto',
    en: 'Upload Files to the Project',
    pt: 'Carregar Arquivos no Projeto',
  },
  'tour.fileupload_entry.message': {
    es: 'Al entrar al proyecto, tap en "Cargar archivos" para acceder al módulo con sus secciones especializadas.',
    en: 'When entering the project, tap "Upload files" to access the module with its specialized sections.',
    pt: 'Ao entrar no projeto, toque em "Carregar arquivos" para acessar o módulo com suas seções especializadas.',
  },
  'tour.fileupload_entry.waitingHint': {
    es: 'Toca un proyecto y luego "Cargar archivos" en el menú',
    en: 'Tap a project and then "Upload files" in the menu',
    pt: 'Toque em um projeto e depois em "Carregar arquivos" no menu',
  },
  'tour.fileupload_tab_activities.title': {
    es: 'Actividades / Protocolos',
    en: 'Activities / Protocols',
    pt: 'Atividades / Protocolos',
  },
  'tour.fileupload_tab_activities.message': {
    es: 'Importa el listado de actividades desde Excel (.xlsx). Define los tipos de protocolo que se inspeccionarán en el proyecto. Sin esto no habrá protocolos para llenar.',
    en: 'Import the list of activities from Excel (.xlsx). It defines the types of protocol that will be inspected in the project. Without this there will be no protocols to fill out.',
    pt: 'Importe a lista de atividades a partir do Excel (.xlsx). Define os tipos de protocolo que serão inspecionados no projeto. Sem isso não haverá protocolos para preencher.',
  },
  'tour.fileupload_tab_activities.waitingHint': {
    es: 'Toca un proyecto y luego "Cargar archivos" en el menú',
    en: 'Tap a project and then "Upload files" in the menu',
    pt: 'Toque em um projeto e depois em "Carregar arquivos" no menu',
  },
  'tour.fileupload_tab_locations.title': {
    es: 'Ubicaciones',
    en: 'Locations',
    pt: 'Locais',
  },
  'tour.fileupload_tab_locations.message': {
    es: 'Importa las ubicaciones del proyecto desde Excel (.xlsx). Cada ubicación es un sector físico (piso, bloque, área) al que se asignan protocolos de inspección.',
    en: 'Import the project locations from Excel (.xlsx). Each location is a physical sector (floor, block, area) to which inspection protocols are assigned.',
    pt: 'Importe os locais do projeto a partir do Excel (.xlsx). Cada local é um setor físico (andar, bloco, área) ao qual são atribuídos protocolos de inspeção.',
  },
  'tour.fileupload_tab_pdf.title': {
    es: 'Planos PDF',
    en: 'PDF Drawings',
    pt: 'Plantas PDF',
  },
  'tour.fileupload_tab_pdf.message': {
    es: 'Sube los planos del proyecto en formato PDF. Vincúlalos a ubicaciones específicas para acceder desde el protocolo y anotar observaciones georreferenciadas.',
    en: 'Upload the project drawings in PDF format. Link them to specific locations to access them from the protocol and mark georeferenced observations.',
    pt: 'Envie as plantas do projeto em formato PDF. Vincule-as a locais específicos para acessá-las a partir do protocolo e marcar observações georreferenciadas.',
  },
  'tour.fileupload_tab_dwg.title': {
    es: 'Planos DWG',
    en: 'DWG Drawings',
    pt: 'Plantas DWG',
  },
  'tour.fileupload_tab_dwg.message': {
    es: 'Sube archivos técnicos en formato DWG. Se abren con DWG FastView (app externa). Solo aparecen en el visor si la ubicación tiene un DWG cargado.',
    en: 'Upload technical files in DWG format. They open with DWG FastView (external app). They only appear in the viewer if the location has a DWG loaded.',
    pt: 'Envie arquivos técnicos em formato DWG. Eles abrem com o DWG FastView (app externo). Só aparecem no visualizador se o local tiver um DWG carregado.',
  },
  'tour.fileupload_tab_settings.title': {
    es: 'Configuración del Proyecto',
    en: 'Project Configuration',
    pt: 'Configuração do Projeto',
  },
  'tour.fileupload_tab_settings.message': {
    es: 'Personaliza el proyecto: nombre visible, logo de empresa, imagen de portada y firma digital del Jefe de Obra. Todo esto se estampa en los PDFs exportados.',
    en: 'Customize the project: visible name, company logo, cover image and the Site Manager digital signature. All of this is stamped on the exported PDFs.',
    pt: 'Personalize o projeto: nome visível, logo da empresa, imagem de capa e assinatura digital do Gerente de Obra. Tudo isso é carimbado nos PDFs exportados.',
  },

  // ── Puente → cierre ──
  'tour.bridge_to_finish.title': {
    es: '¡Ya casi terminamos!',
    en: 'We are almost done!',
    pt: 'Estamos quase terminando!',
  },
  'tour.bridge_to_finish.message': {
    es: 'Regresamos a la lista de proyectos para mostrarte dónde encontrar el tutorial cuando lo necesites.',
    en: 'We return to the project list to show you where to find the tutorial whenever you need it.',
    pt: 'Voltamos à lista de projetos para mostrar onde encontrar o tutorial quando precisar.',
  },

  // ── Cierre ──
  'tour.tour_help_button.title': {
    es: '¡Tutorial Siempre Disponible!',
    en: 'Tutorial Always Available!',
    pt: 'Tutorial Sempre Disponível!',
  },
  'tour.tour_help_button.message': {
    es: 'Puedes reiniciar este tutorial en cualquier momento tocando "Tutorial" en el encabezado. ¡Ya estás listo para usar Flow-QA/QC!',
    en: 'You can restart this tutorial at any time by tapping "Tutorial" in the header. You are now ready to use Flow-QA/QC!',
    pt: 'Você pode reiniciar este tutorial a qualquer momento tocando em "Tutorial" no cabeçalho. Agora você está pronto para usar o Flow-QA/QC!',
  },
  'tour.tour_help_button.waitingHint': {
    es: 'Regresa a la lista de proyectos para finalizar',
    en: 'Return to the project list to finish',
    pt: 'Volte à lista de projetos para finalizar',
  },

  // ── Ensayos por sector / tipo / fecha ──
  'tour.ens_search.title': { es: 'Buscar ensayos', en: 'Search tests', pt: 'Buscar ensaios' },
  'tour.ens_search.message': { es: 'Escribe el código (ej. PR-260001), el tipo o la referencia y la lista se filtra al instante: solo quedan los grupos con coincidencias. Ideal cuando un sector o una fecha acumulan muchos ensayos.', en: 'Type the code (e.g. PR-260001), the type or the reference and the list filters instantly: only matching groups remain. Ideal when a sector or a date accumulates many tests.', pt: 'Digite o código (ex. PR-260001), o tipo ou a referência e a lista filtra na hora: ficam apenas os grupos com correspondências. Ideal quando um setor ou uma data acumulam muitos ensaios.' },
  'tour.ens_filters.title': { es: 'Filtros cruzados', en: 'Cross filters', pt: 'Filtros cruzados' },
  'tour.ens_filters.message': { es: 'Toca un chip para acotar por rango de fechas o por uno o varios tipos y sectores a la vez; se combinan con el buscador. Por defecto se muestran todos. Limpia un chip con la × para volver a verlo todo.', en: 'Tap a chip to narrow by date range or by one or several types and sectors at once; they combine with the search box. By default all are shown. Clear a chip with the × to see everything again.', pt: 'Toque em um chip para delimitar por intervalo de datas ou por um ou vários tipos e setores ao mesmo tempo; combinam com a busca. Por padrão, todos são exibidos. Limpe um chip com o × para ver tudo de novo.' },
  'tour.ens_group.title': { es: 'Grupos desplegables', en: 'Expandable groups', pt: 'Grupos expansíveis' },
  'tour.ens_group.message': { es: 'Cada tarjeta agrupa ensayos; los badges muestran cuántos están aprobados y en revisión. Tócala para desplegarla: dentro aparece "Adicionar ensayo" y, manteniendo presionado un ensayo, podrás editar su fecha/hora o eliminarlo.', en: 'Each card groups tests; the badges show how many are approved and under review. Tap it to expand it: inside, "Add test" appears and, by long-pressing a test, you can edit its date/time or delete it.', pt: 'Cada cartão agrupa ensaios; os selos mostram quantos estão aprovados e em revisão. Toque nele para expandi-lo: dentro aparece "Adicionar ensaio" e, mantendo pressionado um ensaio, você poderá editar sua data/hora ou excluí-lo.' },
  'tour.ens_group.waitingHint': { es: 'Toca una tarjeta para desplegar sus ensayos', en: 'Tap a card to expand its tests', pt: 'Toque em um cartão para expandir seus ensaios' },

  // ── Geolocalización · Mapa del proyecto ──
  'tour.map_filters.title': { es: 'Filtrar y ubicar ensayos', en: 'Filter and locate tests', pt: 'Filtrar e localizar ensaios' },
  'tour.map_filters.message': { es: 'Acota lo que ves en el mapa por fecha, estado, tipo de ensayo o sector. El filtro de estado funciona además como leyenda de colores de los pines. Un punto naranja sobre un botón indica que ese filtro está activo.', en: 'Narrow what you see on the map by date, status, test type or sector. The status filter also doubles as the pin color legend. An orange dot on a button means that filter is active.', pt: 'Refine o que você vê no mapa por data, status, tipo de ensaio ou setor. O filtro de status também serve como legenda de cores dos pinos. Um ponto laranja em um botão indica que esse filtro está ativo.' },
  'tour.map_view.title': { es: 'Mapa del proyecto', en: 'Project map', pt: 'Mapa do projeto' },
  'tour.map_view.message': { es: 'Cada pin es un ensayo georreferenciado (su color = estado) y cada polígono un sector con su geometría. Toca un pin para abrir el callout y luego su ensayo; toca un sector para ver su resumen de protocolos.', en: 'Each pin is a geo-referenced test (its color = status) and each polygon is a sector with its geometry. Tap a pin to open its callout and then its test; tap a sector to see its protocol summary.', pt: 'Cada pino é um ensaio georreferenciado (sua cor = status) e cada polígono é um setor com sua geometria. Toque em um pino para abrir o balão e depois seu ensaio; toque em um setor para ver o resumo de seus protocolos.' },
  'tour.map_layer_toggle.title': { es: 'Capa del mapa', en: 'Map layer', pt: 'Camada do mapa' },
  'tour.map_layer_toggle.message': { es: 'Toca "Capa" para elegir el mapa base (estándar, satélite, híbrido o relieve) y activar la ortofoto del cliente, si el proyecto la tiene configurada. Así superpones tus ensayos sobre la foto real del terreno.', en: 'Tap "Layer" to choose the base map (standard, satellite, hybrid or terrain) and turn on the client\'s orthophoto, if the project has one configured. That way you overlay your tests on the real photo of the site.', pt: 'Toque em "Camada" para escolher o mapa base (padrão, satélite, híbrido ou relevo) e ativar a ortofoto do cliente, se o projeto tiver uma configurada. Assim você sobrepõe seus ensaios à foto real do terreno.' },
  'tour.map_layer_toggle.waitingHint': { es: 'Toca "Capa" para cambiar el mapa base o mostrar la ortofoto', en: 'Tap "Layer" to change the base map or show the orthophoto', pt: 'Toque em "Camada" para mudar o mapa base ou mostrar a ortofoto' },

  // ── Geolocalización · Sectores ──
  'tour.sectors_import.title': { es: 'Importar sectores', en: 'Import sectors', pt: 'Importar setores' },
  'tour.sectors_import.message': { es: 'Carga los sectores del proyecto desde un Excel o CSV: solo nombres, o con coordenadas para dibujar su polígono en el mapa. Al elegir el archivo verás una vista previa con el formato detectado antes de confirmar.', en: 'Load the project\'s sectors from an Excel or CSV file: names only, or with coordinates to draw their polygon on the map. When you pick the file you\'ll see a preview with the detected format before confirming.', pt: 'Carregue os setores do projeto a partir de um Excel ou CSV: apenas nomes, ou com coordenadas para desenhar o polígono no mapa. Ao escolher o arquivo você verá uma prévia com o formato detectado antes de confirmar.' },
  'tour.sectors_card.title': { es: 'Sectores cargados', en: 'Loaded sectors', pt: 'Setores carregados' },
  'tour.sectors_card.message': { es: 'Cada sector aparece con su color y geometría. Tocá la fila para desplegar su croquis, o usá los iconos para editar nombre/color (lápiz) o eliminarlo (papelera). Los sectores con polígono ya pueden contener ensayos en el mapa.', en: 'Each sector shows its color and geometry. Tap a row to expand its sketch, or use the icons to edit name/color (pencil) or delete it (trash). Sectors with a polygon can already hold tests on the map.', pt: 'Cada setor aparece com sua cor e geometria. Toque na linha para expandir o croqui, ou use os ícones para editar nome/cor (lápis) ou excluí-lo (lixeira). Setores com polígono já podem conter ensaios no mapa.' },
  'tour.sectors_card.waitingHint': { es: 'Importá sectores para verlos aquí', en: 'Import sectors to see them here', pt: 'Importe setores para vê-los aqui' },
  'tour.sectors_recalc.title': { es: 'Recalcular asignaciones', en: 'Recalculate assignments', pt: 'Recalcular atribuições' },
  'tour.sectors_recalc.message': { es: 'Reasigna cada ensayo con coordenadas al sector cuyo polígono lo contiene (point-in-polygon). Usalo después de importar o editar geometrías para que el mapa refleje la distribución actual. Respeta las asignaciones hechas a mano.', en: 'Reassigns each test with coordinates to the sector whose polygon contains it (point-in-polygon). Use it after importing or editing geometries so the map reflects the current distribution. Manual assignments are preserved.', pt: 'Reatribui cada ensaio com coordenadas ao setor cujo polígono o contém (point-in-polygon). Use após importar ou editar geometrias para que o mapa reflita a distribuição atual. As atribuições feitas manualmente são preservadas.' },

  // ── Configurar módulos ──
  'tour.config_protocols.title': { es: 'Configuración de protocolos', en: 'Protocol configuration', pt: 'Configuração de protocolos' },
  'tour.config_protocols.message': { es: 'Solo el Creador edita esta pantalla. Activá protocolos clásicos/numéricos, plantillas paramétricas, históricos, aprobación multinivel y los modos de llenado (por ubicación, muestra, sector, tipo o fecha). La codificación correlativa arma el código de cada ensayo con una máscara de tokens ({TIPO}, {AA}, {SEQ:4}…) y vista previa en vivo; podés elegir cuándo reinicia el secuencial (año, año+sector o año+mes) y definir una máscara distinta por tipo de ensayo.', en: 'Only the Creator edits this screen. Enable classic/numeric protocols, parametric templates, historical imports, multilevel approval and the fill modes (by location, sample, sector, type or date). Sequential coding builds each test\'s code from a token mask ({TIPO}, {AA}, {SEQ:4}…) with a live preview; you choose when the counter resets (year, year+sector or year+month) and can set a different mask per test type.', pt: 'Apenas o Criador edita esta tela. Ative protocolos clássicos/numéricos, modelos paramétricos, históricos, aprovação multinível e os modos de preenchimento (por local, amostra, setor, tipo ou data). A codificação correlativa monta o código de cada ensaio a partir de uma máscara de tokens ({TIPO}, {AA}, {SEQ:4}…) com prévia ao vivo; você escolhe quando o sequencial reinicia (ano, ano+setor ou ano+mês) e pode definir uma máscara diferente por tipo de ensaio.' },
  'tour.config_traceability.title': { es: 'Módulo de Trazabilidad', en: 'Traceability Module', pt: 'Módulo de Rastreabilidade' },
  'tour.config_traceability.message': { es: 'Esta sección solo la configura el Creador. Activá el módulo padre para habilitar el seguimiento de actividades de equipos con cronómetro y GPS; sus hijos (catálogo de equipos, modo de rastreo GPS e intervalo) quedan en gris hasta que prendés el padre.', en: 'Only the Creator configures this section. Turn on the parent module to enable tracking of equipment activities with timer and GPS; its children (equipment catalog, GPS tracking mode and interval) stay greyed out until the parent is on.', pt: 'Apenas o Criador configura esta seção. Ative o módulo principal para habilitar o acompanhamento de atividades de equipamentos com cronômetro e GPS; seus filhos (catálogo de equipamentos, modo de rastreamento GPS e intervalo) ficam em cinza até você ligar o principal.' },
  'tour.config_geo.title': { es: 'Módulo de Geolocalización', en: 'Geolocation Module', pt: 'Módulo de Geolocalização' },
  'tour.config_geo.message': { es: 'Solo el Creador la edita. Encendé el mapa del proyecto para habilitar la captura de coordenadas (subjetiva/numérica) en los ensayos, el sistema de coordenadas (WGS84/PSAD56, lat-lng o UTM) y la URL de la ortofoto; los hijos quedan deshabilitados si el módulo está apagado.', en: 'Only the Creator edits it. Turn on the project map to enable coordinate capture (subjective/numeric) in tests, the coordinate system (WGS84/PSAD56, lat-lng or UTM) and the orthophoto URL; the children are disabled while the module is off.', pt: 'Apenas o Criador a edita. Ligue o mapa do projeto para habilitar a captura de coordenadas (subjetiva/numérica) nos ensaios, o sistema de coordenadas (WGS84/PSAD56, lat-lng ou UTM) e a URL da ortofoto; os filhos ficam desabilitados enquanto o módulo estiver desligado.' },
  'tour.config_save.title': { es: 'Guardar cambios', en: 'Save changes', pt: 'Salvar alterações' },
  'tour.config_save.message': { es: 'Guarda y sincroniza la configuración a la nube y a todos los celulares del proyecto. Si alguna máscara de codificación es inválida, el guardado se bloquea hasta corregirla.', en: 'Saves and syncs the configuration to the cloud and to all the project phones. If any coding mask is invalid, saving is blocked until you fix it.', pt: 'Salva e sincroniza a configuração com a nuvem e com todos os celulares do projeto. Se alguma máscara de codificação for inválida, o salvamento é bloqueado até você corrigi-la.' },

  // ── Contactos ──
  'tour.contacts_card.title': { es: 'Directorio del equipo', en: 'Team directory', pt: 'Diretório da equipe' },
  'tour.contacts_card.message': { es: 'Cada tarjeta es un contacto del proyecto con su nombre, rol y teléfono. El icono de teléfono te permite llamar directamente desde la app.', en: 'Each card is a project contact with their name, role and phone number. The phone icon lets you call directly from the app.', pt: 'Cada cartão é um contato do projeto com nome, função e telefone. O ícone de telefone permite ligar diretamente pelo app.' },
  'tour.contacts_card.waitingHint': { es: 'Toca el icono de teléfono de una tarjeta para llamar', en: 'Tap a card\'s phone icon to call', pt: 'Toque no ícone de telefone de um cartão para ligar' },
  'tour.contacts_add.title': { es: 'Agregar contacto', en: 'Add contact', pt: 'Adicionar contato' },
  'tour.contacts_add.message': { es: 'Con el botón + del encabezado registras un nuevo contacto (nombre, rol y teléfono). Solo el Jefe de Obra puede agregar, editar e importar contactos.', en: 'Use the + button in the header to register a new contact (name, role and phone). Only the Site Manager can add, edit and import contacts.', pt: 'Use o botão + no cabeçalho para registrar um novo contato (nome, função e telefone). Somente o Chefe de Obra pode adicionar, editar e importar contatos.' },
  'tour.contacts_add.waitingHint': { es: 'Toca el botón + para registrar un contacto', en: 'Tap the + button to register a contact', pt: 'Toque no botão + para registrar um contato' },

  // ── Trazabilidad · Inicio ──
  'tour.trace_home_new.title': { es: 'Nueva actividad', en: 'New activity', pt: 'Nova atividade' },
  'tour.trace_home_new.message': { es: 'Aquí inicias una sesión de trabajo: eliges equipo, actividad y sector. Al tocar este botón se abre el asistente de captura.', en: 'Here you start a work session: you choose equipment, activity and sector. Tapping this button opens the capture wizard.', pt: 'Aqui você inicia uma sessão de trabalho: escolhe equipamento, atividade e setor. Tocar neste botão abre o assistente de captura.' },
  'tour.trace_home_analytics.title': { es: 'Análisis de resultados', en: 'Results analysis', pt: 'Análise de resultados' },
  'tour.trace_home_analytics.message': { es: 'Reportes por sector, equipo y cronología, con exportación del PDF de trazabilidad. Disponible solo para el Jefe de Obra.', en: 'Reports by sector, equipment and timeline, with traceability PDF export. Available only to the Site Manager.', pt: 'Relatórios por setor, equipamento e cronologia, com exportação do PDF de rastreabilidade. Disponível apenas para o Chefe de Obra.' },
  'tour.trace_home_analytics.waitingHint': { es: 'Tocá "Análisis" para ver los reportes', en: 'Tap "Analysis" to view the reports', pt: 'Toque em "Análise" para ver os relatórios' },
  'tour.trace_home_session.title': { es: 'Tus sesiones', en: 'Your sessions', pt: 'Suas sessões' },
  'tour.trace_home_session.message': { es: 'Aquí ves la sesión activa con su cronómetro en vivo y el historial de sesiones cerradas. Tocá una tarjeta para abrir su detalle.', en: 'Here you see the active session with its live timer and the history of closed sessions. Tap a card to open its detail.', pt: 'Aqui você vê a sessão ativa com o cronômetro ao vivo e o histórico de sessões encerradas. Toque em um cartão para abrir o detalhe.' },
  'tour.trace_home_session.waitingHint': { es: 'Iniciá una actividad para verla listada aquí', en: 'Start an activity to see it listed here', pt: 'Inicie uma atividade para vê-la listada aqui' },

  // ── Trazabilidad · Nueva sesión ──
  'tour.trace_cap_equipo.title': { es: 'Elige el equipo', en: 'Choose the equipment', pt: 'Escolha o equipamento' },
  'tour.trace_cap_equipo.message': { es: 'Selecciona en el catálogo la máquina o equipo sobre el que registrarás la actividad. Al elegirlo se habilita el campo de actividad.', en: 'Pick from the catalog the machine or equipment on which you will record the activity. Choosing it enables the activity field.', pt: 'Selecione no catálogo a máquina ou equipamento sobre o qual você registrará a atividade. Ao escolhê-lo, o campo de atividade é habilitado.' },
  'tour.trace_cap_actividad.title': { es: 'Elige la actividad', en: 'Choose the activity', pt: 'Escolha a atividade' },
  'tour.trace_cap_actividad.message': { es: 'Indica qué se está haciendo con el equipo (productiva, mantenimiento, etc.). Solo se listan las actividades válidas para el equipo elegido.', en: 'Indicate what is being done with the equipment (productive, maintenance, etc.). Only activities valid for the chosen equipment are listed.', pt: 'Indique o que está sendo feito com o equipamento (produtiva, manutenção, etc.). Só são listadas as atividades válidas para o equipamento escolhido.' },
  'tour.trace_cap_start.title': { es: 'Iniciar la sesión', en: 'Start the session', pt: 'Iniciar a sessão' },
  'tour.trace_cap_start.message': { es: 'Desliza para comenzar. Si la actividad tiene checklist, lo completas antes de que arranque el cronómetro.', en: 'Slide to begin. If the activity has a checklist, you complete it before the timer starts.', pt: 'Deslize para começar. Se a atividade tiver checklist, você o completa antes que o cronômetro comece.' },

  // ── Trazabilidad · Checklist previo ──
  'tour.trace_chk_item.title': { es: 'Verificaciones previas', en: 'Pre-checks', pt: 'Verificações prévias' },
  'tour.trace_chk_item.message': { es: 'Responde cada punto (Sí/No/N.A.) y agrega comentario o foto si aplica. Debes completarlos antes de iniciar la sesión.', en: 'Answer each item (Yes/No/N.A.) and add a comment or photo if applicable. You must complete them before starting the session.', pt: 'Responda cada item (Sim/Não/N.A.) e adicione comentário ou foto se aplicável. Você deve completá-los antes de iniciar a sessão.' },
  'tour.trace_chk_start.title': { es: 'Iniciar la sesión', en: 'Start the session', pt: 'Iniciar a sessão' },
  'tour.trace_chk_start.message': { es: 'Con el checklist respondido, desliza para arrancar el cronómetro de la actividad.', en: 'With the checklist answered, slide to start the activity timer.', pt: 'Com o checklist respondido, deslize para iniciar o cronômetro da atividade.' },

  // ── Trazabilidad · Sesión activa ──
  'tour.trace_run_timer.title': { es: 'Cronómetro de la sesión', en: 'Session timer', pt: 'Cronômetro da sessão' },
  'tour.trace_run_timer.message': { es: 'Muestra el tiempo efectivo trabajado y avanza en vivo. Las pausas no suman al total. Más abajo controlas la sesión.', en: 'Shows the effective time worked and updates live. Pauses do not add to the total. You control the session below.', pt: 'Mostra o tempo efetivo trabalhado e avança ao vivo. As pausas não somam ao total. Mais abaixo você controla a sessão.' },
  'tour.trace_run_actions.title': { es: 'Pausar, reanudar y finalizar', en: 'Pause, resume and finish', pt: 'Pausar, retomar e finalizar' },
  'tour.trace_run_actions.message': { es: 'Desliza cada control para pausar la actividad, reanudarla o finalizar la sesión al terminar. Al finalizar se cierra y queda en el historial.', en: 'Slide each control to pause the activity, resume it or finish the session when done. Finishing closes it and saves it to history.', pt: 'Deslize cada controle para pausar a atividade, retomá-la ou finalizar a sessão ao terminar. Ao finalizar, ela é encerrada e fica no histórico.' },

  // ── Trazabilidad · Análisis ──
  'tour.trace_an_tabs.title': { es: 'Vistas de análisis', en: 'Analysis views', pt: 'Visões de análise' },
  'tour.trace_an_tabs.message': { es: 'Cambia entre análisis por sector, por equipo, checklists y el resumen exportable a PDF. Cada pestaña recalcula sus indicadores.', en: 'Switch between analysis by sector, by equipment, checklists and the PDF-exportable summary. Each tab recalculates its indicators.', pt: 'Alterne entre análise por setor, por equipamento, checklists e o resumo exportável para PDF. Cada aba recalcula seus indicadores.' },
  'tour.trace_an_filters.title': { es: 'Rango de fechas', en: 'Date range', pt: 'Intervalo de datas' },
  'tour.trace_an_filters.message': { es: 'Acota los datos a un periodo eligiendo fecha desde y hasta. Cada vista vuelve a calcular sus indicadores al cambiarlo.', en: 'Narrow the data to a period by choosing a from and to date. Each view recalculates its indicators when you change it.', pt: 'Restrinja os dados a um período escolhendo data inicial e final. Cada visão recalcula seus indicadores ao alterá-lo.' },

  // ── Trazabilidad · Detalle de sesión cerrada ──
  'tour.wsd_summary.title': { es: 'Resumen de la sesión', en: 'Session summary', pt: 'Resumo da sessão' },
  'tour.wsd_summary.message': { es: 'El cronómetro grande es el tiempo EFECTIVO trabajado (sin contar pausas). Si hubo pausas, se muestra abajo el tiempo total detenido. Bajemos a ver los datos registrados.', en: 'The large timer shows the EFFECTIVE time worked (pauses excluded). If there were pauses, the total paused time appears below. Let\'s scroll down to the recorded details.', pt: 'O cronômetro grande mostra o tempo EFETIVO trabalhado (sem contar pausas). Se houve pausas, o tempo total parado aparece abaixo. Vamos descer para ver os dados registrados.' },
  'tour.wsd_info.title': { es: 'Datos de la sesión', en: 'Session details', pt: 'Dados da sessão' },
  'tour.wsd_info.message': { es: 'Ficha de la sesión: equipo, actividad, sector, turno, inicio/fin y cantidad de puntos GPS capturados durante el trabajo. Más abajo están las notas de cierre.', en: 'Session record: equipment, activity, sector, shift, start/end times and the number of GPS points captured during the work. The closing notes are further down.', pt: 'Ficha da sessão: equipamento, atividade, setor, turno, início/fim e quantidade de pontos GPS capturados durante o trabalho. Mais abaixo estão as notas de encerramento.' },
  'tour.wsd_notes.title': { es: 'Notas de cierre', en: 'Closing notes', pt: 'Notas de encerramento' },
  'tour.wsd_notes.message': { es: 'Observaciones de cierre de la sesión. Solo el Jefe de Obra puede editarlas y guardarlas; el resto del equipo las ve como lectura.', en: 'Closing remarks for the session. Only the Site Manager can edit and save them; everyone else sees them read-only.', pt: 'Observações de encerramento da sessão. Apenas o Chefe de Obra pode editá-las e salvá-las; o restante da equipe as vê apenas para leitura.' },
  'tour.wsd_notes.waitingHint': {
    es: 'Disponible para el Jefe de Obra',
    en: 'Available to the Site Manager',
    pt: 'Disponível para o Gerente de Obra',
  },
  // ── i18n batch entries ──
  'tour.ens_search.waitingHint': { es: 'Escribe en el buscador para filtrar la lista', en: 'Type in the search box to filter the list', pt: 'Digite na busca para filtrar a lista' },
  'tour.ens_filters.waitingHint': { es: 'Toca un chip para elegir tipos, sectores o fechas', en: 'Tap a chip to pick types, sectors or dates', pt: 'Toque em um chip para escolher tipos, setores ou datas' },
  'tour.map_filters.waitingHint': { es: 'Toca un botón de filtro para acotar los pines del mapa', en: 'Tap a filter button to narrow the map pins', pt: 'Toque em um botão de filtro para refinar os pinos do mapa' },
  'tour.map_view.waitingHint': { es: 'Toca un pin para abrir su ensayo, o el botón Capa para cambiar el mapa', en: 'Tap a pin to open its test, or the Layer button to change the map', pt: 'Toque em um pino para abrir seu ensaio, ou no botão Camada para mudar o mapa' },
  'tour.sectors_import.waitingHint': { es: 'Tocá "Importar Excel/CSV" para elegir el archivo', en: 'Tap "Import Excel/CSV" to choose the file', pt: 'Toque em "Importar Excel/CSV" para escolher o arquivo' },
  'tour.sectors_recalc.waitingHint': { es: 'Tocá "Recalcular asignaciones" para aplicar los sectores', en: 'Tap "Recalculate assignments" to apply the sectors', pt: 'Toque em "Recalcular atribuições" para aplicar os setores' },
  'tour.config_save.waitingHint': { es: 'Tocá «Guardar» para aplicar la configuración', en: 'Tap “Save” to apply the configuration', pt: 'Toque em «Salvar» para aplicar a configuração' },
  'tour.trace_home_new.waitingHint': { es: 'Tocá "Nueva actividad" para abrir el asistente', en: 'Tap "New activity" to open the wizard', pt: 'Toque em "Nova atividade" para abrir o assistente' },
  'tour.trace_cap_equipo.waitingHint': { es: 'Tocá el selector y elegí un equipo', en: 'Tap the selector and choose an equipment', pt: 'Toque no seletor e escolha um equipamento' },
  'tour.trace_cap_actividad.waitingHint': { es: 'Primero elegí un equipo para habilitar este campo', en: 'Choose an equipment first to enable this field', pt: 'Escolha primeiro um equipamento para habilitar este campo' },
  'tour.trace_cap_start.waitingHint': { es: 'Deslizá el control para iniciar', en: 'Slide the control to start', pt: 'Deslize o controle para iniciar' },
  'tour.trace_chk_item.waitingHint': { es: 'Respondé cada punto del checklist', en: 'Answer each checklist item', pt: 'Responda cada item do checklist' },
  'tour.trace_chk_start.waitingHint': { es: 'Deslizá el control para arrancar el cronómetro', en: 'Slide the control to start the timer', pt: 'Deslize o controle para iniciar o cronômetro' },
  'tour.trace_run_actions.waitingHint': { es: 'Deslizá un control para pausar o finalizar', en: 'Slide a control to pause or finish', pt: 'Deslize um controle para pausar ou finalizar' },
  'tour.trace_an_tabs.waitingHint': { es: 'Tocá una pestaña para cambiar de vista', en: 'Tap a tab to switch views', pt: 'Toque em uma aba para mudar de visão' },
  'tour.trace_an_filters.waitingHint': { es: 'Tocá las fechas para acotar el periodo', en: 'Tap the dates to narrow the period', pt: 'Toque nas datas para restringir o período' },
  'tour.samples_filters.title': { es: 'Filtrar muestras', en: 'Filter samples', pt: 'Filtrar amostras' },
  'tour.samples_filters.message': { es: 'Toca para desplegar los filtros: busca por código o material, acota por rango de fechas, rango de correlativo, sector o capa. Por defecto se muestran todas.', en: 'Tap to expand the filters: search by code or material, narrow by date range, sequence range, sector or layer. All samples are shown by default.', pt: 'Toque para abrir os filtros: busque por código ou material, restrinja por intervalo de datas, intervalo de correlativo, setor ou camada. Por padrão, todas são exibidas.' },
  'tour.samples_filters.waitingHint': { es: 'Abre el módulo de Muestras para verlo', en: 'Open the Samples module to see it', pt: 'Abra o módulo de Amostras para ver' },
  'tour.samples_add.title': { es: 'Añadir muestra', en: 'Add sample', pt: 'Adicionar amostra' },
  'tour.samples_add.message': { es: 'Crea una muestra nueva. Se le asigna un código automático (M-proyecto-fecha-correlativo) y solo verás las filas que el Jefe de Obra dejó activas en la configuración.', en: 'Create a new sample. It gets an automatic code (M-project-date-sequence) and you only see the fields the Site Manager left enabled in the configuration.', pt: 'Crie uma nova amostra. Recebe um código automático (M-projeto-data-correlativo) e você só vê os campos que o Gerente de Obra deixou ativos na configuração.' },
  'tour.samples_add.waitingHint': { es: 'Toca "Añadir muestra" para crear una', en: 'Tap "Add sample" to create one', pt: 'Toque em "Adicionar amostra" para criar uma' },
  'tour.samples_card.title': { es: 'Tarjeta de muestra', en: 'Sample card', pt: 'Cartão de amostra' },
  'tour.samples_card.message': { es: 'Cada tarjeta muestra el código, la fecha y el material; el número a la derecha son los ensayos vinculados. Tócala para abrir el detalle de la muestra y su código QR.', en: 'Each card shows the code, date and material; the number on the right is the linked tests count. Tap it to open the sample detail and its QR code.', pt: 'Cada cartão mostra o código, a data e o material; o número à direita são os ensaios vinculados. Toque para abrir o detalhe da amostra e seu código QR.' },
  'tour.samples_card.waitingHint': { es: 'Crea una muestra para verla en la lista', en: 'Create a sample to see it in the list', pt: 'Crie uma amostra para vê-la na lista' },
  'tour.sample_detail_header.title': { es: 'Datos de la muestra', en: 'Sample data', pt: 'Dados da amostra' },
  'tour.sample_detail_header.message': { es: 'Reúne el código, la fecha, ubicación/sector, material y coordenadas de la muestra. El código QR identifica la muestra física en campo: escanéalo para abrirla al instante.', en: 'Gathers the code, date, location/sector, material and coordinates of the sample. The QR code identifies the physical sample in the field: scan it to open it instantly.', pt: 'Reúne o código, a data, localização/setor, material e coordenadas da amostra. O código QR identifica a amostra física em campo: escaneie-o para abri-la na hora.' },
  'tour.sample_detail_header.waitingHint': { es: 'Abre una muestra para ver su detalle', en: 'Open a sample to see its detail', pt: 'Abra uma amostra para ver o detalhe' },
  'tour.sample_detail_add_test.title': { es: 'Añadir ensayo', en: 'Add test', pt: 'Adicionar ensaio' },
  'tour.sample_detail_add_test.message': { es: 'Vincula uno o varios ensayos a esta muestra. Heredan su fecha, sector y ubicación, y aparecen abajo con su estado (en progreso, en revisión o aprobado).', en: 'Link one or several tests to this sample. They inherit its date, sector and location, and appear below with their status (in progress, in review or approved).', pt: 'Vincule um ou vários ensaios a esta amostra. Eles herdam a data, setor e localização, e aparecem abaixo com seu status (em andamento, em revisão ou aprovado).' },
  'tour.sample_detail_add_test.waitingHint': { es: 'Toca "Añadir ensayo" para vincular ensayos', en: 'Tap "Add test" to link tests', pt: 'Toque em "Adicionar ensaio" para vincular ensaios' },
  'tour.sample_detail_export.title': { es: 'Exportar muestra', en: 'Export sample', pt: 'Exportar amostra' },
  'tour.sample_detail_export.message': { es: 'El icono de compartir del encabezado genera un PDF con los datos generales de la muestra, su QR y la lista de ensayos vinculados, listo para enviar.', en: 'The share icon in the header generates a PDF with the sample\'s general data, its QR and the list of linked tests, ready to send.', pt: 'O ícone de compartilhar do cabeçalho gera um PDF com os dados gerais da amostra, seu QR e a lista de ensaios vinculados, pronto para enviar.' },
  'tour.sample_detail_export.waitingHint': { es: 'Abre una muestra para ver esta opción', en: 'Open a sample to see this option', pt: 'Abra uma amostra para ver esta opção' },
  'tour.summary_test_type.title': { es: 'Elegí el tipo de ensayo', en: 'Pick the test type', pt: 'Escolha o tipo de ensaio' },
  'tour.summary_test_type.message': { es: 'Cada tarjeta consolida en una sola tabla todos los ensayos de ese tipo (una fila por ensayo). Tócala para abrir su tabla resumen con columnas, filtros y KPIs.', en: 'Each card consolidates every test of that type into a single table (one row per test). Tap it to open its summary table with columns, filters and KPIs.', pt: 'Cada cartão consolida todos os ensaios desse tipo em uma única tabela (uma linha por ensaio). Toque para abrir sua tabela resumo com colunas, filtros e KPIs.' },
  'tour.summary_test_type.waitingHint': { es: 'Tocá un tipo de ensayo para abrir su tabla', en: 'Tap a test type to open its table', pt: 'Toque em um tipo de ensaio para abrir sua tabela' },
  'tour.summary_filters.title': { es: 'Filtros de la tabla', en: 'Table filters', pt: 'Filtros da tabela' },
  'tour.summary_filters.message': { es: 'Acotá los ensayos por estado (aprobado/en revisión/rechazado), sector y rango de fechas. También elegís acá qué columna queda congelada como primera.', en: 'Narrow tests by status (approved/in review/rejected), sector and date range. Here you also pick which column stays frozen as the first one.', pt: 'Filtre os ensaios por estado (aprovado/em revisão/rejeitado), setor e intervalo de datas. Aqui você também escolhe qual coluna fica congelada como a primeira.' },
  'tour.summary_filters.waitingHint': { es: 'Tocá un tipo de ensayo para ver sus filtros', en: 'Tap a test type to see its filters', pt: 'Toque em um tipo de ensaio para ver seus filtros' },
  'tour.summary_chart_export.title': { es: 'Gráfico y exportar', en: 'Chart and export', pt: 'Gráfico e exportar' },
  'tour.summary_chart_export.message': { es: 'El botón Gráfico genera un dispersión del parámetro elegido contra el tiempo, con línea de tendencia. CSV exporta la tabla filtrada en Excel (UTF-8).', en: 'The Chart button plots the chosen parameter against time as a scatter with a trend line. CSV exports the filtered table for Excel (UTF-8).', pt: 'O botão Gráfico gera uma dispersão do parâmetro escolhido em função do tempo, com linha de tendência. CSV exporta a tabela filtrada para Excel (UTF-8).' },
  'tour.summary_chart_export.waitingHint': { es: 'Permanecé en la tabla para ver estas opciones', en: 'Stay on the table to see these options', pt: 'Permaneça na tabela para ver estas opções' },
  'tour.summary_measures.title': { es: 'Medidas (KPIs)', en: 'Measures (KPIs)', pt: 'Medidas (KPIs)' },
  'tour.summary_measures.message': { es: 'Agregá filas de resumen al pie de la tabla: promedio, desviación estándar, máximo y mínimo de cada columna numérica. Tu selección queda guardada por tipo de ensayo.', en: 'Add summary rows at the bottom of the table: average, standard deviation, maximum and minimum for each numeric column. Your selection is saved per test type.', pt: 'Adicione linhas de resumo no rodapé da tabela: média, desvio padrão, máximo e mínimo de cada coluna numérica. Sua seleção é salva por tipo de ensaio.' },
  'tour.summary_measures.waitingHint': { es: 'Desplazá la tabla hacia abajo para ver las medidas', en: 'Scroll the table down to see the measures', pt: 'Role a tabela para baixo para ver as medidas' },
  'tour.recycle_banner.title': { es: 'Papelera de Reciclaje', en: 'Recycle Bin', pt: 'Lixeira de Reciclagem' },
  'tour.recycle_banner.message': { es: 'Es tu red de seguridad: cada ensayo eliminado del proyecto se respalda aquí en solo lectura, ordenado por fecha de borrado. Si algo se eliminó por error, lo recuperás desde acá. Recordá que el borrado definitivo de un ensayo es irreversible.', en: 'This is your safety net: every test deleted from the project is backed up here read-only, sorted by deletion date. If something was deleted by mistake, you recover it from here. Remember that permanently deleting a test is irreversible.', pt: 'E a sua rede de seguranca: cada ensaio excluido do projeto fica salvo aqui apenas para leitura, ordenado pela data de exclusao. Se algo foi apagado por engano, voce o recupera aqui. Lembre-se de que a exclusao definitiva de um ensaio e irreversivel.' },
  'tour.recycle_banner.waitingHint': { es: 'Abre la Papelera del proyecto para verla', en: 'Open the project Recycle Bin to see it', pt: 'Abra a Lixeira do projeto para ve-la' },
  'tour.recycle_card.title': { es: 'Ensayo eliminado', en: 'Deleted test', pt: 'Ensaio excluido' },
  'tour.recycle_card.message': { es: 'Cada tarjeta es un ensayo borrado, con su código, ubicación y quién lo eliminó. Tócala para ver la ficha completa (solo lectura, sin QR) y confirmar si necesitás restaurarlo en el proyecto.', en: 'Each card is a deleted test, showing its code, location and who deleted it. Tap it to view the full record (read-only, no QR) and confirm whether you need to restore it to the project.', pt: 'Cada cartao e um ensaio excluido, com seu codigo, localizacao e quem o excluiu. Toque nele para ver a ficha completa (apenas leitura, sem QR) e confirmar se precisa restaura-lo no projeto.' },
  'tour.recycle_card.waitingHint': { es: 'Tocá una tarjeta para ver el ensayo eliminado', en: 'Tap a card to view the deleted test', pt: 'Toque em um cartao para ver o ensaio excluido' },
  'tour.users_add.title': { es: 'Añadir usuario', en: 'Add user', pt: 'Adicionar usuário' },
  'tour.users_add.message': { es: 'Solo el Creador da de alta usuarios. Cada cuenta se crea con email y contraseña: con esos datos el usuario inicia sesión. Tócalo para abrir el formulario de alta.', en: 'Only the Creator adds users. Each account is created with an email and password: the user signs in with those credentials. Tap it to open the new-user form.', pt: 'Apenas o Criador cadastra usuários. Cada conta é criada com e-mail e senha: o usuário entra com esses dados. Toque para abrir o formulário de cadastro.' },
  'tour.users_add.waitingHint': { es: 'Tocá "Añadir usuario" para crear una cuenta', en: 'Tap "Add user" to create an account', pt: 'Toque em "Adicionar usuário" para criar uma conta' },
  'tour.users_role.title': { es: 'Rol del usuario', en: 'User role', pt: 'Função do usuário' },
  'tour.users_role.message': { es: 'La etiqueta de color marca el rol: Residente, Supervisor QC o Técnico. Define qué puede hacer cada uno. Tócala para cambiar el rol de un usuario existente.', en: 'The colored tag shows the role: Resident, QC Supervisor or Technician. It sets what each one can do. Tap it to change an existing user\'s role.', pt: 'A etiqueta colorida mostra a função: Residente, Supervisor QC ou Técnico. Define o que cada um pode fazer. Toque para alterar a função de um usuário existente.' },
  'tour.users_role.waitingHint': { es: 'Cargá usuarios para ver y editar su rol', en: 'Add users to view and edit their role', pt: 'Cadastre usuários para ver e editar sua função' },
  'tour.users_assign.title': { es: 'Accesos a proyectos', en: 'Project access', pt: 'Acessos a projetos' },
  'tour.users_assign.message': { es: 'Cada usuario solo ve los proyectos que le asignás. Con "Ingresar a proyecto" das acceso a varios usuarios y proyectos a la vez (y "Quitar acceso" lo revoca).', en: 'Each user only sees the projects you assign. With "Enter project" you grant access to several users and projects at once (and "Remove access" revokes it).', pt: 'Cada usuário só vê os projetos que você atribui. Com "Entrar no projeto" você concede acesso a vários usuários e projetos de uma vez (e "Remover acesso" revoga).' },
  'tour.users_assign.waitingHint': { es: 'Tocá "Ingresar a proyecto" para asignar accesos', en: 'Tap "Enter project" to assign access', pt: 'Toque em "Entrar no projeto" para atribuir acessos' },
  'tour.users_import.title': { es: 'Importar desde Excel', en: 'Import from Excel', pt: 'Importar do Excel' },
  'tour.users_import.message': { es: 'Da de alta muchos usuarios de una vez desde una planilla (nombre, email, contraseña, rol). La columna "Proyectos" asigna sus accesos automáticamente.', en: 'Register many users at once from a spreadsheet (name, email, password, role). The "Projects" column assigns their access automatically.', pt: 'Cadastre muitos usuários de uma vez a partir de uma planilha (nome, e-mail, senha, função). A coluna "Projetos" atribui seus acessos automaticamente.' },
  'tour.users_import.waitingHint': { es: 'Tocá "Importar" para cargar usuarios en lote', en: 'Tap "Import" to load users in bulk', pt: 'Toque em "Importar" para carregar usuários em lote' },
  'tour.protolist_search.title': { es: 'Buscar protocolos', en: 'Search Protocols', pt: 'Buscar Protocolos' },
  'tour.protolist_search.message': { es: 'Escribe el número de protocolo o el nombre de la ubicación para encontrar al instante el ensayo que buscas dentro de la lista del proyecto.', en: 'Type the protocol number or the location name to instantly find the test you are looking for within the project list.', pt: 'Digite o número do protocolo ou o nome do local para encontrar instantaneamente o ensaio que você procura dentro da lista do projeto.' },
  'tour.protolist_filter.title': { es: 'Filtrar por estado', en: 'Filter by Status', pt: 'Filtrar por Estado' },
  'tour.protolist_filter.message': { es: 'Acota la lista según el estado del protocolo: en proceso, en revisión, aprobado o rechazado. Toca "Todos" para volver a verlos todos.', en: 'Narrow the list by protocol status: in progress, in review, approved or rejected. Tap "All" to see them all again.', pt: 'Filtre a lista pelo estado do protocolo: em andamento, em revisão, aprovado ou rejeitado. Toque em "Todos" para ver todos novamente.' },
  'tour.protolist_card.title': { es: 'Tarjeta de protocolo', en: 'Protocol Card', pt: 'Cartão de Protocolo' },
  'tour.protolist_card.message': { es: 'Cada tarjeta es un protocolo con su código, ubicación y estado de color. Tócala para llenarlo si está pendiente, o para revisarlo si ya fue enviado.', en: 'Each card is a protocol with its code, location and color-coded status. Tap it to fill it in if pending, or to review it if already submitted.', pt: 'Cada cartão é um protocolo com seu código, local e estado por cor. Toque nele para preenchê-lo se estiver pendente, ou para revisá-lo se já tiver sido enviado.' },
  'tour.protolist_card.waitingHint': { es: 'Abre la lista de protocolos del proyecto para verlas', en: 'Open the project\'s protocol list to see them', pt: 'Abra a lista de protocolos do projeto para vê-las' },
  'tour.ncr_info.title': { es: 'Registrar una No Conformidad', en: 'Log a Non-Conformity', pt: 'Registrar uma Não Conformidade' },
  'tour.ncr_info.message': { es: 'Una No Conformidad documenta una desviación de calidad detectada en este protocolo. Queda vinculada al protocolo y al proyecto para su seguimiento formal.', en: 'A Non-Conformity documents a quality deviation found in this protocol. It is linked to the protocol and project for formal follow-up.', pt: 'Uma Não Conformidade documenta um desvio de qualidade detectado neste protocolo. Fica vinculada ao protocolo e ao projeto para acompanhamento formal.' },
  'tour.ncr_description.title': { es: 'Describir el hallazgo', en: 'Describe the finding', pt: 'Descrever o achado' },
  'tour.ncr_description.message': { es: 'Detalla qué se incumplió, dónde y por qué (mínimo 10 caracteres). Una buena descripción agiliza la revisión y la acción correctiva.', en: 'State what failed, where and why (minimum 10 characters). A clear description speeds up review and corrective action.', pt: 'Detalhe o que foi descumprido, onde e por quê (mínimo 10 caracteres). Uma boa descrição agiliza a revisão e a ação corretiva.' },
  'tour.ncr_description.waitingHint': { es: 'Escribe la descripción para habilitar el registro', en: 'Type the description to enable logging', pt: 'Escreva a descrição para habilitar o registro' },
  'tour.ncr_submit.title': { es: 'Registrar y dar seguimiento', en: 'Log and track', pt: 'Registrar e acompanhar' },
  'tour.ncr_submit.message': { es: 'Al registrar, la No Conformidad nace en estado ABIERTA y queda asociada al protocolo. El Jefe de Obra podrá darle seguimiento y cerrarla con sus notas de resolución.', en: 'Once logged, the Non-Conformity starts as OPEN and is tied to the protocol. The Site Manager can track it and close it with resolution notes.', pt: 'Ao registrar, a Não Conformidade nasce em estado ABERTA e fica associada ao protocolo. O Gerente de Obra poderá acompanhá-la e encerrá-la com notas de resolução.' },
  'tour.ncr_submit.waitingHint': { es: 'Toca Registrar para guardar la No Conformidad', en: 'Tap Log to save the Non-Conformity', pt: 'Toque em Registrar para salvar a Não Conformidade' },
  'tour.lang_selector.title': { es: 'Idioma de la app', en: 'App language', pt: 'Idioma do app' },
  'tour.lang_selector.message': { es: 'Abre el menú lateral y, en Preferencias, toca Idioma para cambiar entre Español, English y Português. El cambio es por dispositivo y se aplica al instante en toda la app.', en: 'Open the side menu and, under Preferences, tap Language to switch between Spanish, English and Portuguese. The change is per device and applies instantly across the whole app.', pt: 'Abra o menu lateral e, em Preferências, toque em Idioma para alternar entre Espanhol, English e Português. A mudança é por dispositivo e se aplica na hora em todo o app.' },

};

export default tour;
