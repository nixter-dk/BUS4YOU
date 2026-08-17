/* BusOps Turkalender V1
   Presentation and accessibility layer only. Existing data, actions and roles stay intact. */
(function installBusOpsCalendarV1() {
  'use strict';

  document.body.classList.add('busops-calendar-v1');

  function clearDashboardSemantics(name) {
    if (name === 'dashboard') return;
    const view = document.querySelector('#view');
    const header = document.querySelector('.content > header');
    if (view?.getAttribute('aria-label') === 'BusOps driftsdashboard') view.removeAttribute('aria-label');
    if (view) delete view.dataset.dashboardRole;
    view?.classList.remove('dashboard-v1-view');
    header?.classList.remove('dashboard-v1-page-header');
    document.querySelector('#app')?.removeAttribute('data-dashboard-active');
  }

  function decorateCalendar() {
    const view = document.querySelector('#view');
    const header = document.querySelector('.content > header');
    const calendarButton = document.querySelector('.nav[data-view="calendar"]');
    const isCalendar = Boolean(calendarButton?.classList.contains('active'));

    view?.classList.toggle('calendar-v1-view', isCalendar);
    header?.classList.toggle('calendar-v1-page-header', isCalendar);
    if (!isCalendar || !view) return;

    clearDashboardSemantics('calendar');
    view.setAttribute('aria-label', 'BusOps turkalender');

    const landmarks = [
      ['.ops-alert-strip', 'calendar-v1-alerts'],
      ['.ops-calendar-shell', 'calendar-v1-shell'],
      ['.ops-calendar-toolbar', 'calendar-v1-toolbar'],
      ['.ops-calendar-filters', 'calendar-v1-filters'],
      ['.bootstrap-calendar-legend', 'calendar-v1-legend'],
      ['.ops-calendar-body', 'calendar-v1-body'],
      ['.ops-timeline', 'calendar-v1-timeline'],
      ['.ops-week', 'calendar-v1-week'],
      ['.ops-month', 'calendar-v1-month']
    ];
    landmarks.forEach(([selector, className]) => view.querySelector(selector)?.classList.add(className));
    view.querySelectorAll('.ops-trip-card').forEach(card => card.classList.add('calendar-v1-trip'));

    view.querySelectorAll('[data-calendar-mode]').forEach(button => {
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });

    view.querySelectorAll('.ops-calendar-empty').forEach(empty => {
      if (empty.querySelector('.calendar-v1-empty-icon')) return;
      const icon = document.createElement('i');
      icon.className = 'bi bi-calendar2-check calendar-v1-empty-icon';
      icon.setAttribute('aria-hidden', 'true');
      empty.prepend(icon);
    });
  }

  const previousActivate = activate;
  activate = function calendarV1Activate(name) {
    previousActivate(name);
    clearDashboardSemantics(name);
    if (name !== 'calendar') {
      document.querySelector('#view')?.classList.remove('calendar-v1-view');
      document.querySelector('.content > header')?.classList.remove('calendar-v1-page-header');
    }
  };

  const previousRenderCalendar = renderCalendar;
  renderCalendar = function calendarV1RenderCalendar() {
    previousRenderCalendar();
    decorateCalendar();
  };

  queueMicrotask(() => {
    if (!document.querySelector('#app')?.hidden) decorateCalendar();
  });
})();
