/* BusOps professional UI — Phase 1
   Presentation-only enhancement for the app shell and dashboard. */
(function installBusOpsPhaseOne() {
  'use strict';

  document.body.classList.add('busops-phase1');

  const pageContexts = {
    dashboard: 'Professionel drift, samlet ét sted',
    calendar: 'Planlæg og koordinér alle afgange',
    stops: 'Stoppesteder, ruter og tider i ét overblik',
    reports: 'Salg, udgifter og kontantansvar',
    buses: 'Busser, kapacitet og sædeplaner',
    drivers: 'Chauffører og adgang til ture',
    salesManagers: 'Salgschefer og salgsbutikker',
    account: 'Din profil, adgang og sprog'
  };

  [
    ['Professionel drift, samlet ét sted', 'Operim profesional, të gjitha në një vend', 'Professioneller Betrieb an einem Ort', 'Professional operations in one place'],
    ['Planlæg og koordinér alle afgange', 'Planifikoni dhe koordinoni të gjitha nisjet', 'Alle Abfahrten planen und koordinieren', 'Plan and coordinate every departure'],
    ['Stoppesteder, ruter og tider i ét overblik', 'Ndalesat, itineraret dhe oraret në një pasqyrë', 'Haltestellen, Routen und Zeiten im Überblick', 'Stops, routes and times at a glance'],
    ['Salg, udgifter og kontantansvar', 'Shitjet, shpenzimet dhe përgjegjësia për para', 'Verkauf, Ausgaben und Bargeldverantwortung', 'Sales, expenses and cash responsibility'],
    ['Busser, kapacitet og sædeplaner', 'Autobusët, kapaciteti dhe planet e ulëseve', 'Busse, Kapazität und Sitzpläne', 'Buses, capacity and seat maps'],
    ['Chauffører og adgang til ture', 'Shoferët dhe qasja në udhëtime', 'Fahrer und Zugriff auf Fahrten', 'Drivers and trip access'],
    ['Salgschefer og salgsbutikker', 'Menaxherët dhe zyrat e shitjes', 'Verkaufsleiter und Verkaufsstellen', 'Sales managers and sales offices'],
    ['Din profil, adgang og sprog', 'Profili, qasja dhe gjuha juaj', 'Ihr Profil, Zugang und Sprache', 'Your profile, access and language'],
    ['BusOps driftsplatform', 'Platforma operative BusOps', 'BusOps-Betriebsplattform', 'BusOps operations platform'],
    ['På tværs af alle ture', 'Në të gjitha udhëtimet', 'Über alle Fahrten hinweg', 'Across all trips'],
    ['Registreret på alle ture', 'Regjistruar në të gjitha udhëtimet', 'Auf allen Fahrten erfasst', 'Recorded across all trips'],
    ['Nye planlagte afgange vises automatisk her.', 'Nisjet e reja të planifikuara shfaqen automatikisht këtu.', 'Neue geplante Abfahrten erscheinen automatisch hier.', 'New scheduled departures appear here automatically.'],
    ['Ikke tildelt', 'Nuk është caktuar', 'Nicht zugewiesen', 'Not assigned'],
    ['Ikke angivet', 'Nuk është dhënë', 'Nicht angegeben', 'Not specified']
  ].forEach(row => addTranslation(...row));

  if (typeof dynamicTranslationPatterns !== 'undefined') {
    dynamicTranslationPatterns.push(
      [/^(\d+) planlagte afgange$/,{sq:n=>`${n} nisje të planifikuara`,de:n=>`${n} geplante Abfahrten`,en:n=>`${n} scheduled departures`}],
      [/^(\d+) planlagt afgang$/,{sq:n=>`${n} nisje e planifikuar`,de:n=>`${n} geplante Abfahrt`,en:n=>`${n} scheduled departure`}],
      [/^(\d+)% af bookede passagerer$/,{sq:n=>`${n}% e pasagjerëve të rezervuar`,de:n=>`${n}% der gebuchten Fahrgäste`,en:n=>`${n}% of booked passengers`}]
    );
  }

  const originalSetTitle = setTitle;
  setTitle = function phaseOneSetTitle(title, eyebrow = 'BUSOPS') {
    originalSetTitle(title, eyebrow);
    const activeView = document.querySelector('.nav.active')?.dataset.view || 'dashboard';
    const context = document.querySelector('#pageContext');
    if (context) context.textContent = pageContexts[activeView] || 'BusOps driftsplatform';
  };

  function decorateShell() {
    document.querySelectorAll('.sidebar .nav').forEach(button => {
      button.querySelectorAll('.phase1-nav-icon').forEach(icon => icon.remove());
    });

    const logout = document.querySelector('#logout');
    if (logout && !logout.querySelector('i')) {
      logout.innerHTML = '<i class="bi bi-box-arrow-right" aria-hidden="true"></i>';
    }

    const newTrip = document.querySelector('#newTrip');
    if (newTrip && !newTrip.querySelector('i')) {
      newTrip.innerHTML = '<i class="bi bi-plus-lg" aria-hidden="true"></i><span>Ny tur</span>';
    }
  }

  function safeCount(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function phaseOneMetrics() {
    const trips = Array.isArray(state.trips) ? state.trips : [];
    const upcoming = trips
      .filter(trip => new Date(trip.departureAt) > new Date())
      .sort((a, b) => new Date(a.departureAt) - new Date(b.departureAt));

    return {
      upcoming,
      passengers: trips.reduce((total, trip) => total + safeCount(trip.counts?.passengers), 0),
      checkedIn: trips.reduce((total, trip) => total + safeCount(trip.counts?.checkedIn), 0),
      baggage: trips.reduce((total, trip) => total + safeCount(trip.counts?.baggage), 0)
    };
  }

  function kpiCard(icon, label, value, helper, tone) {
    return `<article class="phase1-kpi-card phase1-kpi-${tone}">
      <div class="phase1-kpi-top"><span class="phase1-kpi-icon"><i class="bi ${icon}" aria-hidden="true"></i></span><span class="phase1-kpi-signal" aria-hidden="true"></span></div>
      <strong>${value}</strong>
      <h3>${label}</h3>
      <p>${helper}</p>
    </article>`;
  }

  function tripStatus(trip) {
    return typeof calendarStatus === 'function' ? calendarStatus(trip) : (trip.status || 'planned');
  }

  function tripStatusLabel(status) {
    return typeof calendarStatusLabel === 'function' ? calendarStatusLabel(status) : 'Planlagt';
  }

  function departureRow(trip) {
    const status = tripStatus(trip);
    const passengers = safeCount(trip.counts?.passengers);
    const checkedIn = safeCount(trip.counts?.checkedIn);
    const title = esc(trip.title || `${trip.origin?.name || 'Afgang'} → ${trip.destination?.name || 'Destination'}`);
    const origin = esc(trip.origin?.name || 'Ikke angivet');
    const destination = esc(trip.destination?.name || 'Ikke angivet');
    const driver = esc(trip.primaryDriver || 'Ikke tildelt');
    const day = copenhagenFormat(trip.departureAt, { day: '2-digit' });
    const month = copenhagenFormat(trip.departureAt, { month: 'short' });
    const fullDate = copenhagenFormat(trip.departureAt, { weekday: 'short', day: 'numeric', month: 'short' });

    return `<button type="button" class="phase1-departure-row" data-phase1-trip="${trip.id}" aria-label="Åbn tur ${title}">
      <span class="phase1-departure-date"><small>${esc(month)}</small><strong>${esc(day)}</strong></span>
      <span class="phase1-departure-main"><small>${esc(fullDate)} · ${esc(copenhagenTime(trip.departureAt))}</small><strong>${title}</strong><span><i class="bi bi-geo-alt" aria-hidden="true"></i>${origin}<i class="bi bi-arrow-right" aria-hidden="true"></i>${destination}</span></span>
      <span class="phase1-departure-driver"><small>Primær chauffør</small><strong><i class="bi bi-person-circle" aria-hidden="true"></i>${driver}</strong></span>
      <span class="phase1-departure-count"><small>Passagerer</small><strong>${passengers}</strong></span>
      <span class="phase1-departure-checkin"><small>Check-in</small><strong>${checkedIn}/${passengers}</strong><i><em style="width:${passengers ? Math.min(100, Math.round(checkedIn / passengers * 100)) : 0}%"></em></i></span>
      <span class="phase1-status phase1-status-${esc(status)}">${esc(tripStatusLabel(status))}</span>
      <i class="bi bi-chevron-right phase1-departure-arrow" aria-hidden="true"></i>
    </button>`;
  }

  function dashboardOverview() {
    const metrics = phaseOneMetrics();
    const checkedPercent = metrics.passengers ? Math.round(metrics.checkedIn / metrics.passengers * 100) : 0;
    const upcomingText = metrics.upcoming.length === 1 ? '1 planlagt afgang' : `${metrics.upcoming.length} planlagte afgange`;
    const rows = metrics.upcoming.length
      ? metrics.upcoming.map(departureRow).join('')
      : `<div class="phase1-departure-empty"><span><i class="bi bi-calendar2-check" aria-hidden="true"></i></span><strong>Ingen kommende ture</strong><p>Nye planlagte afgange vises automatisk her.</p></div>`;

    return `<section class="phase1-dashboard-overview" aria-label="Driftsoverblik">
      <div class="phase1-kpi-grid">
        ${kpiCard('bi-calendar2-week-fill', 'Kommende ture', metrics.upcoming.length, upcomingText, 'blue')}
        ${kpiCard('bi-people-fill', 'Bookede passagerer', metrics.passengers, 'På tværs af alle ture', 'violet')}
        ${kpiCard('bi-person-check-fill', 'Checket ind', metrics.checkedIn, `${checkedPercent}% af bookede passagerer`, 'green')}
        ${kpiCard('bi-luggage-fill', 'Sendt bagage', metrics.baggage, 'Registreret på alle ture', 'amber')}
      </div>
      <section class="phase1-departures-panel">
        <header><div><small>NÆSTE AFGANGE</small><h2>Næste afgange</h2></div><span>${upcomingText}</span></header>
        <div class="phase1-departure-list">${rows}</div>
      </section>
    </section>`;
  }

  function renderPhaseOneDashboard() {
    if (!document.querySelector('.nav[data-view="dashboard"]')?.classList.contains('active')) return;
    const view = document.querySelector('#view');
    if (!view) return;

    view.querySelector('.phase1-dashboard-overview')?.remove();
    const welcome = view.querySelector('.dashboard-welcome');
    const overview = document.createElement('div');
    overview.innerHTML = dashboardOverview();
    const section = overview.firstElementChild;
    if (welcome) welcome.insertAdjacentElement('afterend', section);
    else view.prepend(section);

    section.querySelectorAll('[data-phase1-trip]').forEach(button => {
      button.addEventListener('click', () => openTrip(Number(button.dataset.phase1Trip)));
    });
  }

  decorateShell();

  const originalRenderDashboard = renderDashboard;
  renderDashboard = async function phaseOneRenderDashboard() {
    await originalRenderDashboard();
    decorateShell();
    renderPhaseOneDashboard();
  };

  queueMicrotask(() => {
    decorateShell();
    if (!document.querySelector('#app')?.hidden) renderPhaseOneDashboard();
  });
})();
