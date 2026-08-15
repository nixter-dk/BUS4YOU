// Bootstrap-based passenger workspace. Existing booking and check-in data flows
// remain unchanged; this file only replaces the visual list and its controls.
function passengerAttendance(passenger) {
  return passenger.checkedIn ? 'checked_in' : passenger.attendanceStatus || 'pending';
}

function passengerAttendanceLabel(passenger) {
  return { pending: 'Afventer', checked_in: 'Checket ind', no_show: 'Udeblevet' }[passengerAttendance(passenger)] || 'Afventer';
}

function passengerPaymentLabel(passenger) {
  if (passenger.paymentStatus === 'group_included') return 'Fælles betaling';
  if (passenger.paymentStatus === 'return_included') return 'Dækket af retur';
  return paymentStatusLabel(passenger.paymentStatus);
}

function passengerJourneyBadge(passenger) {
  if (passenger.journeyLeg === 'return') return '<span class="passenger-meta-badge return-leg">Returrejse</span>';
  if (passenger.ticketType === 'return_open') return '<span class="passenger-meta-badge open-return">Åben retur</span>';
  if (passenger.ticketType === 'return_fixed') return '<span class="passenger-meta-badge fixed-return">Returbillet</span>';
  return '';
}

function passengerPartyBadge(passenger) {
  if (!passenger.partyBookingId) return '';
  const label = passenger.partyRole === 'primary'
    ? `Hovedperson · ${passenger.partySize || 1} personer`
    : 'Familiemedlem';
  return `<span class="passenger-meta-badge party">${label}</span>`;
}

function bootstrapPassengerCard(passenger) {
  const attendance = passengerAttendance(passenger);
  const seat = passenger.extraSeatNumber
    ? `${passenger.seatNumber}<small>+ ${passenger.extraSeatNumber}</small>`
    : passenger.seatNumber;
  const search = `${passenger.name} ${passenger.phone || ''} ${passenger.ticketNumber || ''} ${passenger.seatNumber} ${passenger.extraSeatNumber || ''} ${stopName(passenger.pickupStopId)} ${stopName(passenger.destinationStopId)}`.toLowerCase();
  return `<article class="bootstrap-passenger-item card border-0 shadow-sm rounded-4" data-passenger-row data-passenger-id="${passenger.id}" data-search="${esc(search)}" data-attendance="${attendance}" data-payment="${passenger.paymentStatus}" data-pickup="${passenger.pickupStopId}">
    <button type="button" class="bootstrap-passenger-trigger" data-passenger-actions="${passenger.id}" aria-label="Åbn handlinger for ${esc(passenger.name)}">
      <span class="bootstrap-seat ${attendance}"><small>SÆDE</small><strong>${seat}</strong></span>
      <span class="bootstrap-passenger-identity">
        <span class="bootstrap-name-line"><strong>${esc(passenger.name)}</strong>${passengerPartyBadge(passenger)}${passengerJourneyBadge(passenger)}</span>
        ${passenger.ticketNumber ? `<small class="bootstrap-ticket-number">Billet ${esc(passenger.ticketNumber)}</small>` : ''}
      </span>
      <span class="bootstrap-route">
        <span><small>FRA</small><strong>${esc(stopName(passenger.pickupStopId))}</strong></span><i></i>
        <span><small>TIL</small><strong>${esc(stopName(passenger.destinationStopId))}</strong></span>
      </span>
      <span class="bootstrap-list-state"><span class="attendance ${attendance}">${passengerAttendanceLabel(passenger)}</span>${passenger.checkedInByName ? `<small>af ${esc(passenger.checkedInByName)}</small>` : ''}</span>
      <span class="bootstrap-list-payment ${passenger.paymentStatus}"><small>BETALING</small><strong>${esc(passengerPaymentLabel(passenger))}</strong></span>
      <span class="bootstrap-open-indicator"><small>Åbn</small><b></b></span>
    </button>
  </article>`;
}

function bootstrapPassengerGroups(passengers) {
  const rendered = new Set();
  return passengers.map(passenger => {
    if (!passenger.partyBookingId) return bootstrapPassengerCard(passenger);
    if (rendered.has(passenger.partyBookingId)) return '';
    rendered.add(passenger.partyBookingId);
    const members = passengers
      .filter(item => item.partyBookingId === passenger.partyBookingId)
      .sort((a, b) => (a.partyRole === 'primary' ? -1 : 1) - (b.partyRole === 'primary' ? -1 : 1) || a.name.localeCompare(b.name, appLocale()));
    const primary = members.find(item => item.partyRole === 'primary') || members[0];
    const checked = members.filter(item => item.checkedIn).length;
    return `<details class="bootstrap-family-group card border-0 shadow-sm rounded-4" data-passenger-party="${passenger.partyBookingId}" open>
      <summary><span class="bootstrap-family-icon"></span><span><small>FAMILIE- ELLER GRUPPEBOOKING</small><strong>${esc(primary.name)} og ${Math.max(0, members.length - 1)} andre</strong><em>${esc(stopName(primary.pickupStopId))} → ${esc(stopName(primary.destinationStopId))}</em></span><span class="bootstrap-family-progress"><b>${checked}/${members.length}</b><small>checket ind</small></span><i></i></summary>
      <div class="bootstrap-family-members">${members.map(bootstrapPassengerCard).join('')}</div>
    </details>`;
  }).join('');
}

function sortBootstrapPassengers(passengers) {
  const sorted = [...passengers];
  const mode = state.passengerListSort || 'pickup';
  if (mode === 'seat') sorted.sort((a, b) => Number(a.seatNumber) - Number(b.seatNumber));
  else if (mode === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, appLocale()));
  else if (mode === 'status') sorted.sort((a, b) => passengerAttendance(a).localeCompare(passengerAttendance(b)) || a.name.localeCompare(b.name, appLocale()));
  else sorted.sort((a, b) => stopName(a.pickupStopId).localeCompare(stopName(b.pickupStopId), appLocale()) || Number(a.seatNumber) - Number(b.seatNumber));
  return sorted;
}

function updateBootstrapPassengerFilters() {
  const search = String($('#passengerSearch')?.value || '').toLowerCase();
  const attendance = $('#attendanceFilter')?.value || '';
  const payment = $('#paymentFilter')?.value || '';
  const pickup = $('.bootstrap-pickup-chip.active')?.dataset.pickupFilter || '';
  let visible = 0;
  $$('[data-passenger-row]').forEach(row => {
    const show = (!search || row.dataset.search.includes(search))
      && (!attendance || row.dataset.attendance === attendance)
      && (!payment || row.dataset.payment === payment)
      && (!pickup || row.dataset.pickup === pickup);
    row.hidden = !show;
    if (show) visible += 1;
  });
  $$('[data-passenger-party]').forEach(group => {
    group.hidden = !group.querySelector('[data-passenger-row]:not([hidden])');
  });
  const count = $('#passengerResultCount');
  if (count) count.textContent = `${visible} af ${state.trip.passengers.length} passagerer`;
}

function wireBootstrapPassengerWorkspace() {
  const apply = () => updateBootstrapPassengerFilters();
  $('#passengerSearch')?.addEventListener('input', apply);
  $('#attendanceFilter')?.addEventListener('change', apply);
  $('#paymentFilter')?.addEventListener('change', apply);
  $('#passengerSort')?.addEventListener('change', event => {
    state.passengerListSort = event.target.value;
    renderEnhancedPassengerTab();
  });
  $('#clearPassengerFilters')?.addEventListener('click', () => {
    $('#passengerSearch').value = '';
    $('#attendanceFilter').value = '';
    $('#paymentFilter').value = '';
    $$('.bootstrap-pickup-chip').forEach(button => button.classList.remove('active'));
    apply();
  });
  $$('.bootstrap-pickup-chip').forEach(button => button.addEventListener('click', () => {
    const active = button.classList.contains('active');
    $$('.bootstrap-pickup-chip').forEach(item => item.classList.remove('active'));
    button.classList.toggle('active', !active);
    apply();
  }));
  $$('[data-passenger-actions]').forEach(button => button.addEventListener('click', () => showPassengerActionSheet(Number(button.dataset.passengerActions))));
  $('#exportPassengers')?.addEventListener('click', exportPassengerList);
  $('#printPassengers')?.addEventListener('click', () => window.print());
  updateBootstrapPassengerFilters();
}

renderEnhancedPassengerTab = function () {
  const el = $('#tabContent');
  const passengers = sortBootstrapPassengers(state.trip.passengers);
  const stops = [...new Set(passengers.map(item => item.pickupStopId))];
  const checked = passengers.filter(item => item.checkedIn).length;
  const pending = passengers.filter(item => passengerAttendance(item) === 'pending').length;
  const noShow = passengers.filter(item => passengerAttendance(item) === 'no_show').length;
  const canAdd = ['admin', 'sales_manager'].includes(state.user.role);
  el.innerHTML = `${tripCashCards()}<section class="bootstrap-passenger-workspace">
    <div class="bootstrap-passenger-kpis">
      <div class="card border-0 shadow-sm rounded-4"><span class="bootstrap-kpi-icon total">♟</span><span><small>PASSAGERER</small><strong>${passengers.length}</strong></span></div>
      <div class="card border-0 shadow-sm rounded-4"><span class="bootstrap-kpi-icon pending">◷</span><span><small>AFVENTER</small><strong>${pending}</strong></span></div>
      <div class="card border-0 shadow-sm rounded-4"><span class="bootstrap-kpi-icon checked"></span><span><small>CHECKET IND</small><strong>${checked}</strong></span></div>
      <div class="card border-0 shadow-sm rounded-4"><span class="bootstrap-kpi-icon noshow">!</span><span><small>UDEBLEVET</small><strong>${noShow}</strong></span></div>
    </div>
    <div class="bootstrap-pickup-strip" aria-label="Filtrer efter opsamlingssted"><button type="button" class="bootstrap-pickup-chip" id="allPickupChip"><strong>Alle passagerer</strong><span>${passengers.length}</span></button>${stops.map(stopId => { const group = passengers.filter(item => item.pickupStopId === stopId); return `<button type="button" class="bootstrap-pickup-chip" data-pickup-filter="${stopId}"><strong>${esc(stopName(stopId))}</strong><span>${group.filter(item => item.checkedIn).length}/${group.length}</span></button>`; }).join('')}</div>
    <div class="bootstrap-passenger-toolbar card border-0 shadow-sm rounded-4">
      <label class="bootstrap-search input-group"><span class="input-group-text">⌕</span><input class="form-control" id="passengerSearch" placeholder="Søg navn, billet, telefon eller sæde" aria-label="Søg i passagerlisten"></label>
      <select class="form-select" id="attendanceFilter" aria-label="Filtrer check-in-status"><option value="">Alle statusser</option><option value="pending">Afventer</option><option value="checked_in">Checket ind</option><option value="no_show">Udeblevet</option></select>
      <select class="form-select" id="paymentFilter" aria-label="Filtrer betaling"><option value="">Alle betalinger</option><option value="cash">Betalt</option><option value="unpaid">Ikke betalt</option><option value="pay_dk">Betaler i DK</option><option value="pay_mk">Betaler i MK</option><option value="free">Gratis billet</option></select>
      <select class="form-select" id="passengerSort" aria-label="Sortér passagerlisten"><option value="pickup" ${state.passengerListSort === 'pickup' || !state.passengerListSort ? 'selected' : ''}>Sortér: Opsamling</option><option value="seat" ${state.passengerListSort === 'seat' ? 'selected' : ''}>Sortér: Sæde</option><option value="name" ${state.passengerListSort === 'name' ? 'selected' : ''}>Sortér: Navn</option><option value="status" ${state.passengerListSort === 'status' ? 'selected' : ''}>Sortér: Status</option></select>
      <div class="bootstrap-toolbar-actions"><button type="button" class="btn btn-light" id="clearPassengerFilters">Nulstil</button><button type="button" class="btn btn-outline-primary" id="exportPassengers">CSV</button><button type="button" class="btn btn-outline-primary" id="printPassengers">Udskriv</button></div>
    </div>
    <div class="passenger-layout"><section class="bootstrap-passenger-list-panel panel">
      <div class="panel-head"><div><small class="bootstrap-section-kicker">PASSAGERLISTE</small><h2>Rejsende på turen</h2></div><small id="passengerResultCount">${passengers.length} af ${passengers.length} passagerer</small></div>
      <div class="bootstrap-passenger-columns" aria-hidden="true"><span>Sæde og passager</span><span>Rute</span><span>Status</span><span>Betaling</span><span></span></div>
      <div class="bootstrap-passenger-list">${passengers.length ? bootstrapPassengerGroups(passengers) : '<div class="empty">Ingen passagerer endnu</div>'}</div>
    </section>${canAdd ? passengerForm() : ''}</div>
  </section>`;
  wireBootstrapPassengerWorkspace();
  if (canAdd) wirePassengerForm();
};

const showPassengerActionSheetBeforeBootstrap = showPassengerActionSheet;
showPassengerActionSheet = function (id) {
  showPassengerActionSheetBeforeBootstrap(id);
  const grid = $('.passenger-action-grid');
  if (!grid) return;
  grid.classList.add('bootstrap-action-grid');
  if (!grid.querySelector('[data-sheet-action="edit"]')) {
    grid.insertAdjacentHTML('beforeend', '<button type="button" class="btn btn-light" data-sheet-action="edit"><i>✎</i><strong>Ret eller slet</strong><small>Ret fejl og gem ændringen i historikken</small></button>');
    grid.querySelector('[data-sheet-action="edit"]').onclick = () => {
      $('#modal').close();
      showPassengerCorrection(id);
    };
  }
  grid.querySelectorAll('button,a').forEach(control => control.classList.add('btn'));
};

const checkinCardBeforeBootstrap = checkinCard;
checkinCard = function (passenger) {
  return checkinCardBeforeBootstrap(passenger).replace('class="checkin-card ', 'class="checkin-card card border-0 shadow-sm rounded-4 ');
};

[
  ['Rejsende på turen', 'Udhëtarët në udhëtim', 'Reisende auf der Fahrt', 'Travellers on the trip'],
  ['Alle statusser', 'Të gjitha statuset', 'Alle Status', 'All statuses'],
  ['Sortér: Opsamling', 'Rendit: Hipja', 'Sortieren: Einstieg', 'Sort: Pickup'],
  ['Sortér: Sæde', 'Rendit: Ulësja', 'Sortieren: Sitz', 'Sort: Seat'],
  ['Sortér: Navn', 'Rendit: Emri', 'Sortieren: Name', 'Sort: Name'],
  ['Sortér: Status', 'Rendit: Statusi', 'Sortieren: Status', 'Sort: Status'],
  ['Ret eller slet', 'Ndrysho ose fshi', 'Bearbeiten oder löschen', 'Edit or delete'],
  ['Ret fejl og gem ændringen i historikken', 'Korrigjo gabimet dhe ruaj ndryshimin në historik', 'Fehler korrigieren und Änderung im Verlauf speichern', 'Correct errors and save the change in history']
].forEach(row => addTranslation(...row));
