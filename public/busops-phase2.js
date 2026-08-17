/* BusOps professional UI — Phase 2
   Presentation-only enhancement for trip details and the existing core tabs. */
(function installBusOpsPhaseTwo() {
  'use strict';

  document.body.classList.add('busops-phase2');

  [
    ['Turens drift, passagerer og bagage', 'Operimi, pasagjerët dhe bagazhi i udhëtimit', 'Fahrtbetrieb, Fahrgäste und Gepäck', 'Trip operations, passengers and baggage'],
    ['Turstatus', 'Statusi i udhëtimit', 'Fahrtstatus', 'Trip status'],
    ['Afgang og rute', 'Nisja dhe itinerari', 'Abfahrt und Route', 'Departure and route'],
    ['Oversigt og handlinger for den valgte tur', 'Pasqyra dhe veprimet për udhëtimin e zgjedhur', 'Übersicht und Aktionen für die gewählte Fahrt', 'Overview and actions for the selected trip']
  ].forEach(row => addTranslation(...row));

  const statIcons = {
    'Passagerer': 'bi-people-fill',
    'Checket ind': 'bi-person-check-fill',
    'Ledige sæder': 'bi-grid-3x3-gap-fill',
    'Bagage': 'bi-luggage-fill'
  };

  const tabIcons = {
    passengers: 'bi-people-fill',
    seats: 'bi-grid-3x3-gap-fill',
    baggage: 'bi-luggage-fill',
    checkin: 'bi-person-check-fill',
    expenses: 'bi-receipt-cutoff',
    settlements: 'bi-cash-coin',
    departure: 'bi-clipboard2-check-fill',
    notifications: 'bi-chat-square-text-fill'
  };

  function tabKey(button) {
    if (button.dataset.tab) return button.dataset.tab;
    if ('checkinTab' in button.dataset) return 'checkin';
    if ('expenseTab' in button.dataset) return 'expenses';
    if ('settlementTab' in button.dataset) return 'settlements';
    if ('departureTab' in button.dataset) return 'departure';
    if ('notificationTab' in button.dataset) return 'notifications';
    return '';
  }

  function addHeadingIcon(heading, icon) {
    if (!heading || heading.querySelector('.phase2-heading-icon')) return;
    const marker = document.createElement('span');
    marker.className = 'phase2-heading-icon';
    marker.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
    heading.prepend(marker);
  }

  function decorateTripHeader() {
    const hero = document.querySelector('.detail-hero');
    const trip = state.trip?.trip;
    if (!hero || !trip) return;

    document.body.classList.add('phase2-trip-open');
    document.querySelector('#view')?.classList.add('phase2-trip-view');
    const context = document.querySelector('#pageContext');
    if (context) context.textContent = 'Turens drift, passagerer og bagage';

    hero.classList.add('phase2-trip-hero');
    const route = hero.firstElementChild;
    route?.classList.add('phase2-trip-route');
    route?.classList.add('phase2-route-content');

    const pill = hero.querySelector('.pill');
    if (pill) {
      const status = typeof calendarStatus === 'function' ? calendarStatus(trip) : (trip.status || 'planned');
      pill.classList.add('phase2-trip-status', `phase2-status-${status}`);
      pill.setAttribute('aria-label', `Turstatus: ${pill.textContent.trim()}`);
    }

    document.querySelector('#back')?.classList.add('phase2-back');
  }

  function decorateTripStats() {
    const stats = document.querySelector('.detail-hero ~ .stats');
    if (!stats) return;
    stats.classList.add('phase2-trip-stats');
    stats.querySelectorAll('.stat').forEach(card => {
      const label = card.querySelector('small')?.textContent.trim();
      card.classList.add('phase2-trip-stat');
      card.dataset.phase2Icon = statIcons[label] || 'bi-bar-chart-fill';
    });
  }

  function decorateTabs() {
    const tabs = document.querySelector('.tabs');
    if (!tabs) return;
    tabs.classList.add('phase2-tabs');
    tabs.setAttribute('aria-label', 'Turens sektioner');
    tabs.querySelectorAll('.tab').forEach(button => {
      const key = tabKey(button);
      button.classList.add('phase2-tab');
      button.dataset.phase2Icon = tabIcons[key] || 'bi-circle-fill';
    });
  }

  function addTableLabels(table) {
    if (!table || table.dataset.phase2Labels === 'true') return;
    const labels = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.cells].forEach((cell, index) => {
        cell.dataset.label = labels[index] || '';
      });
    });
    table.dataset.phase2Labels = 'true';
  }

  function decoratePanel(panel, icon) {
    if (!panel) return;
    panel.classList.add('phase2-panel');
    const head = panel.querySelector(':scope > .panel-head');
    if (head) {
      head.classList.add('phase2-panel-head');
      const title = head.querySelector('h2');
      if (title) addHeadingIcon(title, icon);
    }
  }

  function decoratePassengerTab() {
    const content = document.querySelector('#tabContent');
    if (!content || state.tab !== 'passengers') return;
    content.classList.add('phase2-tab-content', 'phase2-passengers');
    const layout = content.querySelector('.passenger-layout');
    layout?.classList.add('phase2-passenger-layout');
    const table = content.querySelector('.enhanced-passengers');
    if (table) {
      table.classList.add('phase2-data-table', 'phase2-passenger-table');
      addTableLabels(table);
      decoratePanel(table.closest('.panel'), 'bi-people-fill');
    } else {
      decoratePanel(content.querySelector('.passenger-layout > .panel'), 'bi-people-fill');
    }
    const form = content.querySelector('#passengerForm');
    decoratePanel(form?.closest('.panel'), 'bi-person-plus-fill');
    content.querySelector('.passenger-toolbar')?.classList.add('phase2-toolbar');
    content.querySelector('.pickup-groups')?.classList.add('phase2-pickup-groups');
    content.querySelector('.cash-custody')?.classList.add('phase2-cash-custody');
  }

  function decorateSeatTab() {
    const content = document.querySelector('#tabContent');
    if (!content || state.tab !== 'seats') return;
    content.classList.add('phase2-tab-content', 'phase2-seats');
    const panel = content.querySelector('.panel');
    decoratePanel(panel, 'bi-grid-3x3-gap-fill');
    panel?.classList.add('phase2-seat-panel');
    content.querySelectorAll('.seat').forEach(seat => {
      seat.classList.add('phase2-seat');
      if (seat.classList.contains('taken')) seat.dataset.seatState = 'occupied';
      else if (seat.classList.contains('selected')) seat.dataset.seatState = 'selected';
      else if (seat.classList.contains('front') || seat.classList.contains('table')) seat.dataset.seatState = 'premium';
      else seat.dataset.seatState = 'available';
    });
  }

  function decorateBaggageTab() {
    const content = document.querySelector('#tabContent');
    if (!content || state.tab !== 'baggage') return;
    content.classList.add('phase2-tab-content', 'phase2-baggage');
    const layout = content.querySelector('.grid2');
    layout?.classList.add('phase2-baggage-layout');
    const table = content.querySelector('table.list');
    if (table) {
      table.classList.add('phase2-data-table', 'phase2-baggage-table');
      addTableLabels(table);
      decoratePanel(table.closest('.panel'), 'bi-luggage-fill');
    } else {
      decoratePanel(layout?.querySelector('.panel'), 'bi-luggage-fill');
    }
    const form = content.querySelector('#baggageForm');
    decoratePanel(form?.closest('.panel'), 'bi-camera-fill');
    content.querySelectorAll('.bag-status').forEach(select => {
      select.classList.add('phase2-status-select', `phase2-bag-${select.value}`);
      select.addEventListener('change', () => {
        [...select.classList].filter(name => name.startsWith('phase2-bag-')).forEach(name => select.classList.remove(name));
        select.classList.add(`phase2-bag-${select.value}`);
      });
    });
  }

  function decorateOtherTab() {
    const content = document.querySelector('#tabContent');
    if (!content || ['passengers', 'seats', 'baggage'].includes(state.tab)) return;
    content.classList.add('phase2-tab-content');
    content.querySelectorAll('.panel').forEach(panel => decoratePanel(panel, 'bi-layout-text-window-reverse'));
    content.querySelectorAll('table.list').forEach(table => {
      table.classList.add('phase2-data-table');
      addTableLabels(table);
    });
  }

  function decorateTabContent() {
    if (!state.trip?.trip) return;
    decorateOtherTab();
    decoratePassengerTab();
    decorateSeatTab();
    decorateBaggageTab();
  }

  function decorateTripAssignments() {
    [
      ['.trip-bus-assignment', 'bi-bus-front-fill'],
      ['.trip-driver-assignment', 'bi-person-badge-fill'],
      ['.trip-sales-assignment', 'bi-shop'],
      ['.trip-lifecycle-actions', 'bi-shield-check'],
      ['.trip-timetable', 'bi-signpost-split-fill'],
      ['.operational-lifecycle', 'bi-activity']
    ].forEach(([selector]) => {
      document.querySelectorAll(selector).forEach(panel => {
        panel.classList.add('phase2-operational-card');
      });
    });
  }

  function decorateTrip() {
    if (!state.trip?.trip || !document.querySelector('.detail-hero')) return;
    decorateTripHeader();
    decorateTripStats();
    decorateTabs();
    decorateTabContent();
    decorateTripAssignments();
  }

  const activateBeforePhaseTwo = activate;
  activate = function phaseTwoActivate(name) {
    activateBeforePhaseTwo(name);
    if (name) {
      document.body.classList.remove('phase2-trip-open');
      document.querySelector('#view')?.classList.remove('phase2-trip-view');
    }
  };

  const renderTabBeforePhaseTwo = renderTab;
  renderTab = function phaseTwoRenderTab() {
    const result = renderTabBeforePhaseTwo();
    decorateTabContent();
    return result;
  };

  const renderTripBeforePhaseTwo = renderTrip;
  renderTrip = function phaseTwoRenderTrip() {
    const result = renderTripBeforePhaseTwo();
    decorateTrip();
    return result;
  };
})();
