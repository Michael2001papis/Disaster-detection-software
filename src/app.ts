import { SAMPLE_OBJECTS } from './data/sampleObjects'
import type { MonitoringObject, RiskLevel } from './types'

type DemoMode = 'default' | 'empty' | 'error'

type ViewState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; objects: MonitoringObject[] }

const RISK_DESCRIPTIONS: Record<RiskLevel, string> = {
  Low: 'Monitoring priority is low. The situation looks stable right now.',
  Medium: 'Monitoring priority is medium. Keep attention on updates and trends.',
  High: 'Monitoring priority is high. Immediate review is recommended.',
}

const RISK_BADGE_CLASS: Record<RiskLevel, string> = {
  Low: 'risk--low',
  Medium: 'risk--medium',
  High: 'risk--high',
}

function getDemoMode(): DemoMode {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('mode')?.toLowerCase()

  if (raw === 'empty') return 'empty'
  if (raw === 'error') return 'error'
  return 'default'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderRiskBadge(risk: RiskLevel): string {
  return `<span class="riskBadge ${RISK_BADGE_CLASS[risk]}">${risk}</span>`
}

function renderLegend(): string {
  const riskOrder: RiskLevel[] = ['Low', 'Medium', 'High']
  return riskOrder
    .map((risk) => {
      return `
        <div class="legendItem">
          ${renderRiskBadge(risk)}
          <div class="legendText">${escapeHtml(RISK_DESCRIPTIONS[risk])}</div>
        </div>
      `
    })
    .join('')
}

function renderObjectCard(obj: MonitoringObject): string {
  return `
    <article class="objectCard">
      <div class="objectHeader">
        <h3 class="objectName">${escapeHtml(obj.name)}</h3>
        ${renderRiskBadge(obj.risk)}
      </div>
      <div class="objectType">${escapeHtml(obj.type)}</div>
    </article>
  `
}

function renderView(state: ViewState): string {
  const headerHtml = `
    <header class="header">
      <div class="topRow">
        <span class="tag" aria-label="Version">Initial Demo Version</span>
      </div>
      <h1 class="title">Disaster Detection & Astronomical Monitoring Console</h1>
      <p class="subtitle">A clean dashboard that highlights the most urgent objects at a glance.</p>
    </header>
  `

  if (state.status === 'loading') {
    return `
      ${headerHtml}
      <main class="main">
        <section class="state state--loading" role="status" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <p class="stateText">Initializing monitoring feed...</p>
        </section>
      </main>
    `
  }

  if (state.status === 'error') {
    return `
      ${headerHtml}
      <main class="main">
        <section class="state state--error" role="alert">
          <h2 class="stateTitle">Monitoring feed unavailable</h2>
          <p class="stateText">${escapeHtml(state.message)}</p>
          <button type="button" class="btn btn--primary" data-action="retry">Retry</button>
        </section>
      </main>
    `
  }

  if (state.status === 'empty') {
    return `
      ${headerHtml}
      <main class="main">
        <section class="state state--empty" role="status" aria-live="polite">
          <h2 class="stateTitle">No alerts to display</h2>
          <p class="stateText">The current monitoring feed is quiet right now. Please check back soon.</p>
        </section>
      </main>
    `
  }

  return `
    ${headerHtml}
    <main class="main">
      <section class="legend" aria-label="Risk level explanations">
        <h2 class="sectionTitle">Risk levels</h2>
        <div class="legendGrid">${renderLegend()}</div>
      </section>

      <section class="panel" aria-label="Current alerts">
        <h2 class="sectionTitle">Current alerts</h2>
        <div class="cards">
          ${state.objects.map(renderObjectCard).join('')}
        </div>
      </section>
    </main>
  `
}

function attachHandlers(runDemo: () => void): void {
  const retryButton = document.querySelector<HTMLButtonElement>('button[data-action="retry"]')
  if (!retryButton) return

  retryButton.onclick = () => runDemo()
}

export function startDemo(): void {
  const appEl = document.querySelector<HTMLDivElement>('#app')
  if (!appEl) return

  const demoMode = getDemoMode()

  const render = (state: ViewState) => {
    appEl.innerHTML = renderView(state)
    attachHandlers(runDemo)
  }

  const runDemo = (): void => {
    render({ status: 'loading' })

    window.setTimeout(() => {
      if (demoMode === 'error') {
        render({
          status: 'error',
          message: 'No data could be loaded. This early demonstration run failed.',
        })
        return
      }

      if (demoMode === 'empty') {
        render({ status: 'empty' })
        return
      }

      render({ status: 'ready', objects: SAMPLE_OBJECTS })
    }, 900)
  }

  runDemo()
}

