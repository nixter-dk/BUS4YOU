/* BusOps Pengekasse V1
   Presentation and accessibility layer only. Existing balances, transfers and roles stay intact. */
(function installBusOpsCashboxV1() {
  'use strict';

  document.body.classList.add('busops-cashbox-v1');

  const metricIcons = ['bi-safe2-fill', 'bi-receipt-cutoff', 'bi-ticket-perforated-fill', 'bi-luggage-fill'];
  const emptyIcons = {
    send: 'bi-arrow-left-right',
    documents: 'bi-receipt',
    trips: 'bi-bus-front',
    transfers: 'bi-clock-history'
  };

  function syncCashboxNavigation() {
    const nav = document.querySelector('.nav[data-view="my-cashbox"]');
    const label = nav?.querySelector('span')?.textContent?.trim();
    if (!nav || !label) return;
    nav.setAttribute('aria-label', label);
    if (nav.onclick !== renderSalesCashbox) nav.onclick = renderSalesCashbox;
    if (nav.classList.contains('active')) nav.setAttribute('aria-current', 'page');
  }

  function addIcon(host, iconName, className) {
    if (!host || host.querySelector(`.${className}`)) return;
    const icon = document.createElement('i');
    icon.className = `bi ${iconName} ${className}`;
    icon.setAttribute('aria-hidden', 'true');
    host.prepend(icon);
  }

  function clearCashboxPresentation() {
    document.querySelector('#view')?.classList.remove('cashbox-v1-view');
    document.querySelector('.content > header')?.classList.remove('cashbox-v1-page-header');
  }

  function decorateCashbox() {
    syncCashboxNavigation();
    const view = document.querySelector('#view');
    const header = document.querySelector('.content > header');
    const nav = document.querySelector('.nav[data-view="my-cashbox"]');
    const isCashbox = Boolean(nav?.classList.contains('active'));

    view?.classList.toggle('cashbox-v1-view', isCashbox);
    header?.classList.toggle('cashbox-v1-page-header', isCashbox);
    if (!isCashbox || !view) return;

    const title = state.user?.role === 'sales_manager' ? 'Min budgetkasse' : 'Min pengekasse';
    view.setAttribute('aria-label', `BusOps ${title.toLowerCase()}`);
    view.dataset.cashboxRole = state.user?.role || 'unknown';

    const hero = view.querySelector('.personal-cashbox-hero');
    hero?.classList.add('cashbox-v1-hero');
    hero?.setAttribute('aria-label', 'Disponibel saldo');

    const summary = view.querySelector('.personal-cashbox-summary');
    summary?.classList.add('cashbox-v1-summary');
    summary?.setAttribute('aria-label', 'Pengekassens økonomiske overblik');
    summary?.querySelectorAll(':scope > article').forEach((card, index) => {
      card.classList.add('cashbox-v1-metric');
      card.dataset.cashboxMetric = String(index + 1);
      addIcon(card, metricIcons[index] || 'bi-wallet2', 'cashbox-v1-metric-icon');
    });

    const panels = [
      ['.personal-cashbox-send', 'send'],
      ['.personal-cashbox-documents', 'documents'],
      ['.personal-cashbox-trips', 'trips'],
      ['.personal-cashbox-transfers', 'transfers']
    ];
    panels.forEach(([selector, kind]) => {
      const panel = view.querySelector(selector);
      if (!panel) return;
      panel.classList.add('cashbox-v1-panel', `cashbox-v1-${kind}`);
      panel.querySelector('.panel-head > span')?.classList.add('cashbox-v1-panel-status');
      const empty = panel.querySelector(':scope > .empty');
      if (empty) {
        empty.classList.add('cashbox-v1-empty');
        addIcon(empty, emptyIcons[kind], 'cashbox-v1-empty-icon');
      }
    });

    view.querySelectorAll('.personal-cashbox-trip-list > article').forEach(card => card.classList.add('cashbox-v1-trip-card'));
    view.querySelectorAll('.personal-cashbox-transfers article').forEach(row => row.classList.add('cashbox-v1-transfer-row'));
    view.querySelectorAll('.personal-cashbox-documents article').forEach(row => row.classList.add('cashbox-v1-document-row'));
    view.querySelectorAll('.personal-cashbox-incoming').forEach(row => row.classList.add('cashbox-v1-incoming'));
    view.querySelector('.personal-cashbox-send-form')?.classList.add('cashbox-v1-transfer-form');
  }

  const previousRoleUi = roleUi;
  roleUi = function cashboxV1RoleUi() {
    previousRoleUi();
    syncCashboxNavigation();
  };

  const previousActivate = activate;
  activate = function cashboxV1Activate(name) {
    previousActivate(name);
    if (name !== 'my-cashbox') {
      clearCashboxPresentation();
      const view = document.querySelector('#view');
      if (view) delete view.dataset.cashboxRole;
    }
    syncCashboxNavigation();
  };

  const previousRenderSalesCashbox = renderSalesCashbox;
  renderSalesCashbox = async function cashboxV1RenderSalesCashbox() {
    await previousRenderSalesCashbox();
    decorateCashbox();
  };

  queueMicrotask(() => {
    syncCashboxNavigation();
    if (!document.querySelector('#app')?.hidden) decorateCashbox();
  });
})();
