/* BusOps Dashboard V1
   Presentation and accessibility layer only. Existing data, actions and roles stay intact. */
(function installBusOpsDashboardV1() {
  'use strict';

  document.body.classList.add('busops-dashboard-v1');

  function decorateNavigation() {
    document.querySelectorAll('.sidebar .nav[data-view]').forEach(button => {
      const active = button.classList.contains('active');
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');

      const label = button.querySelector('span')?.textContent?.trim();
      if (label && !button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
    });

    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.setAttribute('aria-label', 'BusOps hovednavigation');

    const logo = document.querySelector('.phase1-official-logo');
    if (logo) {
      logo.src = '/assets/alba-turist-logo.jpg';
      logo.alt = 'Alba Turist';
    }
  }

  function decorateDashboard() {
    decorateNavigation();
    const dashboardButton = document.querySelector('.nav[data-view="dashboard"]');
    const view = document.querySelector('#view');
    const header = document.querySelector('.content > header');
    const isDashboard = Boolean(dashboardButton?.classList.contains('active'));

    view?.classList.toggle('dashboard-v1-view', isDashboard);
    header?.classList.toggle('dashboard-v1-page-header', isDashboard);
    document.querySelector('#app')?.toggleAttribute('data-dashboard-active', isDashboard);
    if (!isDashboard || !view) return;

    view.setAttribute('aria-label', 'BusOps driftsdashboard');
    view.dataset.dashboardRole = state.user?.role || 'unknown';

    const landmarks = [
      ['.dashboard-welcome', 'dashboard-v1-welcome'],
      ['.phase1-dashboard-overview', 'dashboard-v1-overview'],
      ['.live-trip-panel', 'dashboard-v1-live'],
      ['.dashboard-action-section', 'dashboard-v1-attention'],
      ['.operations-action-center', 'dashboard-v1-control'],
      ['.dashboard-workspace', 'dashboard-v1-workspace'],
      ['.dashboard-lower', 'dashboard-v1-lower']
    ];
    landmarks.forEach(([selector, className]) => view.querySelector(selector)?.classList.add(className));

    view.querySelectorAll('.phase1-kpi-card').forEach(card => card.classList.add('dashboard-v1-kpi'));
    view.querySelectorAll('.phase1-departure-row').forEach(row => row.classList.add('dashboard-v1-departure'));

    if (['driver', 'sales_manager'].includes(state.user?.role)) {
      const personalCashAction = view.querySelector('.dashboard-action-grid [data-dashboard-action="cash"]');
      const personalCashDescription = personalCashAction?.querySelector('small');
      if (personalCashDescription) personalCashDescription.textContent = 'Står i din personlige pengekasse';
    }

    const liveTrips = (state.trips || []).filter(trip => {
      if (typeof tripLiveState === 'function') return tripLiveState(trip).state === 'underway';
      return typeof calendarStatus === 'function' && calendarStatus(trip) === 'underway';
    });
    const liveStatus = view.querySelector('.dashboard-live');
    if (liveStatus) {
      const label = liveTrips.length === 1 ? '1 tur i gang' : `${liveTrips.length} ture i gang`;
      const dot = document.createElement('i');
      dot.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      const strong = document.createElement('strong');
      const basis = document.createElement('small');
      strong.textContent = label;
      basis.textContent = 'Beregnet ud fra tidstabel';
      copy.append(strong, basis);
      liveStatus.replaceChildren(dot, copy);
      liveStatus.setAttribute('aria-label', `${label}. Beregnet ud fra tidstabel`);
    }

    const sync = document.querySelector('#offlineSyncIndicator');
    if (sync) sync.setAttribute('aria-live', 'polite');
  }

  decorateNavigation();

  const previousActivate = activate;
  activate = function dashboardV1Activate(name) {
    previousActivate(name);
    decorateNavigation();
    document.querySelector('#view')?.classList.toggle('dashboard-v1-view', name === 'dashboard');
    document.querySelector('.content > header')?.classList.toggle('dashboard-v1-page-header', name === 'dashboard');
  };

  const previousRenderDashboard = renderDashboard;
  renderDashboard = async function dashboardV1RenderDashboard() {
    await previousRenderDashboard();
    decorateDashboard();
  };

  queueMicrotask(() => {
    decorateNavigation();
    if (!document.querySelector('#app')?.hidden) decorateDashboard();
  });
})();
