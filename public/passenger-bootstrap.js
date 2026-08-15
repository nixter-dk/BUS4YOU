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
  if (passenger.externalPaymentConfirmedAt && passenger.paymentStatus === 'pay_dk') return 'Betalt i DK';
  if (passenger.externalPaymentConfirmedAt && passenger.paymentStatus === 'pay_mk') return 'Betalt i MK';
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
      <span class="bootstrap-list-payment ${passenger.paymentStatus} ${passenger.externalPaymentConfirmedAt ? 'confirmed' : ''}"><small>BETALING</small><strong>${esc(passengerPaymentLabel(passenger))}</strong></span>
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

function passengerInitials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}

function passengerActionPayment(passenger) {
  if (passenger.paymentStatus === 'cash') {
    if (passenger.paymentLocation === 'bus') return { label: 'Betalt i bussen', tone: 'paid-bus', icon: 'bi-cash-coin', note: 'Registreret hos chaufføren' };
    if (passenger.paymentLocation === 'departure') return { label: 'Betalt ved startstedet', tone: 'paid-prepaid', icon: 'bi-shop-window', note: 'Registreret hos salgschefen' };
    return { label: 'Betalt på forhånd', tone: 'paid-prepaid', icon: 'bi-check-circle-fill', note: 'Betalingen er registreret' };
  }
  if (passenger.paymentStatus === 'free') return { label: 'Gratis billet', tone: 'free', icon: 'bi-gift-fill', note: 'Ingen betaling skal opkræves' };
  if (passenger.paymentStatus === 'group_included') return { label: 'Fælles betaling', tone: 'covered', icon: 'bi-people-fill', note: 'Betalingen ligger på hovedpersonen' };
  if (passenger.paymentStatus === 'return_included') return { label: 'Retur allerede betalt', tone: 'return-paid', icon: 'bi-arrow-left-right', note: 'Dækket af den oprindelige returbillet' };
  if (passenger.paymentStatus === 'pay_dk' && passenger.externalPaymentConfirmedAt) return { label: 'Betalt i DK', tone: 'paid-external', icon: 'bi-patch-check-fill', note: `${money(passenger.externalPaymentAmount, passenger.externalPaymentCurrency || 'DKK')} · bekræftet af ${passenger.externalPaymentConfirmedByName || passenger.paymentRecordedByName || 'medarbejder'}` };
  if (passenger.paymentStatus === 'pay_mk' && passenger.externalPaymentConfirmedAt) return { label: 'Betalt i MK', tone: 'paid-external', icon: 'bi-patch-check-fill', note: `${money(passenger.externalPaymentAmount, passenger.externalPaymentCurrency || 'DKK')} · bekræftet af ${passenger.externalPaymentConfirmedByName || passenger.paymentRecordedByName || 'medarbejder'}` };
  if (passenger.paymentStatus === 'pay_dk') return { label: 'Betaler i DK', tone: 'pay-dk', icon: 'bi-geo-alt-fill', note: 'Aftalt i Danmark · afventer bekræftelse · check-in er tilladt' };
  if (passenger.paymentStatus === 'pay_mk') return { label: 'Betaler i MK', tone: 'pay-mk', icon: 'bi-geo-alt-fill', note: 'Aftalt i Makedonien · afventer bekræftelse · check-in er tilladt' };
  return { label: 'Ikke betalt', tone: 'unpaid', icon: 'bi-exclamation-circle-fill', note: 'Kan checkes ind uden betaling' };
}

function passengerTicketStatus(passenger) {
  if (passenger.journeyLeg === 'return') return { label: 'Returrejse', tone: 'return', icon: 'bi-arrow-left-right' };
  if (passenger.ticketType === 'return_open') return { label: 'Åben retur', tone: 'return-open', icon: 'bi-calendar2-plus-fill' };
  if (passenger.ticketType === 'return_fixed') return { label: 'Returbillet', tone: 'return', icon: 'bi-arrow-left-right' };
  return null;
}

function passengerActionButton(action, icon, title, note, tone = '') {
  return `<button type="button" class="passenger-action-control btn ${tone}" data-sheet-action="${action}"><span class="passenger-action-control-icon"><i class="bi ${icon}" aria-hidden="true"></i></span><span><strong>${title}</strong><small>${note}</small></span><i class="bi bi-chevron-right passenger-action-chevron" aria-hidden="true"></i></button>`;
}

function showBootstrapPassengerActionSheet(id) {
  const passenger = state.trip.passengers.find(item => item.id === id);
  if (!passenger) return;

  const attendance = passengerAttendance(passenger);
  const attendanceText = passengerAttendanceLabel(passenger);
  const payment = passengerActionPayment(passenger);
  const canCollectPayment = ['unpaid', 'pay_dk', 'pay_mk'].includes(passenger.paymentStatus) && !passenger.externalPaymentConfirmedAt;
  const canConfirmExternal = ['admin', 'sales_manager'].includes(state.user.role) && ['pay_dk', 'pay_mk'].includes(passenger.paymentStatus) && !passenger.externalPaymentConfirmedAt;
  const seatLabel = passenger.extraSeatNumber ? `${passenger.seatNumber} + ${passenger.extraSeatNumber}` : passenger.seatNumber;
  const journeyLabel = passenger.journeyLeg === 'return'
    ? 'Returrejse'
    : passenger.ticketType === 'return_open'
      ? 'Åben returbillet'
      : passenger.ticketType === 'return_fixed'
        ? 'Fast returbillet'
        : 'Enkeltbillet';
  const partyLabel = passenger.partyBookingId
    ? passenger.partyRole === 'primary' ? `Hovedperson · ${passenger.partySize || 1} personer` : 'Familiemedlem'
    : '';

  let primaryAction;
  if (passenger.checkedIn) {
    primaryAction = `<button type="button" class="btn passenger-primary-action uncheck" data-sheet-action="uncheck"><span><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i></span><span><strong>Fjern check-in</strong><small>Flyt passageren tilbage til afventer</small></span></button>`;
  } else {
    let title = attendance === 'no_show' ? 'Check ind alligevel' : 'Check ind passager';
    let note = attendance === 'no_show' ? 'Fjern udeblevet-status og registrer ombord' : 'Registrer passageren som ombord på bussen';
    if (attendance !== 'no_show' && passenger.paymentStatus === 'unpaid') {
      title = 'Check ind uden betaling';
      note = 'Betalingen forbliver åben og kan registreres senere';
    } else if (attendance !== 'no_show' && passenger.paymentStatus === 'pay_dk' && !passenger.externalPaymentConfirmedAt) {
      note = 'Betaling sker i DK · opkræv ikke automatisk i bussen';
    } else if (attendance !== 'no_show' && passenger.paymentStatus === 'pay_mk' && !passenger.externalPaymentConfirmedAt) {
      note = 'Betaling sker i MK · opkræv ikke automatisk i bussen';
    }
    primaryAction = `<button type="button" class="btn passenger-primary-action" data-sheet-action="checkin"><span><i class="bi bi-person-check-fill" aria-hidden="true"></i></span><span><strong>${title}</strong><small>${note}</small></span><i class="bi bi-arrow-right-short" aria-hidden="true"></i></button>`;
  }

  const secondaryActions = [
    canConfirmExternal ? passengerActionButton('confirm-external', 'bi-patch-check-fill', `Bekræft betaling i ${passenger.paymentStatus === 'pay_mk' ? 'MK' : 'DK'}`, 'Gem beløb, valuta, tidspunkt og medarbejder', 'external') : '',
    canCollectPayment ? passengerActionButton('payment', 'bi-cash-coin', 'Registrer betaling', 'Kontant betaling i DKK eller EUR', 'payment') : '',
    passenger.phone ? `<a class="passenger-action-control btn call" href="tel:${esc(passenger.phone)}"><span class="passenger-action-control-icon"><i class="bi bi-telephone-fill" aria-hidden="true"></i></span><span><strong>Ring til passager</strong><small>${esc(passenger.phone)}</small></span><i class="bi bi-chevron-right passenger-action-chevron" aria-hidden="true"></i></a>` : '',
    !passenger.checkedIn && attendance !== 'no_show' ? passengerActionButton('noshow', 'bi-person-x-fill', 'Markér udeblevet', 'Passageren mødte ikke op', 'warning') : '',
    passenger.ticketType === 'return_open' && passenger.returnStatus === 'open' ? passengerActionButton('book-return', 'bi-arrow-left-right', 'Book åben retur', 'Vælg returtur og sæde', 'return') : '',
    passengerActionButton('details', 'bi-card-list', 'Alle detaljer', 'Billet, betaling og hændelser'),
    passengerActionButton('edit', 'bi-pencil-square', 'Ret eller slet', 'Ret en fejl eller fjern passageren')
  ].filter(Boolean).join('');

  $('#modalBody').innerHTML = `<section class="passenger-action-sheet bootstrap-passenger-actions" data-attendance="${attendance}">
    <header class="passenger-action-hero">
      <div class="passenger-action-heading">
        <span class="passenger-action-avatar">${esc(passengerInitials(passenger.name))}</span>
        <div><small>Passagerhandlinger</small><h2>${esc(passenger.name)}</h2><p>${esc(journeyLabel)}${partyLabel ? ` · ${esc(partyLabel)}` : ''}</p></div>
        <span class="passenger-action-status ${attendance}"><i class="bi ${attendance === 'checked_in' ? 'bi-check-circle-fill' : attendance === 'no_show' ? 'bi-person-x-fill' : 'bi-clock-fill'}" aria-hidden="true"></i>${attendanceText}</span>
      </div>
      <div class="passenger-action-journey">
        <div><i class="bi bi-geo-alt-fill" aria-hidden="true"></i><span><small>Opsamling</small><strong>${esc(stopName(passenger.pickupStopId))}</strong></span></div>
        <span class="passenger-action-route-line"><i></i><b class="bi bi-bus-front-fill" aria-hidden="true"></b><i></i></span>
        <div><i class="bi bi-geo-fill" aria-hidden="true"></i><span><small>Destination</small><strong>${esc(stopName(passenger.destinationStopId))}</strong></span></div>
      </div>
    </header>
    <div class="passenger-action-summary">
      <div class="passenger-action-seat"><span><i class="bi bi-person-vcard-fill" aria-hidden="true"></i></span><div><small>Sæde</small><strong>${seatLabel}</strong>${passenger.extraSeatNumber ? '<em>inkl. ekstra sæde</em>' : ''}</div></div>
      <div class="passenger-action-payment ${payment.tone}"><span><i class="bi ${payment.icon}" aria-hidden="true"></i></span><div><small>Betaling</small><strong>${esc(payment.label)}</strong><em>${esc(payment.note)}</em></div></div>
      ${passenger.ticketNumber ? `<div class="passenger-action-ticket"><span><i class="bi bi-ticket-perforated-fill" aria-hidden="true"></i></span><div><small>Billetnummer</small><strong>${esc(passenger.ticketNumber)}</strong><em>Reference på billetten</em></div></div>` : ''}
    </div>
    <div class="passenger-action-workflow">
      <small class="passenger-action-section-label">Hovedhandling</small>
      ${primaryAction}
      <div class="passenger-action-section-head"><small class="passenger-action-section-label">Flere handlinger</small><span>Vælg kun den handling, du skal bruge</span></div>
      <div class="passenger-action-grid bootstrap-action-grid">${secondaryActions}</div>
    </div>
  </section>`;

  const dialog = $('#modal');
  dialog.classList.add('bootstrap-passenger-action-dialog');
  const run = action => { dialog.classList.remove('bootstrap-passenger-action-dialog'); dialog.close(); action(); };
  $('[data-sheet-action="checkin"]')?.addEventListener('click', () => run(() => performFastCheckIn(id)));
  $('[data-sheet-action="uncheck"]')?.addEventListener('click', () => run(() => performManualUncheck(id)));
  $('[data-sheet-action="payment"]')?.addEventListener('click', () => run(() => openPaymentDialog('passenger', id)));
  $('[data-sheet-action="confirm-external"]')?.addEventListener('click', () => run(() => openExternalPaymentDialog('passenger', id)));
  $('[data-sheet-action="noshow"]')?.addEventListener('click', () => run(() => markNoShow(id)));
  $('[data-sheet-action="details"]')?.addEventListener('click', () => run(() => showPassengerDetail(id)));
  $('[data-sheet-action="edit"]')?.addEventListener('click', () => run(() => showPassengerCorrection(id)));
  $('[data-sheet-action="book-return"]')?.addEventListener('click', () => run(() => openReturnBookingDialog(passenger)));
  translateElement($('#modalBody'));
  dialog.addEventListener('close', () => dialog.classList.remove('bootstrap-passenger-action-dialog'), { once: true });
  dialog.showModal();
}

showPassengerActionSheet = showBootstrapPassengerActionSheet;

checkinCard = function (passenger) {
  const attendance = passengerAttendance(passenger);
  const payment = passengerActionPayment(passenger);
  const ticket = passengerTicketStatus(passenger);
  const seat = passenger.extraSeatNumber
    ? `${passenger.seatNumber}<small>+ ${passenger.extraSeatNumber}</small>`
    : passenger.seatNumber;
  const search = `${passenger.name} ${passenger.phone || ''} ${passenger.ticketNumber || ''} ${passenger.seatNumber} ${passenger.extraSeatNumber || ''} ${stopName(passenger.pickupStopId)} ${stopName(passenger.destinationStopId)}`.toLowerCase();
  const party = passenger.partyBookingId
    ? `<span class="checkin-party-badge"><i class="bi bi-people-fill" aria-hidden="true"></i>${passenger.partyRole === 'primary' ? `Hovedperson · ${passenger.partySize || 1}` : 'Familiegruppe'}</span>`
    : '';
  return `<article class="checkin-card card border-0 shadow-sm rounded-4 attendance-${attendance}" data-checkin-card="${passenger.id}" data-checkin-state="${attendance}" data-payment-state="${passenger.paymentStatus}" data-search="${esc(search)}">
    <div class="checkin-seat ${attendance}"><small>SÆDE NR.</small><strong>${seat}</strong></div>
    <div class="checkin-person">
      <small class="checkin-name-label">NAVN</small>
      <button type="button" class="checkin-name-trigger" data-passenger-actions="${passenger.id}" aria-label="Åbn handlinger for ${esc(passenger.name)}"><span>${esc(passenger.name)}</span><small>Tryk for check-in og handlinger</small><i class="bi bi-chevron-right" aria-hidden="true"></i></button>
      <div class="checkin-route-summary"><div class="checkin-pickup"><small>OPSAMLINGSSTED</small><strong>${esc(stopName(passenger.pickupStopId))}</strong></div><div class="checkin-destination"><small>DESTINATION</small><strong>${esc(stopName(passenger.destinationStopId))}</strong></div></div>
      ${passenger.phone ? `<a href="tel:${esc(passenger.phone)}">${esc(passenger.phone)}</a>` : ''}${passenger.pendingSync ? '<em>Afventer synkronisering</em>' : ''}
    </div>
    <div class="checkin-card-meta">
      <span class="checkin-attendance-badge ${attendance}"><i class="bi ${attendance === 'checked_in' ? 'bi-check-circle-fill' : attendance === 'no_show' ? 'bi-person-x-fill' : 'bi-clock-fill'}" aria-hidden="true"></i>${passengerAttendanceLabel(passenger)}</span>
      ${ticket ? `<span class="checkin-ticket-badge ${ticket.tone}"><i class="bi ${ticket.icon}" aria-hidden="true"></i>${ticket.label}</span>` : ''}
      <span class="checkin-payment-badge ${payment.tone}" title="${esc(payment.note)}"><i class="bi ${payment.icon}" aria-hidden="true"></i>${esc(payment.label)}</span>
      ${party}
    </div>
  </article>`;
};

function reshapeDriverTicketWorkspace() {
  const form = $('#passengerForm');
  const panel = form?.closest('.panel');
  const host = $('#tabContent');
  if (!form || !panel || !host) return;
  panel.remove();
  host.innerHTML = `<section class="driver-ticket-workspace">
    <header class="driver-ticket-hero card border-0 shadow-sm rounded-4">
      <span><i class="bi bi-ticket-perforated-fill" aria-hidden="true"></i></span>
      <div><small>BILLETSALG I BUSSEN</small><h2>Sælg billet til en ny passager</h2><p>Passageren oprettes her. Sæde og eventuelt ekstra sæde vælges direkte i formularen.</p></div>
      <strong><i class="bi bi-shield-check" aria-hidden="true"></i> Betalingen registreres hos dig</strong>
    </header>
    <div class="driver-ticket-form-host"></div>
  </section>`;
  panel.classList.add('driver-ticket-panel', 'card', 'border-0', 'shadow-sm', 'rounded-4');
  host.querySelector('.driver-ticket-form-host').append(panel);
}

const departureChecklistItems = [
  { key: 'vehicle_ready', icon: 'bi-bus-front-fill', title: 'Bus kontrolleret og klar', note: 'Brændstof, lys, dæk og sikkerhedsudstyr', roles: ['admin', 'driver'] },
  { key: 'route_documents', icon: 'bi-map-fill', title: 'Rute og dokumenter gennemgået', note: 'Tidsplan, adresser og nødvendige kørselsdokumenter', roles: ['admin', 'driver'] },
  { key: 'passenger_list', icon: 'bi-people-fill', title: 'Passagerlisten er gennemgået', note: 'Opsamlingssteder, sæder og særlige bemærkninger', roles: ['admin', 'driver', 'sales_manager'] },
  { key: 'baggage_secured', icon: 'bi-luggage-fill', title: 'Bagage er dokumenteret og sikret', note: 'Fotos, antal kolli og placering i bussen', roles: ['admin', 'driver'] },
  { key: 'cash_budget', icon: 'bi-cash-stack', title: 'Kontanter og turbudget er afstemt', note: 'Modtagne beløb og udgiftsbudget er tydeligt placeret', roles: ['admin', 'driver', 'sales_manager'] }
];

function ensureDepartureChecklistTab() {
  const tabs = $('.tabs');
  if (!tabs || tabs.querySelector('[data-departure-tab]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `tab ${state.tab === 'departure' ? 'active' : ''}`;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', state.tab === 'departure' ? 'true' : 'false');
  button.dataset.tab = 'departure';
  button.dataset.departureTab = 'true';
  button.innerHTML = '<i class="bi bi-clipboard2-check-fill" aria-hidden="true"></i><span>Afgangskontrol</span>';
  tabs.append(button);
  button.onclick = () => { state.tab = 'departure'; renderTripWithDriverWorkspace(); };
}

function renderDepartureChecklistTab() {
  const host = $('#tabContent'), trip = state.trip.trip, checklist = trip.departureChecklist || {};
  if (!host) return;
  const completed = departureChecklistItems.filter(item => checklist[item.key]?.checked).length;
  const percent = Math.round(completed / departureChecklistItems.length * 100);
  const locked = ['completed', 'cancelled'].includes(trip.status);
  host.innerHTML = `<section class="departure-checklist-workspace">
    <header class="departure-checklist-hero card border-0 shadow-sm rounded-4 ${completed === departureChecklistItems.length ? 'ready' : ''}">
      <div class="departure-checklist-copy"><span><i class="bi ${completed === departureChecklistItems.length ? 'bi-check2-circle' : 'bi-clipboard2-check-fill'}" aria-hidden="true"></i></span><div><small>AFGANGSKONTROL · ${esc(trip.title)}</small><h2>${completed === departureChecklistItems.length ? 'Klar til afgang' : 'Gør turen klar trin for trin'}</h2><p>Hvert punkt gemmer automatisk medarbejder og tidspunkt.</p></div></div>
      <div class="departure-progress" style="--departure-progress:${percent}%"><strong>${completed}/${departureChecklistItems.length}</strong><span>gennemført</span></div>
    </header>
    <div class="departure-checklist-grid">
      ${departureChecklistItems.map((item, index) => {
        const entry = checklist[item.key], checked = Boolean(entry?.checked), allowed = item.roles.includes(state.user.role) && !locked;
        return `<article class="departure-check-card card border-0 shadow-sm rounded-4 ${checked ? 'checked' : ''}">
          <span class="departure-step">${checked ? '<i class="bi bi-check-lg" aria-hidden="true"></i>' : index + 1}</span>
          <span class="departure-item-icon"><i class="bi ${item.icon}" aria-hidden="true"></i></span>
          <div class="departure-item-copy"><strong>${esc(item.title)}</strong><small>${esc(item.note)}</small>${checked ? `<em><i class="bi bi-person-check-fill" aria-hidden="true"></i>${esc(entry.checkedByName || 'Medarbejder')} · ${date(entry.checkedAt)}</em>` : !allowed && !locked ? '<em class="role-note"><i class="bi bi-lock-fill" aria-hidden="true"></i>Godkendes af chauffør eller administrator</em>' : ''}</div>
          <button type="button" class="btn ${checked ? 'btn-outline-success' : 'btn-primary'}" data-departure-check="${item.key}" data-checked="${checked}" ${allowed ? '' : 'disabled'}>${checked ? '<i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Fortryd' : '<i class="bi bi-check2" aria-hidden="true"></i> Godkend'}</button>
        </article>`;
      }).join('')}
    </div>
    <footer class="departure-checklist-footer ${completed === departureChecklistItems.length ? 'ready' : ''}"><i class="bi ${completed === departureChecklistItems.length ? 'bi-shield-check' : 'bi-info-circle'}" aria-hidden="true"></i><span><strong>${completed === departureChecklistItems.length ? 'Alle fem kontroller er gennemført' : `${departureChecklistItems.length - completed} kontrolpunkter mangler`}</strong><small>${locked ? 'Turen er låst og kontrollen kan ikke ændres.' : 'Passagerer kan fortsat checkes ind uanset betalingssted.'}</small></span></footer>
  </section>`;
  $$('[data-departure-check]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try {
      const updated = await api(`/api/trips/${trip.id}`, { method: 'PATCH', body: JSON.stringify({ departureChecklistItem: button.dataset.departureCheck, checked: button.dataset.checked !== 'true' }) });
      state.trip.trip = updated; Object.assign(state.trips.find(item => item.id === trip.id) || {}, updated);
      toast(button.dataset.checked === 'true' ? 'Kontrolpunktet er åbnet igen' : 'Kontrolpunktet er godkendt');
      renderTripWithDriverWorkspace();
    } catch (error) { button.disabled = false; toast(error.message); }
  });
  translateElement(host);
}

const renderTripBeforeDriverWorkspace = renderTrip;
function renderTripWithDriverWorkspace() {
  if (state.user?.role === 'driver' && state.tab === 'seats') state.tab = 'passengers';
  renderTripBeforeDriverWorkspace();
  ensureDepartureChecklistTab();
  if (state.tab === 'departure') renderDepartureChecklistTab();
  if (state.user?.role !== 'driver') return;
  $('[data-tab="seats"]')?.remove();
  const passengerTab = $('[data-tab="passengers"]');
  if (passengerTab) {
    passengerTab.dataset.driverSalesTab = 'true';
    passengerTab.setAttribute('aria-label', 'Billetsalg i bussen');
    [...passengerTab.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()).forEach(node => { node.nodeValue = node.nodeValue.replace('Passagerer', 'Billetsalg'); });
  }
  if (state.tab === 'passengers') reshapeDriverTicketWorkspace();
}
renderTrip = renderTripWithDriverWorkspace;
globalThis.renderTrip = renderTripWithDriverWorkspace;
globalThis.renderBusOpsTrip = renderTripWithDriverWorkspace;
document.addEventListener('click', event => {
  if (state.user?.role !== 'driver') return;
  const tab = event.target.closest?.('.tabs .tab');
  if (!tab) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (tab.dataset.tab) state.tab = tab.dataset.tab;
  else if (tab.hasAttribute('data-checkin-tab')) state.tab = 'checkin';
  else if (tab.hasAttribute('data-expense-tab')) state.tab = 'expenses';
  else if (tab.hasAttribute('data-settlement-tab')) state.tab = 'settlements';
  renderTripWithDriverWorkspace();
}, true);

[
  ['Rejsende på turen', 'Udhëtarët në udhëtim', 'Reisende auf der Fahrt', 'Travellers on the trip'],
  ['Alle statusser', 'Të gjitha statuset', 'Alle Status', 'All statuses'],
  ['Sortér: Opsamling', 'Rendit: Hipja', 'Sortieren: Einstieg', 'Sort: Pickup'],
  ['Sortér: Sæde', 'Rendit: Ulësja', 'Sortieren: Sitz', 'Sort: Seat'],
  ['Sortér: Navn', 'Rendit: Emri', 'Sortieren: Name', 'Sort: Name'],
  ['Sortér: Status', 'Rendit: Statusi', 'Sortieren: Status', 'Sort: Status'],
  ['Ret eller slet', 'Ndrysho ose fshi', 'Bearbeiten oder löschen', 'Edit or delete'],
  ['Ret fejl og gem ændringen i historikken', 'Korrigjo gabimet dhe ruaj ndryshimin në historik', 'Fehler korrigieren und Änderung im Verlauf speichern', 'Correct errors and save the change in history'],
  ['Passagerhandlinger', 'Veprimet e pasagjerit', 'Fahrgastaktionen', 'Passenger actions'],
  ['Hovedhandling', 'Veprimi kryesor', 'Hauptaktion', 'Primary action'],
  ['Check ind passager', 'Regjistro pasagjerin', 'Fahrgast einchecken', 'Check in passenger'],
  ['Check ind alligevel', 'Regjistro megjithatë', 'Trotzdem einchecken', 'Check in anyway'],
  ['Registrer passageren som ombord på bussen', 'Regjistro pasagjerin si të hipur në autobus', 'Fahrgast als an Bord registrieren', 'Register the passenger as on board'],
  ['Fjern udeblevet-status og registrer ombord', 'Hiq statusin mungon dhe regjistro hipjen', 'Status nicht erschienen entfernen und einchecken', 'Remove no-show status and check in'],
  ['Fjern check-in', 'Hiq regjistrimin', 'Check-in entfernen', 'Remove check-in'],
  ['Flyt passageren tilbage til afventer', 'Ktheje pasagjerin te pritja', 'Fahrgast zurück auf wartend setzen', 'Move passenger back to pending'],
  ['Registrer betaling', 'Regjistro pagesën', 'Zahlung erfassen', 'Register payment'],
  ['Kontant betaling i DKK eller EUR', 'Pagesë me para në DKK ose EUR', 'Barzahlung in DKK oder EUR', 'Cash payment in DKK or EUR'],
  ['Ring til passager', 'Telefono pasagjerin', 'Fahrgast anrufen', 'Call passenger'],
  ['Markér udeblevet', 'Shëno si mungon', 'Als nicht erschienen markieren', 'Mark as no-show'],
  ['Passageren mødte ikke op', 'Pasagjeri nuk u paraqit', 'Der Fahrgast ist nicht erschienen', 'The passenger did not arrive'],
  ['Billet, betaling og hændelser', 'Bileta, pagesa dhe ngjarjet', 'Ticket, Zahlung und Ereignisse', 'Ticket, payment and events'],
  ['Ret en fejl eller fjern passageren', 'Korrigjo një gabim ose hiq pasagjerin', 'Fehler korrigieren oder Fahrgast entfernen', 'Correct an error or remove the passenger'],
  ['Flere handlinger', 'Veprime të tjera', 'Weitere Aktionen', 'More actions'],
  ['Vælg kun den handling, du skal bruge', 'Zgjidh vetëm veprimin që të duhet', 'Nur die benötigte Aktion wählen', 'Choose only the action you need'],
  ['Kan registreres her', 'Mund të regjistrohet këtu', 'Kann hier erfasst werden', 'Can be registered here'],
  ['Status er registreret', 'Statusi është regjistruar', 'Status ist erfasst', 'Status is registered'],
  ['Check ind uden betaling', 'Regjistro pa pagesë', 'Ohne Zahlung einchecken', 'Check in without payment'],
  ['Betalingen forbliver åben og kan registreres senere', 'Pagesa mbetet e hapur dhe mund të regjistrohet më vonë', 'Die Zahlung bleibt offen und kann später erfasst werden', 'Payment remains open and can be registered later'],
  ['Betaling sker i DK · opkræv ikke automatisk i bussen', 'Pagesa bëhet në DK · mos arkëto automatikisht në autobus', 'Zahlung erfolgt in DK · nicht automatisch im Bus kassieren', 'Payment is made in DK · do not automatically collect on the bus'],
  ['Betaling sker i MK · opkræv ikke automatisk i bussen', 'Pagesa bëhet në MK · mos arkëto automatikisht në autobus', 'Zahlung erfolgt in MK · nicht automatisch im Bus kassieren', 'Payment is made in MK · do not automatically collect on the bus'],
  ['Billetsalg i bussen', 'Shitja e biletave në autobus', 'Ticketverkauf im Bus', 'Ticket sales on the bus'],
  ['Sælg billet til en ny passager', 'Shit biletë për një pasagjer të ri', 'Ticket für einen neuen Fahrgast verkaufen', 'Sell a ticket to a new passenger'],
  ['Afgangskontrol', 'Kontrolli i nisjes', 'Abfahrtskontrolle', 'Departure check'],
  ['Klar til afgang', 'Gati për nisje', 'Abfahrbereit', 'Ready for departure'],
  ['Gør turen klar trin for trin', 'Përgatit udhëtimin hap pas hapi', 'Fahrt Schritt für Schritt vorbereiten', 'Prepare the trip step by step'],
  ['Bus kontrolleret og klar', 'Autobusi u kontrollua dhe është gati', 'Bus geprüft und bereit', 'Bus checked and ready'],
  ['Rute og dokumenter gennemgået', 'Rruga dhe dokumentet u kontrolluan', 'Route und Dokumente geprüft', 'Route and documents checked'],
  ['Passagerlisten er gennemgået', 'Lista e pasagjerëve u kontrollua', 'Fahrgastliste geprüft', 'Passenger list checked'],
  ['Bagage er dokumenteret og sikret', 'Bagazhi është dokumentuar dhe siguruar', 'Gepäck dokumentiert und gesichert', 'Baggage documented and secured'],
  ['Kontanter og turbudget er afstemt', 'Paratë dhe buxheti i udhëtimit u rakorduan', 'Bargeld und Fahrtbudget abgestimmt', 'Cash and trip budget reconciled'],
  ['Godkend', 'Mirato', 'Bestätigen', 'Approve'],
  ['Fortryd', 'Zhbëj', 'Rückgängig', 'Undo'],
  ['Bekræft betaling i DK', 'Konfirmo pagesën në DK', 'Zahlung in DK bestätigen', 'Confirm payment in DK'],
  ['Bekræft betaling i MK', 'Konfirmo pagesën në MK', 'Zahlung in MK bestätigen', 'Confirm payment in MK']
].forEach(row => addTranslation(...row));
