import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Infografía — Flow-QA/QC',
  description: 'Las 7 funcionalidades estratégicas del sistema Flow-QA/QC para gestión de calidad en obra.',
}

export default function InfografiaPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@300;400;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --navy: #0D2B45;
    --blue: #1A4A7A;
    --teal: #0E7490;
    --teal-light: #22D3EE;
    --orange: #F97316;
    --orange-light: #FED7AA;
    --gray-dark: #334155;
    --gray-mid: #64748B;
    --gray-light: #CBD5E1;
    --gray-bg: #F1F5F9;
    --white: #FFFFFF;
    --grid-line: rgba(14,116,144,0.12);
  }

  .infografia-page {
    background: #E8EDF2;
    display: flex;
    justify-content: center;
    padding: 40px 20px;
    font-family: 'Source Sans 3', sans-serif;
  }

  .infografia {
    width: 800px;
    background: var(--white);
    position: relative;
    overflow: hidden;
  }

  /* ─── CABECERA ─── */
  .header {
    background: var(--navy);
    position: relative;
    padding: 48px 56px 40px;
    overflow: hidden;
  }

  .header::before {
    content: '';
    position: absolute;
    top: -60px; right: -60px;
    width: 320px; height: 320px;
    border: 2px solid rgba(14,116,144,0.3);
    border-radius: 50%;
  }
  .header::after {
    content: '';
    position: absolute;
    top: -20px; right: 40px;
    width: 200px; height: 200px;
    border: 2px solid rgba(14,116,144,0.2);
    border-radius: 50%;
  }

  .header-grid {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image:
      linear-gradient(rgba(14,116,144,0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(14,116,144,0.08) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(14,116,144,0.3);
    border: 1px solid var(--teal);
    border-radius: 4px;
    padding: 4px 12px;
    margin-bottom: 20px;
    position: relative;
  }
  .badge span {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--teal-light);
  }
  .badge-dot {
    width: 6px; height: 6px;
    background: var(--teal-light);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%,100% { opacity:1; }
    50% { opacity:0.3; }
  }

  .header-logo {
    font-family: 'Oswald', sans-serif;
    font-size: 52px;
    font-weight: 700;
    color: var(--white);
    letter-spacing: -1px;
    line-height: 1;
    position: relative;
    margin-bottom: 4px;
  }
  .header-logo span { color: var(--teal-light); }

  .header-sub {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--gray-light);
    margin-bottom: 20px;
    position: relative;
  }

  .header-tagline {
    position: relative;
    border-left: 3px solid var(--orange);
    padding-left: 16px;
    margin-bottom: 28px;
  }
  .header-tagline p {
    font-size: 16px;
    color: rgba(255,255,255,0.9);
    line-height: 1.5;
    font-weight: 300;
  }
  .header-tagline strong {
    color: var(--white);
    font-weight: 600;
  }

  .header-pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    position: relative;
  }
  .pill {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 20px;
    padding: 5px 14px;
    font-size: 11px;
    color: var(--gray-light);
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  /* ─── PROBLEMA ─── */
  .problema {
    background: #1E293B;
    padding: 32px 56px;
    display: flex;
    align-items: center;
    gap: 32px;
  }

  .problema-icon-wrap {
    flex-shrink: 0;
    width: 56px; height: 56px;
    background: rgba(249,115,22,0.15);
    border: 1px solid rgba(249,115,22,0.3);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px;
  }

  .problema h2 {
    font-family: 'Oswald', sans-serif;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--orange);
    margin-bottom: 6px;
  }
  .problema p {
    font-size: 14px;
    color: rgba(255,255,255,0.7);
    line-height: 1.6;
  }
  .problema strong { color: rgba(255,255,255,0.95); }

  /* ─── VS BRIDGE ─── */
  .bridge {
    background: linear-gradient(135deg, #1E293B 50%, var(--teal) 50%);
    padding: 20px 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .bridge-left, .bridge-right {
    font-family: 'Oswald', sans-serif;
    font-size: 12px;
    letter-spacing: 2px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .bridge-left { color: rgba(255,255,255,0.5); }
  .bridge-right { color: rgba(255,255,255,0.9); text-align: right; }
  .bridge-vs {
    background: var(--navy);
    border: 2px solid var(--teal-light);
    border-radius: 50%;
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Oswald', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: var(--teal-light);
  }

  /* ─── SECCIÓN TÍTULO ─── */
  .section-header {
    background: var(--teal);
    padding: 18px 56px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .section-header h3 {
    font-family: 'Oswald', sans-serif;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--white);
  }
  .section-num {
    background: rgba(255,255,255,0.2);
    border-radius: 6px;
    padding: 2px 10px;
    font-family: 'Oswald', sans-serif;
    font-size: 12px;
    color: rgba(255,255,255,0.8);
    letter-spacing: 1px;
  }
  .section-line {
    flex: 1;
    height: 1px;
    background: rgba(255,255,255,0.25);
  }

  /* ─── FUNCIONALIDADES ─── */
  .funcionalidades {
    background: var(--white);
    padding: 40px 56px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  .func-card {
    background: var(--gray-bg);
    border: 1px solid var(--gray-light);
    border-radius: 12px;
    padding: 20px;
    position: relative;
    transition: all 0.2s;
    overflow: hidden;
  }
  .func-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 3px; height: 100%;
    background: var(--teal);
  }

  .func-card.accent::before { background: var(--orange); }

  .func-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .func-icon {
    width: 40px; height: 40px;
    background: var(--navy);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .func-num {
    font-family: 'Oswald', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--teal);
    background: rgba(14,116,144,0.1);
    border-radius: 4px;
    padding: 2px 8px;
  }
  .func-card.accent .func-num {
    color: var(--orange);
    background: rgba(249,115,22,0.1);
  }

  .func-title {
    font-family: 'Oswald', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: var(--navy);
    line-height: 1.2;
    margin-bottom: 6px;
  }
  .func-desc {
    font-size: 12.5px;
    color: var(--gray-mid);
    line-height: 1.6;
  }
  .func-desc strong {
    color: var(--gray-dark);
    font-weight: 600;
  }

  .func-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    background: rgba(13,43,69,0.06);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--teal);
    text-transform: uppercase;
  }

  /* Card especial que ocupa todo el ancho */
  .func-card.full-width {
    grid-column: 1 / -1;
  }

  /* ─── DIFERENCIAL ─── */
  .diferencial {
    background: var(--navy);
    padding: 36px 56px;
    position: relative;
    overflow: hidden;
  }
  .diferencial::after {
    content: '';
    position: absolute;
    bottom: -40px; right: -40px;
    width: 200px; height: 200px;
    border: 2px solid rgba(14,116,144,0.15);
    border-radius: 50%;
  }

  .diferencial h3 {
    font-family: 'Oswald', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--teal-light);
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .diferencial h3::before {
    content: '';
    display: inline-block;
    width: 24px; height: 2px;
    background: var(--teal-light);
  }

  .dif-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
  }
  .dif-item {
    text-align: center;
    padding: 16px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    background: rgba(255,255,255,0.04);
  }
  .dif-num {
    font-family: 'Oswald', sans-serif;
    font-size: 32px;
    font-weight: 700;
    color: var(--teal-light);
    line-height: 1;
    margin-bottom: 4px;
  }
  .dif-label {
    font-size: 11px;
    color: rgba(255,255,255,0.6);
    line-height: 1.4;
  }

  /* ─── ALINEACIÓN TECNOLÓGICA ─── */
  .alineacion {
    background: var(--gray-bg);
    padding: 32px 56px;
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .alin-label {
    font-family: 'Oswald', sans-serif;
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--gray-mid);
    flex-shrink: 0;
  }
  .alin-divider {
    width: 1px; height: 32px;
    background: var(--gray-light);
    flex-shrink: 0;
  }
  .alin-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .alin-tag {
    background: var(--white);
    border: 1px solid var(--gray-light);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    color: var(--gray-dark);
  }
  .alin-tag.highlight {
    background: var(--navy);
    border-color: var(--navy);
    color: var(--white);
  }

  /* ─── CTA ─── */
  .cta {
    background: linear-gradient(135deg, var(--teal) 0%, var(--navy) 100%);
    padding: 40px 56px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .cta::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 30px 30px;
  }

  .cta-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 20px;
    padding: 5px 16px;
    margin-bottom: 16px;
    position: relative;
  }
  .cta-badge span {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.8);
  }

  .cta h2 {
    font-family: 'Oswald', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: var(--white);
    line-height: 1.2;
    margin-bottom: 12px;
    position: relative;
  }
  .cta h2 span { color: var(--teal-light); }

  .cta p {
    font-size: 14px;
    color: rgba(255,255,255,0.7);
    margin-bottom: 24px;
    position: relative;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
    margin-bottom: 28px;
  }

  .cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: var(--orange);
    color: var(--white);
    padding: 14px 32px;
    border-radius: 8px;
    font-family: 'Oswald', sans-serif;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    position: relative;
    text-decoration: none;
  }

  /* ─── FOOTER ─── */
  .footer {
    background: var(--navy);
    padding: 16px 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 2px solid var(--teal);
  }
  .footer-logo {
    font-family: 'Oswald', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: var(--white);
    letter-spacing: -0.5px;
  }
  .footer-logo span { color: var(--teal-light); }
  .footer-tagline {
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .footer-icons {
    display: flex;
    gap: 8px;
  }
  .f-icon {
    width: 28px; height: 28px;
    background: rgba(255,255,255,0.08);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
  }
        .infografia-page {
          background: #E8EDF2;
          display: flex;
          justify-content: center;
          padding: 40px 20px;
          font-family: 'Source Sans 3', sans-serif;
          min-height: calc(100vh - 56px);
        }
      `}</style>
      <div className="infografia-page">
        <div
          dangerouslySetInnerHTML={{
            __html: `<div class="infografia">

  <!-- HEADER -->
  <div class="header">
    <div class="header-grid"></div>
    <div class="badge">
      <div class="badge-dot"></div>
      <span>Sistema Digital QA/QC · Construcción 4.0</span>
    </div>
    <div class="header-logo">Flow-<span>QA/QC</span></div>
    <div class="header-sub">Modernización del Aseguramiento de Calidad en Obra</div>
    <div class="header-tagline">
      <p><strong>Gestión Digital Integral. Cero Papel. Trazabilidad Absoluta.</strong><br>
      Diseñado para las exigencias de la ingeniería civil moderna, digitaliza y asegura el control de calidad desde el frente de trabajo hasta el cierre documental.</p>
    </div>
    <div class="header-pills">
      <div class="pill">📱 Móvil + Web</div>
      <div class="pill">🔌 Offline-First</div>
      <div class="pill">📍 GPS + Timestamp</div>
      <div class="pill">⚡ Tiempo Real</div>
    </div>
  </div>

  <!-- PROBLEMA -->
  <div class="problema">
    <div class="problema-icon-wrap">⚠️</div>
    <div>
      <h2>El Problema Actual</h2>
      <p>El uso tradicional de <strong>papel, Excel y WhatsApp</strong> genera formatos dañados en obra, extravíos, llenado extemporáneo y <strong>pérdida total de trazabilidad</strong>. Sin control documental estructurado, la calidad queda expuesta ante cualquier peritaje o arbitraje.</p>
    </div>
  </div>

  <!-- BRIDGE -->
  <div class="bridge">
    <div class="bridge-left">Procesos Analógicos<br>sin trazabilidad</div>
    <div class="bridge-vs">VS</div>
    <div class="bridge-right">Gestión Digital<br>estructurada y auditable</div>
  </div>

  <!-- SECTION HEADER -->
  <div class="section-header">
    <div class="section-num">07</div>
    <h3>Funcionalidades Estratégicas</h3>
    <div class="section-line"></div>
  </div>

  <!-- FUNCIONALIDADES -->
  <div class="funcionalidades">

    <div class="func-card">
      <div class="func-header">
        <div class="func-icon">📄</div>
        <div class="func-num">01</div>
      </div>
      <div class="func-title">Reemplazo del Protocolo Físico</div>
      <div class="func-desc">Migración total a formatos <strong>digitales in-situ</strong>. Recolección de datos métricos exactos durante la ejecución de la partida, garantizando un registro histórico impecable.</div>
      <div class="func-tag">Cero Papel</div>
    </div>

    <div class="func-card">
      <div class="func-header">
        <div class="func-icon">👥</div>
        <div class="func-num">02</div>
      </div>
      <div class="func-title">Flujo Jerárquico de Información</div>
      <div class="func-desc">Respeta el organigrama de obra. El control documental y las <strong>aprobaciones finales</strong> están reservadas para Residencia y Supervisión, mediante flujo ágil de pocos clics.</div>
      <div class="func-tag">Roles y Permisos</div>
    </div>

    <div class="func-card">
      <div class="func-header">
        <div class="func-icon">📐</div>
        <div class="func-num">03</div>
      </div>
      <div class="func-title">Gestor Documental Técnico</div>
      <div class="func-desc">Acceso inmediato a expedientes técnicos y planos <strong>PDF y DWG</strong> desde dispositivo móvil o tablet. Emite observaciones e interferencias en tiempo real desde el mismo plano.</div>
      <div class="func-tag">PDF + DWG</div>
    </div>

    <div class="func-card accent">
      <div class="func-header">
        <div class="func-icon">🛡️</div>
        <div class="func-num">04</div>
      </div>
      <div class="func-title">Auditoría Blindada</div>
      <div class="func-desc">Evidencias con <strong>coordenadas GPS, nivel de operador y sello de tiempo</strong> por reloj atómico. Bloqueo absoluto de fotos desde galería. Expediente protegido ante peritajes y arbitrajes.</div>
      <div class="func-tag">Inmutabilidad Legal</div>
    </div>

    <div class="func-card full-width" style="background: linear-gradient(135deg, #EFF6FF, #F0FDFA); border-color: rgba(14,116,144,0.2);">
      <div style="display:flex; gap:24px; align-items:center;">
        <div style="flex-shrink:0;">
          <div class="func-icon" style="width:56px;height:56px;font-size:24px;">📊</div>
        </div>
        <div style="flex:1;">
          <div class="func-num" style="margin-bottom:6px;">05</div>
          <div class="func-title" style="font-size:17px;">Panel de Control Gerencial en Tiempo Real</div>
          <div class="func-desc">Dashboards que se <strong>auto-alimentan instantáneamente</strong>. Sin descargar bases de datos, sin correr macros, sin importar archivos. Al validarse un protocolo en terreno, los indicadores de calidad, retrasos o retrabajos se reflejan de inmediato para gerencia.</div>
        </div>
        <div style="flex-shrink:0; text-align:center; padding:0 16px;">
          <div style="font-family:'Oswald',sans-serif; font-size:36px; font-weight:700; color:var(--teal); line-height:1;">⚡</div>
          <div style="font-size:10px; color:var(--gray-mid); letter-spacing:1px; text-transform:uppercase; margin-top:4px;">Tiempo Real</div>
        </div>
      </div>
    </div>

    <div class="func-card">
      <div class="func-header">
        <div class="func-icon">📋</div>
        <div class="func-num">06</div>
      </div>
      <div class="func-title">Dossier de Calidad Automatizado</div>
      <div class="func-desc">Generación automática del expediente de cierre. Toda la documentación QA/QC consolidada, <strong>lista para valorización</strong>, sin retrabajos administrativos al final de obra.</div>
      <div class="func-tag">Cierre Documental</div>
    </div>

    <div class="func-card accent">
      <div class="func-header">
        <div class="func-icon">🔌</div>
        <div class="func-num">07</div>
      </div>
      <div class="func-title">Operatividad Offline-First</div>
      <div class="func-desc">Opera con total funcionalidad <strong>sin conexión a internet</strong>. Los datos se sincronizan automáticamente al recuperar conectividad. Sin excusas de campo para no registrar.</div>
      <div class="func-tag">Sin Interrupciones</div>
    </div>

  </div>

  <!-- DIFERENCIAL NUMÉRICO -->
  <div class="diferencial">
    <h3>Impacto en Operación</h3>
    <div class="dif-grid">
      <div class="dif-item">
        <div class="dif-num">100%</div>
        <div class="dif-label">Trazabilidad de protocolos ejecutados en obra</div>
      </div>
      <div class="dif-item">
        <div class="dif-num">0</div>
        <div class="dif-label">Registros en papel. Cero formatos perdidos o dañados</div>
      </div>
      <div class="dif-item">
        <div class="dif-num">24/7</div>
        <div class="dif-label">Acceso a información técnica desde cualquier dispositivo</div>
      </div>
    </div>
  </div>

  <!-- ALINEACIÓN TECNOLÓGICA -->
  <div class="alineacion">
    <div class="alin-label">Alineado con</div>
    <div class="alin-divider"></div>
    <div class="alin-tags">
      <div class="alin-tag highlight">QA/QC</div>
      <div class="alin-tag highlight">Lean Construction</div>
      <div class="alin-tag">Construcción 4.0</div>
      <div class="alin-tag">ISO 9001</div>
      <div class="alin-tag">BIM</div>
      <div class="alin-tag">ConTech</div>
    </div>
  </div>

  <!-- CTA -->
  <div class="cta">
    <div class="cta-badge">
      <span>🚀 Tecnología aplicada a ingeniería civil real</span>
    </div>
    <h2>Digitaliza el Control de<br><span>Calidad en Obra</span></h2>
    <p>Flow-QA/QC no es una app común. Es un sistema de gestión de calidad diseñado para resolver los problemas reales de trazabilidad, control documental y seguimiento de observaciones en proyectos de construcción.</p>
    <div class="cta-btn">
      Solicita una Demo → flowqaqc.com
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div>
      <div class="footer-logo">Flow-<span>QA/QC</span></div>
      <div class="footer-tagline">Sistema Digital de Calidad en Obra</div>
    </div>
    <div class="footer-icons">
      <div class="f-icon">📱</div>
      <div class="f-icon">🌐</div>
      <div class="f-icon">📧</div>
    </div>
  </div>

</div>`
          }}
        />
      </div>
    </>
  )
}
