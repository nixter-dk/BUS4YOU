// Applies the official Bootstrap Icons consistently to dynamic BusOps views.
const busOpsNavIcons = {
  dashboard: 'bi-grid-1x2-fill',
  calendar: 'bi-calendar3',
  stops: 'bi-geo-alt-fill',
  buses: 'bi-bus-front-fill',
  drivers: 'bi-person-badge-fill',
  'sales-managers': 'bi-people-fill',
  reports: 'bi-graph-up-arrow',
  branding: 'bi-image-fill',
  account: 'bi-gear-fill',
  'my-cashbox': 'bi-wallet2',
  operations: 'bi-shield-lock-fill'
};

const busOpsTabIcons = {
  checkin: 'bi-check2-circle',
  passengers: 'bi-people-fill',
  seats: 'bi-grid-3x3-gap-fill',
  baggage: 'bi-luggage-fill',
  expenses: 'bi-receipt-cutoff',
  settlement: 'bi-cash-stack'
};

const busOpsActionIcons = {
  checkin: 'bi-check2-circle',
  payment: 'bi-cash-coin',
  noshow: 'bi-person-x-fill',
  details: 'bi-card-list',
  uncheck: 'bi-arrow-counterclockwise',
  edit: 'bi-pencil-square',
  'book-return': 'bi-arrow-left-right'
};

function busOpsIcon(name, extraClass = '') {
  const icon = document.createElement('i');
  icon.className = `bi ${name} ${extraClass}`.trim();
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function prependBusOpsIcon(element, name, marker = 'busops-inline-icon') {
  if (!element || element.querySelector(`:scope > .${marker}`)) return;
  element.prepend(busOpsIcon(name, marker));
}

function appendBusOpsIcon(element, name, marker = 'busops-inline-icon') {
  if (!element || element.querySelector(`:scope > .${marker}`)) return;
  element.append(busOpsIcon(name, marker));
}

function replaceBusOpsIcon(element, name, marker = 'busops-replaced-icon') {
  if (!element) return;
  const existing = element.querySelector(`:scope > .${marker}`);
  if (existing?.classList.contains(name) && element.childElementCount === 1) return;
  element.replaceChildren(busOpsIcon(name, marker));
}

function removeDirectSymbol(element, pattern) {
  if (!element) return;
  [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => {
    node.nodeValue = node.nodeValue.replace(pattern, '');
  });
}

function addBusOpsClasses(selector, ...classes) {
  document.querySelectorAll(selector).forEach(element => element.classList.add(...classes));
}

function applyBootstrapFoundation() {
  document.body.classList.add('bootstrap-app');
  document.querySelector('#app')?.setAttribute('data-bootstrap-ui', 'true');

  addBusOpsClasses('.panel', 'card', 'border-0', 'shadow-sm', 'rounded-4');
  addBusOpsClasses('.panel-head', 'card-header', 'bg-white', 'border-0');
  addBusOpsClasses('.primary', 'btn', 'btn-primary');
  addBusOpsClasses('.mini', 'btn', 'btn-sm', 'btn-outline-primary');
  addBusOpsClasses('.mini.danger,.delete-trip-button,.cancel-trip-button', 'btn', 'btn-outline-danger');
  addBusOpsClasses('.back', 'btn', 'btn-link');
  addBusOpsClasses('.pill,.payment-status,.expense-status,.tab-count', 'badge', 'rounded-pill');
  addBusOpsClasses('.avatar,.driver-portrait', 'rounded-circle');
  addBusOpsClasses('.table-scroll', 'table-responsive');
  addBusOpsClasses('table.list', 'table', 'table-hover', 'align-middle', 'mb-0');
  addBusOpsClasses('.stop-card', 'list-group-item', 'border-0');

  document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),textarea').forEach(control => control.classList.add('form-control'));
  document.querySelectorAll('select').forEach(control => control.classList.add('form-select'));
  document.querySelectorAll('input[type="checkbox"],input[type="radio"]').forEach(control => control.classList.add('form-check-input'));

  addBusOpsClasses('.dashboard-welcome,.dashboard-action-card,.dashboard-next-panel,.dashboard-quick-panel,.dashboard-today-panel,.dashboard-money-panel', 'card', 'border-0', 'shadow-sm', 'rounded-4');
  addBusOpsClasses('.dashboard-action-card,.dashboard-quick-panel button,.dashboard-next-actions button', 'btn');
  addBusOpsClasses('.ops-calendar-shell,.advanced-trip-economy,.trip-expense-browser,.branding-example,.account-profile-card,.trip-timetable,.trip-lifecycle-actions,.cash-transfer-panel,.settlement-intro,.expense-trip-context', 'card', 'border-0', 'shadow-sm', 'rounded-4');
  addBusOpsClasses('.ops-view-switch,.ops-date-nav', 'btn-group');
  addBusOpsClasses('.ops-view-switch button,.ops-date-nav button,.ops-calendar-toolbar button', 'btn', 'btn-outline-primary');
  addBusOpsClasses('.ops-alert-strip', 'alert', 'border-0', 'rounded-4');

  document.querySelectorAll('dialog').forEach(dialog => dialog.classList.add('bootstrap-dialog', 'rounded-4'));
  document.querySelector('#toast')?.classList.add('bootstrap-toast', 'shadow-lg');

  const genericButtonIcons = [
    ['[data-edit-stop],[data-edit-bus],[data-edit-driver],[data-edit-sales-manager],.timetable-edit', 'bi-pencil-square'],
    ['[data-delete-stop],[data-delete-bus],[data-delete-driver],[data-delete-sales-manager],.delete-trip-button', 'bi-trash3-fill'],
    ['.cancel-trip-button', 'bi-x-circle-fill'],
    ['#closeTripButton', 'bi-lock-fill'],
    ['#auditTripButton', 'bi-clock-history'],
    ['#editTimetable', 'bi-calendar2-week'],
    ['#brandingForm .primary', 'bi-image-fill'],
    ['#accountForm .primary', 'bi-shield-check'],
    ['#driverForm .primary,#salesManagerForm .primary,#stopForm .primary,#busForm .primary', 'bi-plus-circle-fill']
  ];
  genericButtonIcons.forEach(([selector, icon]) => document.querySelectorAll(selector).forEach(button => prependBusOpsIcon(button, icon)));
}

function applyBootstrapTripHero() {
  const trip = state.trip?.trip;
  const hero = document.querySelector('#view>.detail-hero');
  if (!trip || !hero || hero.classList.contains('bootstrap-trip-hero')) return;
  const main = hero.querySelector(':scope>div');
  const dateLine = main?.querySelector(':scope>small');
  const heading = main?.querySelector(':scope>h2');
  const meta = main?.querySelector(':scope>p');
  const status = hero.querySelector(':scope>.pill');
  if (!main || !dateLine || !heading || !status) return;

  hero.classList.add('bootstrap-trip-hero', 'card', 'border-0', 'shadow-sm', 'rounded-4');
  hero.dataset.tripStatus = trip.status || 'planned';
  main.classList.add('trip-hero-main');

  dateLine.classList.add('trip-hero-date', 'badge', 'rounded-pill');
  prependBusOpsIcon(dateLine, 'bi-calendar-event-fill', 'trip-hero-date-icon');
  heading.classList.add('trip-hero-route');
  prependBusOpsIcon(heading, 'bi-signpost-split-fill', 'trip-hero-route-icon');

  if (meta) {
    const lines = meta.innerText.split(/\n+/).map(line => line.trim()).filter(Boolean);
    meta.classList.add('trip-hero-meta');
    meta.replaceChildren(...lines.map((line, index) => {
      const item = document.createElement('span');
      item.className = 'trip-hero-meta-item';
      item.append(busOpsIcon(index === 0 ? 'bi-person-vcard-fill' : 'bi-bus-front-fill'));
      const copy = document.createElement('span');
      copy.textContent = line;
      item.append(copy);
      return item;
    }));
  }

  const statusWrap = document.createElement('span');
  statusWrap.className = 'trip-hero-status-wrap';
  const statusLabel = document.createElement('small');
  statusLabel.textContent = 'Turstatus';
  status.classList.add('trip-hero-status', 'badge', 'rounded-pill');
  prependBusOpsIcon(status, trip.status === 'completed' ? 'bi-check-circle-fill' : trip.status === 'cancelled' ? 'bi-x-circle-fill' : 'bi-clock-fill', 'trip-hero-status-icon');
  status.replaceWith(statusWrap);
  statusWrap.append(statusLabel, status);
}

function applyBootstrapInfoBoards() {
  const boards = [
    ['#view>.detail-hero', 'trip', 'bi-bus-front-fill'],
    ['.settlement-intro', 'settlement', 'bi-cash-stack'],
    ['.personal-cashbox-hero', 'cashbox', 'bi-wallet2'],
    ['.checkin-command', 'checkin', 'bi-person-check-fill'],
    ['.sales-start-banner', 'sales', 'bi-shop'],
    ['.dashboard-money-panel', 'economy', 'bi-graph-up-arrow']
  ];

  boards.forEach(([selector, tone, iconName]) => {
    document.querySelectorAll(selector).forEach(board => {
      board.classList.add('bootstrap-info-board', `bootstrap-info-${tone}`);
      if (board.querySelector(':scope>.bootstrap-info-visual')) return;
      const visual = document.createElement('span');
      visual.className = 'bootstrap-info-visual';
      visual.setAttribute('aria-hidden', 'true');
      const icon = busOpsIcon(iconName);
      const route = document.createElement('span');
      route.className = 'bootstrap-info-route';
      route.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
      visual.append(icon, route);
      board.append(visual);
    });
  });

  document.querySelectorAll('.cash-custody>div').forEach((card, index) => {
    card.classList.add('bootstrap-cash-info-card', 'card', 'border-0', 'shadow-sm', 'rounded-4');
    card.dataset.cashTone = index % 2 === 0 ? 'indigo' : 'teal';
    if (card.querySelector(':scope>.bootstrap-mini-info-icon')) return;
    const iconHost = document.createElement('span');
    iconHost.className = 'bootstrap-mini-info-icon';
    iconHost.append(busOpsIcon('bi-wallet2'));
    card.prepend(iconHost);
  });
}

function applyBootstrapNewTripDialog() {
  const form = document.querySelector('#createTrip');
  if (!form || form.classList.contains('bootstrap-new-trip-form')) return;
  const modalBody = form.closest('#modalBody');
  if (!modalBody) return;

  modalBody.classList.add('bootstrap-new-trip-modal');
  form.classList.add('bootstrap-new-trip-form');

  const heading = modalBody.querySelector(':scope>h2');
  const introduction = modalBody.querySelector(':scope>p');
  if (heading) {
    const header = document.createElement('header');
    header.className = 'bootstrap-new-trip-header';
    const iconHost = document.createElement('span');
    iconHost.className = 'bootstrap-new-trip-header-icon';
    iconHost.append(busOpsIcon('bi-calendar2-plus-fill'));
    const copy = document.createElement('span');
    copy.className = 'bootstrap-new-trip-header-copy';
    copy.append(heading);
    if (introduction) copy.append(introduction);
    header.append(iconHost, copy);
    modalBody.prepend(header);
  }

  const fieldDefinitions = {
    title: { icon: 'bi-pencil-square', section: 'schedule' },
    departureAt: { icon: 'bi-calendar-event-fill', section: 'schedule' },
    destinationArrivalAt: { icon: 'bi-calendar2-check-fill', section: 'schedule' },
    originId: { icon: 'bi-geo-alt-fill', section: 'route' },
    destinationId: { icon: 'bi-flag-fill', section: 'route' },
    busId: { icon: 'bi-bus-front-fill', section: 'route' },
    primaryDriverId: { icon: 'bi-person-badge-fill', section: 'staff' },
    secondaryDriverId: { icon: 'bi-person-plus-fill', section: 'staff' },
    salesManagerId: { icon: 'bi-shop', section: 'staff' }
  };
  const sectionDefinitions = [
    { key: 'schedule', icon: 'bi-clock-history', title: 'Tur og tider', description: 'Navn, afgang og forventet ankomst' },
    { key: 'route', icon: 'bi-signpost-split-fill', title: 'Rute og bus', description: 'Startsted, slutsted og køretøj' },
    { key: 'staff', icon: 'bi-people-fill', title: 'Bemanding', description: 'Chauffører og salgschef ved start' }
  ];
  const sections = new Map();
  sectionDefinitions.forEach(definition => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = `bootstrap-trip-form-section bootstrap-trip-form-${definition.key} card border-0 rounded-4`;
    const legend = document.createElement('legend');
    legend.className = 'bootstrap-trip-form-legend';
    const iconHost = document.createElement('span');
    iconHost.append(busOpsIcon(definition.icon));
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = definition.title;
    const description = document.createElement('small');
    description.textContent = definition.description;
    copy.append(title, description);
    legend.append(iconHost, copy);
    const fields = document.createElement('div');
    fields.className = 'bootstrap-trip-form-fields';
    fieldset.append(legend, fields);
    sections.set(definition.key, { fieldset, fields });
  });

  [...form.querySelectorAll(':scope>label')].forEach(label => {
    const control = label.querySelector('input,select,textarea');
    const definition = fieldDefinitions[control?.name];
    if (!control || !definition) return;
    label.classList.add('bootstrap-trip-field', `bootstrap-trip-field-${control.name}`);
    const directText = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const labelText = document.createElement('span');
    labelText.className = 'bootstrap-trip-field-label';
    labelText.textContent = directText?.textContent.trim() || control.name;
    directText?.remove();
    const controlGroup = document.createElement('span');
    controlGroup.className = 'bootstrap-trip-control input-group';
    const iconHost = document.createElement('span');
    iconHost.className = 'input-group-text';
    iconHost.append(busOpsIcon(definition.icon));
    control.before(controlGroup);
    controlGroup.append(iconHost, control);
    label.prepend(labelText);
    sections.get(definition.section)?.fields.append(label);
  });

  sectionDefinitions.forEach(definition => form.append(sections.get(definition.key).fieldset));
  const submit = form.querySelector('button[type="submit"],button');
  if (submit) {
    submit.type = 'submit';
    submit.classList.add('btn', 'btn-primary', 'bootstrap-create-trip-submit');
    prependBusOpsIcon(submit, 'bi-check2-circle', 'bootstrap-create-trip-icon');
    const footer = document.createElement('footer');
    footer.className = 'bootstrap-new-trip-footer';
    const assurance = document.createElement('span');
    assurance.className = 'bootstrap-trip-form-assurance';
    assurance.append(busOpsIcon('bi-shield-check'), document.createTextNode('Tider vises i Europe/Copenhagen'));
    footer.append(assurance, submit);
    form.append(footer);
  }
}

function applyBootstrapEconomyDashboard() {
  const control = document.querySelector('#view>.economy-control');
  if (!control) return;
  control.classList.add('bootstrap-economy-control', 'card', 'border-0', 'shadow-sm', 'rounded-4');

  const heading = control.querySelector(':scope>div:first-child');
  if (heading && !heading.classList.contains('bootstrap-economy-heading')) {
    heading.classList.add('bootstrap-economy-heading');
    const iconHost = document.createElement('span');
    iconHost.className = 'bootstrap-economy-heading-icon';
    iconHost.append(busOpsIcon('bi-graph-up-arrow'));
    const copy = document.createElement('span');
    copy.className = 'bootstrap-economy-heading-copy';
    while (heading.firstChild) copy.append(heading.firstChild);
    heading.append(iconHost, copy);
  }

  const filterIcons = {
    economyFrom: 'bi-calendar-event',
    economyTo: 'bi-calendar2-check',
    economyTrip: 'bi-bus-front-fill',
    economyCurrency: 'bi-currency-exchange'
  };
  control.querySelectorAll('.economy-filters label').forEach(label => {
    const field = label.querySelector('input,select');
    label.classList.add('bootstrap-economy-filter');
    if (!field || label.querySelector(':scope>.bootstrap-economy-filter-label')) return;
    const directText = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const labelText = document.createElement('span');
    labelText.className = 'bootstrap-economy-filter-label';
    labelText.textContent = directText?.textContent.trim() || '';
    directText?.remove();
    prependBusOpsIcon(labelText, filterIcons[field.id] || 'bi-funnel-fill', 'bootstrap-economy-filter-icon');
    label.prepend(labelText);
  });
  const reset = control.querySelector('#resetEconomy');
  const exportButton = control.querySelector('#exportEconomy');
  reset?.classList.add('btn', 'btn-outline-primary', 'bootstrap-economy-action');
  exportButton?.classList.add('btn', 'btn-primary', 'bootstrap-economy-action');

  const totalDefinitions = [
    ['revenue', 'bi-cash-coin'],
    ['expenses', 'bi-receipt-cutoff'],
    ['net', 'bi-graph-up-arrow'],
    ['occupancy', 'bi-people-fill']
  ];
  control.querySelectorAll('.economy-totals>div').forEach((card, index) => {
    const [tone, iconName] = totalDefinitions[index] || ['neutral', 'bi-bar-chart-fill'];
    card.classList.add('bootstrap-economy-total', `bootstrap-economy-${tone}`, 'card', 'border-0', 'rounded-3');
    if (!card.querySelector(':scope>.bootstrap-economy-total-icon')) {
      const iconHost = document.createElement('span');
      iconHost.className = 'bootstrap-economy-total-icon';
      iconHost.append(busOpsIcon(iconName));
      card.prepend(iconHost);
    }
  });

  const advanced = document.querySelector('#advancedTripEconomy');
  if (advanced) {
    advanced.classList.add('bootstrap-advanced-economy', 'card', 'border-0', 'shadow-sm', 'rounded-4');
    const advancedHead = advanced.querySelector('.advanced-economy-head');
    if (advancedHead && !advancedHead.querySelector(':scope>.bootstrap-economy-section-icon')) {
      const iconHost = document.createElement('span');
      iconHost.className = 'bootstrap-economy-section-icon';
      iconHost.append(busOpsIcon('bi-pie-chart-fill'));
      advancedHead.prepend(iconHost);
    }
    const kpis = [
      ['ticket', 'bi-ticket-perforated-fill'],
      ['baggage', 'bi-luggage-fill'],
      ['expense', 'bi-receipt-cutoff'],
      ['net', 'bi-graph-up-arrow']
    ];
    advanced.querySelectorAll('.advanced-kpis>div').forEach((card, index) => {
      const [tone, iconName] = kpis[index] || ['neutral', 'bi-bar-chart-fill'];
      card.classList.add('bootstrap-advanced-kpi', `bootstrap-advanced-${tone}`, 'card', 'border-0', 'rounded-4');
      if (!card.querySelector(':scope>.bootstrap-advanced-kpi-icon')) {
        const iconHost = document.createElement('span');
        iconHost.className = 'bootstrap-advanced-kpi-icon';
        iconHost.append(busOpsIcon(iconName));
        card.prepend(iconHost);
      }
    });
    advanced.querySelectorAll('.cash-flow-panel,.revenue-mix,.trip-economy-list').forEach(panel => panel.classList.add('bootstrap-economy-panel', 'card', 'border-0', 'rounded-4'));
    prependBusOpsIcon(advanced.querySelector('.cash-flow-panel>h3'), 'bi-wallet2', 'bootstrap-economy-panel-icon');
    prependBusOpsIcon(advanced.querySelector('.revenue-mix>h3'), 'bi-pie-chart', 'bootstrap-economy-panel-icon');
    prependBusOpsIcon(advanced.querySelector('.trip-economy-list>header>h3'), 'bi-list-check', 'bootstrap-economy-panel-icon');
    advanced.querySelectorAll('.cash-stage').forEach((stage, index) => {
      stage.classList.add('bootstrap-cash-stage');
      if (!stage.querySelector(':scope>.bootstrap-cash-stage-icon')) {
        const icons = ['bi-shop', 'bi-building-check', 'bi-person-badge'];
        const iconHost = document.createElement('span');
        iconHost.className = 'bootstrap-cash-stage-icon';
        iconHost.append(busOpsIcon(icons[index % 3]));
        stage.prepend(iconHost);
      }
    });
  }

  document.querySelectorAll('#view>.finance-grid>.stat').forEach((card, index) => {
    const definitions = [
      ['ticket', 'bi-ticket-perforated-fill'], ['dkk', 'bi-cash-coin'], ['eur', 'bi-currency-euro'],
      ['baggage', 'bi-luggage-fill'], ['dkk', 'bi-cash-coin'], ['eur', 'bi-currency-euro']
    ];
    const [tone, iconName] = definitions[index] || ['neutral', 'bi-bar-chart-fill'];
    card.classList.add('bootstrap-finance-stat', `bootstrap-finance-${tone}`, 'card', 'border-0', 'rounded-4');
    if (!card.querySelector(':scope>.bootstrap-finance-stat-icon')) {
      const iconHost = document.createElement('span');
      iconHost.className = 'bootstrap-finance-stat-icon';
      iconHost.append(busOpsIcon(iconName));
      card.prepend(iconHost);
    }
  });
  document.querySelectorAll('#view>.office-cash>div').forEach(card => {
    card.classList.add('bootstrap-office-cash-card', 'card', 'border-0', 'rounded-4');
    prependBusOpsIcon(card, 'bi-building-check', 'bootstrap-office-cash-icon');
  });

  document.querySelectorAll('#view>.report-section,#view>.trip-profit-panel').forEach(panel => {
    panel.classList.add('bootstrap-report-panel', 'card', 'border-0', 'shadow-sm', 'rounded-4');
    const title = panel.querySelector('.panel-head h2');
    const text = title?.textContent || '';
    const iconName = /bagage/i.test(text) ? 'bi-luggage-fill'
      : /rentabilitet/i.test(text) ? 'bi-graph-up-arrow'
        : /kontant/i.test(text) ? 'bi-wallet2'
          : 'bi-ticket-perforated-fill';
    prependBusOpsIcon(title, iconName, 'bootstrap-report-title-icon');
  });
  const expenseBrowser = document.querySelector('#tripExpenseBrowser');
  if (expenseBrowser) {
    expenseBrowser.classList.add('bootstrap-economy-expense-browser');
    prependBusOpsIcon(expenseBrowser.querySelector('.trip-expense-browser-head h2'), 'bi-folder2-open', 'bootstrap-report-title-icon');
  }
}

function applyBootstrapTripTabs() {
  if (!state.trip?.trip) return;
  const tabs = document.querySelector('#view>.tabs');
  if (!tabs) return;

  const passengers = state.trip.passengers || [];
  const seats = state.trip.seats || [];
  const pendingCheckIn = passengers.filter(passenger => !passenger.checkedIn && passenger.attendanceStatus !== 'no_show').length;
  const pendingSettlement = (state.trip.settlements || []).filter(item => item.status === 'pending').length;
  const definitions = {
    checkin: { count: pendingCheckIn, label: 'passagerer afventer check-in' },
    passengers: { count: passengers.length, label: 'passagerer' },
    seats: { count: seats.filter(seat => !seat.passengerId).length, label: 'ledige sæder' },
    baggage: { count: (state.trip.baggage || []).length, label: 'bagageforsendelser' },
    expenses: { count: (state.trip.expenses || []).length, label: 'udgifter' },
    settlement: { count: pendingSettlement, label: 'afstemninger afventer' }
  };

  tabs.classList.add('bootstrap-trip-tabs', 'nav', 'nav-pills', 'card', 'border-0', 'shadow-sm', 'rounded-4');
  tabs.setAttribute('role', 'tablist');
  tabs.querySelectorAll(':scope>.tab').forEach(tab => {
    const key = tab.hasAttribute('data-checkin-tab') ? 'checkin'
      : tab.hasAttribute('data-expense-tab') ? 'expenses'
        : tab.hasAttribute('data-settlement-tab') ? 'settlement'
          : tab.dataset.tab;
    const definition = definitions[key];
    if (!definition) return;

    tab.classList.add('bootstrap-trip-tab', 'nav-link');
    tab.dataset.tripTab = key;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(tab.classList.contains('active')));

    let count = tab.querySelector(':scope>.tab-count,:scope>.bootstrap-trip-tab-count');
    if (!count) {
      count = document.createElement('span');
      tab.append(count);
    }
    count.classList.add('tab-count', 'bootstrap-trip-tab-count', 'badge', 'rounded-pill');
    count.classList.toggle('attention', (key === 'checkin' || key === 'settlement') && definition.count > 0);
    if (count.textContent !== String(definition.count)) count.textContent = String(definition.count);
    count.setAttribute('aria-label', `${definition.count} ${definition.label}`);
  });

  if (!tabs.dataset.activeTabAligned) {
    tabs.dataset.activeTabAligned = 'true';
    requestAnimationFrame(() => {
      const active = tabs.querySelector(':scope>.bootstrap-trip-tab.active');
      if (!active || tabs.scrollWidth <= tabs.clientWidth) return;
      tabs.scrollLeft = Math.max(0, active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2);
    });
  }
}

function applyBootstrapTripKpis() {
  if (!state.trip?.trip) return;
  const stats = document.querySelector('#view>.stats');
  if (!stats || stats.classList.contains('bootstrap-trip-kpis')) return;
  const passengers = state.trip.passengers?.length || 0;
  const checked = state.trip.passengers?.filter(passenger => passenger.checkedIn).length || 0;
  const capacity = Number(state.trip.trip.seatCount || state.trip.seats?.length || 0);
  const freeSeats = Math.max(0, capacity - passengers);
  const baggage = state.trip.baggage?.length || 0;
  const cards = [...stats.querySelectorAll(':scope>.stat')];
  const items = [
    { key: 'passengers', icon: 'bi-people-fill', tone: 'blue', percent: capacity ? Math.round(passengers / capacity * 100) : 0, footer: `Belægning ${capacity ? Math.round(passengers / capacity * 100) : 0}%` },
    { key: 'checked', icon: 'bi-check-circle-fill', tone: 'green', percent: passengers ? Math.round(checked / passengers * 100) : 0, footer: `${checked} af ${passengers} gennemført` },
    { key: 'free', icon: 'bi-grid-3x3-gap-fill', tone: 'violet', percent: capacity ? Math.round(freeSeats / capacity * 100) : 0, footer: `${freeSeats} af ${capacity} disponible` },
    { key: 'baggage', icon: 'bi-luggage-fill', tone: 'amber', percent: null, footer: `${baggage} forsendelser på turen` }
  ];
  stats.classList.add('bootstrap-trip-kpis');
  cards.forEach((card, index) => {
    const item = items[index];
    if (!item) return;
    card.classList.add('card', 'border-0', 'shadow-sm', 'rounded-4', `trip-kpi-${item.tone}`);
    card.dataset.tripKpi = item.key;
    const iconHost = document.createElement('span');
    iconHost.className = 'trip-kpi-icon';
    iconHost.append(busOpsIcon(item.icon));
    const copy = document.createElement('span');
    copy.className = 'trip-kpi-copy';
    const label = card.querySelector(':scope>small');
    const value = card.querySelector(':scope>strong');
    if (label) copy.append(label);
    if (value) copy.append(value);
    card.prepend(iconHost);
    card.append(copy);
    const footer = document.createElement('span');
    footer.className = 'trip-kpi-footer';
    const footerText = document.createElement('small');
    footerText.textContent = item.footer;
    footer.append(footerText);
    if (item.percent !== null) {
      const progress = document.createElement('span');
      progress.className = 'trip-kpi-progress';
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '100');
      progress.setAttribute('aria-valuenow', String(item.percent));
      const fill = document.createElement('i');
      fill.style.width = `${Math.min(100, Math.max(0, item.percent))}%`;
      progress.append(fill);
      footer.append(progress);
    }
    card.append(footer);
  });
}

function applyBootstrapExpenseFolder() {
  document.querySelectorAll('.expense-folder-hero').forEach(hero => {
    hero.classList.add('bootstrap-expense-folder', 'card', 'rounded-4');

    if (!hero.querySelector(':scope > .bootstrap-expense-folder-icon')) {
      const iconHost = document.createElement('span');
      iconHost.className = 'bootstrap-expense-folder-icon';
      iconHost.append(busOpsIcon('bi-folder2-open'));
      hero.prepend(iconHost);
    }

    const addButton = hero.querySelector('#jumpExpenseForm');
    if (addButton) {
      removeDirectSymbol(addButton, /^\s*\+\s*/);
      addButton.classList.add('btn', 'btn-primary', 'bootstrap-expense-add');
      prependBusOpsIcon(addButton, 'bi-plus-circle-fill', 'bootstrap-expense-add-icon');
    }
  });
}

function applyBootstrapDashboard() {
  const welcome = document.querySelector('.dashboard-welcome');
  if (!welcome) return;

  welcome.classList.add('bootstrap-dashboard-welcome', 'card', 'border-0', 'rounded-4');
  const actionSection = document.querySelector('.dashboard-action-section');
  if (actionSection) {
    actionSection.classList.add('bootstrap-dashboard-action-section');
    const actionCount = actionSection.querySelectorAll('.dashboard-action-card.attention').length;
    actionSection.classList.toggle('dashboard-all-clear', actionCount === 0);
    const status = actionSection.querySelector(':scope > header > span');
    if (status && actionCount === 0) {
      if (!status.classList.contains('dashboard-all-clear-status')) {
        status.textContent = 'Alt er i orden';
        status.classList.add('dashboard-all-clear-status');
      }
      prependBusOpsIcon(status, 'bi-check-circle-fill', 'dashboard-status-icon');
    }
  }

  const actionIconMap = [
    [/konflikt/i, 'bi-calendar-x-fill'],
    [/udgift/i, 'bi-receipt-cutoff'],
    [/kvittering/i, 'bi-file-earmark-check-fill'],
    [/betaling|kontant/i, 'bi-cash-stack'],
    [/passager/i, 'bi-people-fill'],
    [/bagage/i, 'bi-luggage-fill'],
    [/tur/i, 'bi-bus-front-fill']
  ];
  document.querySelectorAll('.dashboard-action-card').forEach(card => {
    card.classList.add('bootstrap-dashboard-action-card', 'card', 'border-0', 'rounded-4');
    const title = card.querySelector('b')?.textContent || '';
    const iconName = actionIconMap.find(([pattern]) => pattern.test(title))?.[1] || 'bi-exclamation-circle-fill';
    const iconHost = card.querySelector('.dashboard-action-icon');
    if (iconHost && !iconHost.querySelector('.bi')) iconHost.replaceChildren(busOpsIcon(iconName));
    const arrow = card.querySelector(':scope > i');
    if (arrow && !arrow.querySelector('.bi')) arrow.replaceChildren(busOpsIcon('bi-chevron-right'));
  });

  const quickIconMap = {
    'new-trip': 'bi-plus-lg',
    calendar: 'bi-calendar3',
    drivers: 'bi-person-badge',
    economy: 'bi-graph-up',
    checkin: 'bi-check2-circle',
    passenger: 'bi-person-plus',
    baggage: 'bi-luggage',
    expenses: 'bi-receipt',
    cash: 'bi-wallet2'
  };
  document.querySelectorAll('.dashboard-quick-panel [data-dashboard-quick]').forEach(button => {
    button.classList.add('bootstrap-dashboard-quick-action');
    const iconHost = button.querySelector(':scope > span');
    const iconName = quickIconMap[button.dataset.dashboardQuick] || 'bi-arrow-right-circle-fill';
    if (iconHost && !iconHost.querySelector('.bi')) iconHost.replaceChildren(busOpsIcon(iconName));
    const arrow = button.querySelector(':scope > b');
    if (arrow && !arrow.querySelector('.bi')) arrow.replaceChildren(busOpsIcon('bi-chevron-right'));
  });
  document.querySelectorAll('.dashboard-quick-panel [data-sales-expense-quick]').forEach(button => {
    button.classList.add('bootstrap-dashboard-quick-action');
    const iconHost = button.querySelector(':scope > span:first-child');
    if (iconHost && !iconHost.querySelector('.bi')) iconHost.replaceChildren(busOpsIcon('bi-receipt-cutoff'));
    const arrow = button.querySelector(':scope > b');
    if (arrow && !arrow.querySelector('.bi')) arrow.replaceChildren(busOpsIcon('bi-chevron-right'));
  });

  document.querySelectorAll('.dashboard-next-panel,.dashboard-quick-panel,.dashboard-today-panel,.dashboard-money-panel').forEach(panel => {
    panel.classList.add('bootstrap-dashboard-panel', 'card', 'border-0', 'rounded-4');
  });
  prependBusOpsIcon(document.querySelector('.dashboard-next-panel [data-dashboard-action="calendar"]'), 'bi-calendar3');
  prependBusOpsIcon(document.querySelector('.dashboard-today-panel [data-dashboard-action="calendar"]'), 'bi-calendar3');
  prependBusOpsIcon(document.querySelector('.dashboard-money-panel [data-dashboard-action]'), 'bi-arrow-up-right-circle');
  prependBusOpsIcon(document.querySelector('[data-dashboard-open-trip]'), 'bi-box-arrow-up-right');
  prependBusOpsIcon(document.querySelector('[data-dashboard-checkin]'), 'bi-check2-circle');
}

function applyBootstrapLegacyIcons() {
  const iconHosts = [
    ['.close', 'bi-x-lg'],
    ['.trip-row > b', 'bi-chevron-right'],
    ['.bootstrap-route > i', 'bi-arrow-right'],
    ['.bootstrap-family-group > summary > i', 'bi-chevron-down'],
    ['.payment-dialog-icon', 'bi-check-lg'],
    ['.setra-deck .deck-icon', 'bi-bus-front-fill'],
    ['.seat-picker-launcher > span', 'bi-grid-3x3-gap-fill'],
    ['.seat-picker-launcher > i', 'bi-chevron-right'],
    ['.booking-confirmation > i', 'bi-check-lg'],
    ['[data-remove-group-member]', 'bi-x-lg'],
    ['.budget-transfer-privacy > b', 'bi-shield-check'],
    ['.transfer-recipient > i', 'bi-arrow-right'],
    ['.picture-extra-seat.selected > span', 'bi-check-lg'],
    ['.picture-extra-seat:not(.selected) > span', 'bi-plus-lg'],
    ['.trip-economy-detail > summary > b', 'bi-chevron-down'],
    ['#previousExpenseTrip', 'bi-chevron-left'],
    ['#nextExpenseTrip', 'bi-chevron-right'],
    ['.trip-expense-folder-icon', 'bi-folder-fill'],
    ['.trip-expense-folder > i', 'bi-check-circle-fill'],
    ['.trip-expense-empty > span', 'bi-check-circle-fill'],
    ['.picture-bus-icon', 'bi-bus-front-fill'],
    ['#driverTicketShortcut > b', 'bi-ticket-perforated-fill'],
    ['#driverTicketShortcut > i', 'bi-arrow-right'],
    ['#driverBaggageShortcut > b', 'bi-luggage-fill'],
    ['#driverBaggageShortcut > i', 'bi-arrow-right'],
    ['.account-security-note > b', 'bi-shield-lock-fill'],
    ['.driver-ticket-note > b', 'bi-cash-coin'],
    ['.driver-baggage-note > b', 'bi-camera-fill'],
    ['.bus-icon', 'bi-bus-front-fill'],
    ['.stop-pin', 'bi-geo-alt-fill'],
    ['.checkin-more > summary', 'bi-three-dots']
  ];
  iconHosts.forEach(([selector, iconName]) => document.querySelectorAll(selector).forEach(host => replaceBusOpsIcon(host, iconName)));

  document.querySelectorAll('.personal-login-lock > b').forEach(host => {
    replaceBusOpsIcon(host, host.textContent.includes('⌑') ? 'bi-receipt-cutoff' : 'bi-shield-lock-fill');
  });

  const lockedStatusHosts = [
    '.assignment-lock',
    '.trip-sales-assignment.locked > span',
    '.delete-trip-locked',
    '.trip-closed-banner > span'
  ];
  document.querySelectorAll(lockedStatusHosts.join(',')).forEach(host => {
    removeDirectSymbol(host, /^\s*🔒\s*/u);
    prependBusOpsIcon(host, 'bi-lock-fill', 'busops-lock-icon');
  });

  document.querySelectorAll('.picture-stars').forEach(host => {
    if (host.querySelector('.bi')) return;
    host.replaceChildren(...Array.from({ length: 4 }, () => busOpsIcon('bi-star-fill')));
    host.setAttribute('aria-label', 'Fire stjerner');
  });

  document.querySelectorAll('.baggage-photo-link').forEach(link => {
    removeDirectSymbol(link, /^\s*▣\s*/);
    prependBusOpsIcon(link, 'bi-image-fill', 'busops-baggage-photo-icon');
  });
  document.querySelectorAll('.baggage-photo-missing').forEach(status => {
    prependBusOpsIcon(status, 'bi-image-alt', 'busops-baggage-photo-icon');
  });
  document.querySelectorAll('.checkin-audit').forEach(status => {
    removeDirectSymbol(status, /^\s*✓\s*/);
    prependBusOpsIcon(status, 'bi-person-check-fill', 'busops-checkin-audit-icon');
  });
  document.querySelectorAll('.timetable-stop.completed > i').forEach(host => replaceBusOpsIcon(host, 'bi-check-lg'));

  document.querySelectorAll('.deck-title > span').forEach(host => {
    const deckLabel = host.parentElement?.textContent || '';
    const iconName = deckLabel.includes('Under') || host.textContent.includes('↓') || host.closest('.lower') ? 'bi-arrow-down' : 'bi-arrow-up';
    replaceBusOpsIcon(host, iconName);
  });
  document.querySelectorAll('.orientation-bus > div > b').forEach(host => {
    const iconName = host.textContent.includes('Under') || host.textContent.includes('↓') ? 'bi-arrow-down' : 'bi-arrow-up';
    removeDirectSymbol(host, /[↑↓]/g);
    prependBusOpsIcon(host, iconName, 'busops-deck-direction-icon');
  });

  const ticketIcons = ['bi-arrow-right', 'bi-arrow-left-right', 'bi-calendar2-week'];
  document.querySelectorAll('.ticket-type-cards label').forEach((label, index) => {
    const host = label.querySelector(':scope > span > i');
    if (host) replaceBusOpsIcon(host, ticketIcons[index] || 'bi-ticket-perforated-fill');
  });

  const prefixedIcons = [
    ['.booking-safe', 'bi-shield-check'],
    ['.transfer-security', 'bi-shield-check'],
    ['.all-settled', 'bi-check-circle-fill'],
    ['.connection-banner.online', 'bi-circle-fill'],
    ['.connection-banner.offline', 'bi-cloud-slash-fill'],
    ['.checkin-search', 'bi-search'],
    ['.checked-label', 'bi-check-circle-fill']
  ];
  prefixedIcons.forEach(([selector, iconName]) => document.querySelectorAll(selector).forEach(element => {
    removeDirectSymbol(element, /^\s*[✓●⌕]\s*/);
    prependBusOpsIcon(element, iconName, 'busops-status-icon');
  }));

  document.querySelectorAll('[data-check],[data-fast-check]').forEach(button => {
    removeDirectSymbol(button, /^\s*✓\s*/);
    prependBusOpsIcon(button, button.classList.contains('done') ? 'bi-check-circle-fill' : 'bi-check2-circle', 'busops-check-icon');
  });
  document.querySelectorAll('.expense-card-icon').forEach(host => replaceBusOpsIcon(host, host.textContent.trim() === '!' ? 'bi-exclamation-triangle-fill' : 'bi-receipt-cutoff'));
  document.querySelectorAll('.reimbursement.paid').forEach(status => {
    removeDirectSymbol(status, /^\s*✓\s*/);
    prependBusOpsIcon(status, 'bi-check-circle-fill', 'busops-reimbursement-icon');
  });
  document.querySelectorAll('.icon-action').forEach(button => {
    const value = button.textContent.trim();
    if (value === '×') replaceBusOpsIcon(button, 'bi-person-x-fill');
    else if (value === '•••') replaceBusOpsIcon(button, 'bi-three-dots');
    else if (value === '☎') replaceBusOpsIcon(button, 'bi-telephone-fill');
  });

  document.querySelectorAll('[data-booking-back]').forEach(button => {
    removeDirectSymbol(button, /^\s*←\s*/);
    prependBusOpsIcon(button, 'bi-arrow-left', 'busops-booking-nav-icon');
  });
  document.querySelectorAll('#pictureSeatBack').forEach(button => {
    removeDirectSymbol(button, /^\s*←\s*/);
    prependBusOpsIcon(button, 'bi-arrow-left', 'busops-seat-back-icon');
  });
  document.querySelectorAll('[data-booking-next],#completeStop').forEach(button => {
    removeDirectSymbol(button, /\s*→\s*$/);
    appendBusOpsIcon(button, 'bi-arrow-right', 'busops-booking-nav-icon');
  });
  document.querySelectorAll('[data-dashboard-action]').forEach(button => {
    removeDirectSymbol(button, /\s*→\s*$/);
  });
  document.querySelectorAll('#openSelectedTripExpenses').forEach(button => {
    removeDirectSymbol(button, /\s*→\s*$/);
    prependBusOpsIcon(button, 'bi-folder2-open', 'busops-expense-open-icon');
  });
  document.querySelectorAll('#resetEconomy').forEach(button => prependBusOpsIcon(button, 'bi-arrow-counterclockwise'));
  document.querySelectorAll('#exportEconomy').forEach(button => prependBusOpsIcon(button, 'bi-filetype-csv'));
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
    removeDirectSymbol(link, /\s*↗\s*$/);
    appendBusOpsIcon(link, 'bi-box-arrow-up-right', 'busops-external-link-icon');
  });

  const expenseActionIcons = [
    ['[data-approve-expense],[data-admin-approve-expense]', 'bi-check-circle-fill'],
    ['[data-reject-expense],[data-admin-reject-expense]', 'bi-x-circle-fill'],
    ['[data-reimburse-expense],[data-admin-reimburse-expense]', 'bi-cash-coin'],
    ['[data-forward-expense]', 'bi-send-fill'],
    ['.attach-receipt', 'bi-paperclip']
  ];
  expenseActionIcons.forEach(([selector, iconName]) => document.querySelectorAll(selector).forEach(control => prependBusOpsIcon(control, iconName)));

  document.querySelectorAll('.cash-stage:not(:last-child)').forEach(stage => {
    appendBusOpsIcon(stage, 'bi-arrow-right', 'bootstrap-cash-flow-arrow');
  });
}

function applyBootstrapStopWorkspace() {
  addBusOpsClasses('.stop-management-hero,.stop-create-drawer,.stop-places-view,.stop-timetable-view,.live-trip-panel,.trip-live-route', 'card', 'border-0', 'shadow-sm', 'rounded-4');
  addBusOpsClasses('.stop-place-card,.stop-timetable-card', 'card', 'border-0', 'rounded-4');
  document.querySelectorAll('.stop-management-shell button,.trip-live-route button,.live-trip-panel button').forEach(button => button.classList.add('btn'));
  document.querySelectorAll('.stop-management-shell .bi,.trip-live-route .bi,.live-trip-panel .bi').forEach(icon => icon.setAttribute('aria-hidden', 'true'));
}

function applyBusOpsBootstrapIcons() {
  applyBootstrapFoundation();
  document.querySelectorAll('.nav[data-view]').forEach(button => {
    const iconName = busOpsNavIcons[button.dataset.view];
    if (!iconName || button.querySelector(':scope > .nav-bi')) return;
    [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
    button.prepend(busOpsIcon(iconName, 'nav-bi'));
  });

  const logout = document.querySelector('#logout');
  if (logout && !logout.querySelector('.bi')) {
    logout.replaceChildren(busOpsIcon('bi-box-arrow-right'));
    logout.setAttribute('aria-label', 'Log ud');
  }

  const newTrip = document.querySelector('#newTrip');
  if (newTrip) {
    removeDirectSymbol(newTrip, /^\s*\+\s*/);
    prependBusOpsIcon(newTrip, 'bi-calendar2-plus-fill');
    newTrip.classList.add('bootstrap-new-trip-button', 'btn', 'btn-primary');
  }

  document.querySelectorAll('.back').forEach(button => {
    removeDirectSymbol(button, /^\s*[←â†]\s*/);
    prependBusOpsIcon(button, 'bi-arrow-left');
  });

  document.querySelectorAll('.tab').forEach(tab => {
    let iconName = '';
    if (tab.hasAttribute('data-driver-sales-tab')) iconName = 'bi-ticket-perforated-fill';
    else if (tab.dataset.tab) iconName = busOpsTabIcons[tab.dataset.tab] || '';
    else if (tab.hasAttribute('data-checkin-tab')) iconName = busOpsTabIcons.checkin;
    else if (tab.hasAttribute('data-expense-tab')) iconName = busOpsTabIcons.expenses;
    else if (tab.hasAttribute('data-settlement-tab')) iconName = busOpsTabIcons.settlement;
    if (iconName) prependBusOpsIcon(tab, iconName, 'tab-bi');
  });
  applyBootstrapTripTabs();

  const kpiIcons = [
    ['.bootstrap-kpi-icon.total', 'bi-people-fill'],
    ['.bootstrap-kpi-icon.pending', 'bi-clock-history'],
    ['.bootstrap-kpi-icon.checked', 'bi-check-circle-fill'],
    ['.bootstrap-kpi-icon.noshow', 'bi-person-x-fill']
  ];
  kpiIcons.forEach(([selector, iconName]) => document.querySelectorAll(selector).forEach(host => {
    if (!host.querySelector('.bi')) host.replaceChildren(busOpsIcon(iconName));
  }));

  document.querySelectorAll('.bootstrap-family-icon').forEach(host => {
    if (!host.querySelector('.bi')) host.replaceChildren(busOpsIcon('bi-people-fill'));
  });
  document.querySelectorAll('.bootstrap-search .input-group-text').forEach(host => {
    if (!host.querySelector('.bi')) host.replaceChildren(busOpsIcon('bi-search'));
  });
  document.querySelectorAll('.bootstrap-open-indicator b').forEach(host => {
    if (!host.querySelector('.bi')) host.replaceChildren(busOpsIcon('bi-chevron-right'));
  });
  document.querySelectorAll('.checkin-name-trigger>i').forEach(host => {
    if (!host.classList.contains('bi') && !host.querySelector('.bi')) host.replaceChildren(busOpsIcon('bi-chevron-right'));
  });

  prependBusOpsIcon(document.querySelector('#clearPassengerFilters'), 'bi-arrow-counterclockwise');
  prependBusOpsIcon(document.querySelector('#exportPassengers'), 'bi-filetype-csv');
  prependBusOpsIcon(document.querySelector('#printPassengers'), 'bi-printer');
  const allPassengers = document.querySelector('#allPickupChip strong');
  if (allPassengers) prependBusOpsIcon(allPassengers, 'bi-people-fill');

  document.querySelectorAll('[data-sheet-action]').forEach(button => {
    const host = button.querySelector('i');
    const iconName = busOpsActionIcons[button.dataset.sheetAction];
    if (host && iconName && !host.classList.contains('bi')) {
      host.textContent = '';
      host.className = `bi ${iconName}`;
      host.setAttribute('aria-hidden', 'true');
    }
  });
  document.querySelectorAll('.passenger-action-grid a[href^="tel:"] i').forEach(host => {
    if (!host.classList.contains('bi')) {
      host.textContent = '';
      host.className = 'bi bi-telephone-fill';
      host.setAttribute('aria-hidden', 'true');
    }
  });
  applyBootstrapTripHero();
  applyBootstrapInfoBoards();
  applyBootstrapNewTripDialog();
  applyBootstrapTripKpis();
  applyBootstrapExpenseFolder();
  applyBootstrapDashboard();
  applyBootstrapEconomyDashboard();
  applyBootstrapStopWorkspace();
  applyBootstrapLegacyIcons();
}

let busOpsIconUpdatePending = false;
const busOpsIconObserver = new MutationObserver(() => {
  if (busOpsIconUpdatePending) return;
  busOpsIconUpdatePending = true;
  queueMicrotask(() => {
    busOpsIconUpdatePending = false;
    applyBusOpsBootstrapIcons();
  });
});
busOpsIconObserver.observe(document.body, { childList: true, subtree: true });
applyBusOpsBootstrapIcons();

addTranslation('Turstatus', 'Statusi i udhëtimit', 'Fahrtstatus', 'Trip status');

[
  ['Belægning', 'Mbushja', 'Auslastung', 'Occupancy'],
  ['gennemført', 'përfunduar', 'abgeschlossen', 'completed'],
  ['disponible', 'të lira', 'verfügbar', 'available'],
  ['forsendelser på turen', 'dërgesa në udhëtim', 'Sendungen auf der Fahrt', 'shipments on the trip']
].forEach(row => addTranslation(...row));

// Bootstrap driftskalender: ugeplan på PC, dagsliste på mobil og kompakte driftkort.
function enhanceBootstrapOperationsCalendar() {
  const shell = document.querySelector('.ops-calendar-shell');
  if (!shell || shell.classList.contains('bootstrap-operations-calendar')) return;
  shell.classList.add('bootstrap-operations-calendar', 'card', 'border-0', 'shadow-sm', 'rounded-4');
  const toolbar = shell.querySelector('.ops-calendar-toolbar');
  const filters = shell.querySelector('.ops-calendar-filters');
  toolbar?.classList.add('bootstrap-calendar-toolbar', 'card-header', 'bg-white', 'border-0');

  const modeIcons = { today: 'bi-calendar-day-fill', week: 'bi-calendar-week-fill', month: 'bi-calendar3' };
  const modeLabels = { today: 'Dag', week: 'Uge', month: 'Måned' };
  shell.querySelectorAll('[data-calendar-mode]').forEach(button => {
    const mode = button.dataset.calendarMode;
    button.classList.add('btn', 'btn-outline-primary');
    button.replaceChildren(busOpsIcon(modeIcons[mode]), document.createTextNode(modeLabels[mode]));
    button.onclick = () => {
      state.calendarMode = mode;
      renderCalendar();
    };
  });

  const previous = shell.querySelector('#calendarPrevious');
  const next = shell.querySelector('#calendarNext');
  if (previous) previous.replaceChildren(busOpsIcon('bi-chevron-left'));
  if (next) next.replaceChildren(busOpsIcon('bi-chevron-right'));
  prependBusOpsIcon(shell.querySelector('#calendarToday'), 'bi-crosshair');

  if (filters) {
    filters.classList.add('bootstrap-calendar-filters', 'collapse');
    if (state.calendarFiltersExpanded) filters.classList.add('show');
    const search = filters.querySelector('.ops-calendar-search');
    if (search) {
      [...search.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
      search.prepend(busOpsIcon('bi-search'));
    }
    prependBusOpsIcon(filters.querySelector('#calendarReset'), 'bi-arrow-counterclockwise');
    const activeFilters = Object.values(state.calendarFilters || {}).filter(Boolean).length;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'calendarFiltersToggle';
    toggle.className = 'btn btn-outline-primary bootstrap-calendar-filter-toggle';
    toggle.setAttribute('aria-expanded', String(Boolean(state.calendarFiltersExpanded)));
    toggle.append(busOpsIcon('bi-funnel-fill'), document.createTextNode('Filtre'));
    if (activeFilters) {
      const count = document.createElement('span');
      count.className = 'badge rounded-pill';
      count.textContent = String(activeFilters);
      toggle.append(count);
    }
    toggle.onclick = () => {
      state.calendarFiltersExpanded = !state.calendarFiltersExpanded;
      filters.classList.toggle('show', state.calendarFiltersExpanded);
      toggle.setAttribute('aria-expanded', String(state.calendarFiltersExpanded));
    };
    toolbar?.append(toggle);
  }

  const alertIcons = ['bi-exclamation-triangle-fill', 'bi-person-workspace', 'bi-receipt-cutoff', 'bi-cash-stack', 'bi-credit-card-2-front-fill'];
  document.querySelectorAll('.ops-alert-strip>div').forEach((card, index) => {
    card.classList.add('card', 'border-0', 'shadow-sm', 'rounded-4', 'bootstrap-calendar-alert');
    if (!card.querySelector('.bootstrap-alert-icon')) card.prepend(busOpsIcon(alertIcons[index], 'bootstrap-alert-icon'));
  });

  if (!shell.querySelector('.bootstrap-calendar-legend')) {
    const legend = document.createElement('div');
    legend.className = 'bootstrap-calendar-legend';
    [['planned', 'Planlagt'], ['checkin', 'Check-in'], ['underway', 'Undervejs'], ['completed', 'Afsluttet'], ['cancelled', 'Annulleret']].forEach(([status, label]) => {
      const item = document.createElement('span');
      item.className = `calendar-legend-${status}`;
      const dot = document.createElement('i');
      item.append(dot, document.createTextNode(label));
      legend.append(item);
    });
    filters?.insertAdjacentElement('afterend', legend);
  }

  shell.querySelectorAll('.ops-trip-card').forEach(card => {
    card.classList.add('card', 'border-0', 'shadow-sm', 'rounded-3');
    card.querySelector('.ops-trip-main>i')?.classList.add('badge', 'rounded-pill');
  });

  const weekStart = calendarMonday(calendarAnchor());
  shell.querySelectorAll('.ops-week-day').forEach((day, index) => {
    day.classList.add('card', 'border-0');
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const header = day.querySelector(':scope>header');
    if (header) {
      header.dataset.calendarDay = calendarDayKey(date);
      header.tabIndex = 0;
      header.setAttribute('role', 'button');
      header.setAttribute('aria-label', `Vis ${date.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}`);
      const openDay = () => {
        state.calendarDate = header.dataset.calendarDay;
        state.calendarMode = 'today';
        renderCalendar();
      };
      header.onclick = openDay;
      header.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDay();
        }
      };
    }
    day.querySelectorAll('.ops-trip-card.compact').forEach(card => {
      const trip = state.trips.find(item => item.id === Number(card.dataset.calendarTrip));
      if (!trip || card.querySelector('.ops-week-card-meta')) return;
      card.classList.add('bootstrap-week-trip-card');
      const capacity = Number(trip.seatCount || trip.bus?.seatCount || 0);
      const occupancy = capacity ? Math.round(Number(trip.counts.passengers || 0) / capacity * 100) : 0;
      const meta = document.createElement('span');
      meta.className = 'ops-week-card-meta';
      const bus = document.createElement('small');
      bus.append(busOpsIcon('bi-bus-front-fill'), document.createTextNode(trip.bus?.name || 'Ingen bus'));
      const driver = document.createElement('small');
      driver.append(busOpsIcon('bi-person-badge-fill'), document.createTextNode(trip.primaryDriver || 'Ingen chauffør'));
      meta.append(bus, driver);
      const load = document.createElement('span');
      load.className = 'ops-week-card-load';
      const loadCopy = document.createElement('small');
      loadCopy.textContent = `${trip.counts.passengers}/${capacity || '–'} sæder`;
      const progress = document.createElement('i');
      const fill = document.createElement('em');
      fill.style.width = `${Math.min(100, occupancy)}%`;
      progress.append(fill);
      const percent = document.createElement('b');
      percent.textContent = `${occupancy}%`;
      load.append(loadCopy, progress, percent);
      card.append(meta, load);
    });
  });
}

const renderCalendarBeforeBootstrapOperations = renderCalendar;
renderCalendar = function () {
  if (!state.bootstrapCalendarInitialized) {
    if (!state.calendarMode) state.calendarMode = window.matchMedia('(max-width: 700px)').matches ? 'today' : 'week';
    state.bootstrapCalendarInitialized = true;
  }
  renderCalendarBeforeBootstrapOperations();
  enhanceBootstrapOperationsCalendar();
};

const openCalendarDrawerBeforeBootstrapOperations = openCalendarDrawer;
openCalendarDrawer = function (id, conflicts) {
  openCalendarDrawerBeforeBootstrapOperations(id, conflicts);
  const drawer = document.querySelector('#opsTripDrawer:not([hidden])');
  if (!drawer) return;
  drawer.classList.add('bootstrap-calendar-drawer', 'shadow-lg');
  const closeButton = drawer.querySelector('#closeOpsDrawer');
  if (closeButton) closeButton.replaceChildren(busOpsIcon('bi-x-lg'));
  drawer.querySelectorAll('.ops-drawer-numbers>div').forEach(card => card.classList.add('card', 'border-0', 'rounded-3'));
  drawer.querySelectorAll('.ops-drawer-actions button').forEach(button => button.classList.add('btn', button.classList.contains('primary') ? 'btn-primary' : 'btn-outline-primary'));
  [['[data-calendar-open]', 'bi-box-arrow-up-right'], ['[data-calendar-checkin]', 'bi-check2-circle'], ['[data-calendar-passenger]', 'bi-person-plus-fill'], ['[data-calendar-economy]', 'bi-graph-up-arrow']].forEach(([selector, icon]) => prependBusOpsIcon(drawer.querySelector(selector), icon));
};

[
  ['Dag', 'Dita', 'Tag', 'Day'],
  ['Filtre', 'Filtrat', 'Filter', 'Filters'],
  ['Undervejs', 'Në rrugë', 'Unterwegs', 'Underway']
].forEach(row => addTranslation(...row));

[
  ['Tur og tider', 'Udhëtimi dhe oraret', 'Fahrt und Zeiten', 'Trip and times'],
  ['Navn, afgang og forventet ankomst', 'Emri, nisja dhe mbërritja e pritshme', 'Name, Abfahrt und erwartete Ankunft', 'Name, departure and expected arrival'],
  ['Rute og bus', 'Itinerari dhe autobusi', 'Route und Bus', 'Route and bus'],
  ['Startsted, slutsted og køretøj', 'Nisja, destinacioni dhe automjeti', 'Start, Ziel und Fahrzeug', 'Origin, destination and vehicle'],
  ['Bemanding', 'Personeli', 'Personal', 'Staffing'],
  ['Chauffører og salgschef ved start', 'Shoferët dhe menaxheri i shitjeve në nisje', 'Fahrer und Verkaufsleitung am Start', 'Drivers and sales manager at departure'],
  ['Tider vises i Europe/Copenhagen', 'Ora shfaqet në Europe/Copenhagen', 'Zeiten werden in Europe/Copenhagen angezeigt', 'Times are shown in Europe/Copenhagen']
].forEach(row => addTranslation(...row));
