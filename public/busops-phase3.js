/* BusOps professional UI - Phase 3
   Presentation-only enhancement for the existing four-step booking flow. */
(function installBusOpsPhaseThree() {
  'use strict';

  document.body.classList.add('busops-phase3');

  [
    ['Professionel billetbestilling', 'Rezervim profesional i biletës', 'Professionelle Ticketbuchung', 'Professional ticket booking'],
    ['Tur og afgang', 'Udhëtimi dhe nisja', 'Fahrt und Abfahrt', 'Trip and departure'],
    ['Bookingoversigt', 'Pasqyra e rezervimit', 'Buchungsübersicht', 'Booking summary']
  ].forEach(row => addTranslation(...row));

  const stepIcons = {
    1: 'bi-person-fill',
    2: 'bi-signpost-split-fill',
    3: 'bi-grid-3x3-gap-fill',
    4: 'bi-credit-card-2-front-fill'
  };

  const ticketIcons = {
    one_way: 'bi-arrow-right',
    return_fixed: 'bi-arrow-left-right',
    return_open: 'bi-calendar2-plus-fill'
  };

  function replaceIcon(host, icon) {
    if (!host || host.querySelector('.bi')) return;
    host.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i>`;
  }

  function bookingContext(panel) {
    const trip = state.trip?.trip;
    const head = panel.querySelector('.booking-panel-head');
    if (!trip || !head || head.querySelector('.phase3-booking-context')) return;
    const origin = trip.origin?.name || stopName(trip.originId);
    const destination = trip.destination?.name || stopName(trip.destinationId);
    head.insertAdjacentHTML('beforeend', `<div class="phase3-booking-context">
      <span><small>Tur og afgang</small><strong>${esc(origin)} <i class="bi bi-arrow-right" aria-hidden="true"></i> ${esc(destination)}</strong></span>
      <span><small>Dato</small><strong>${date(trip.departureAt)}</strong></span>
    </div>`);
  }

  function decorateProgress(form) {
    const progress = form.querySelector('.booking-progress');
    if (!progress) return;
    progress.classList.add('phase3-booking-progress');
    progress.querySelectorAll('[data-booking-step-button]').forEach(button => {
      const number = Number(button.dataset.bookingStepButton);
      button.classList.add('phase3-progress-step');
      const marker = button.querySelector(':scope > i');
      if (marker && !marker.querySelector('.bi')) marker.innerHTML = `<i class="bi ${stepIcons[number]}" aria-hidden="true"></i><b>${number}</b>`;
    });
  }

  function decorateSteps(form) {
    form.querySelectorAll('[data-booking-step]').forEach(section => {
      const number = Number(section.dataset.bookingStep);
      section.classList.add('phase3-booking-step');
      const header = section.querySelector(':scope > header');
      if (header && !header.querySelector('.phase3-step-icon')) header.insertAdjacentHTML('afterbegin', `<span class="phase3-step-icon"><i class="bi ${stepIcons[number]}" aria-hidden="true"></i></span>`);
    });

    form.querySelectorAll('.ticket-type-cards label').forEach(label => {
      const input = label.querySelector('input[name="ticketType"]');
      replaceIcon(label.querySelector('span > i'), ticketIcons[input?.value] || 'bi-ticket-perforated-fill');
    });
    form.querySelectorAll('.seat-picker-launcher').forEach(button => {
      replaceIcon(button.querySelector(':scope > span'), 'bi-grid-3x3-gap-fill');
      replaceIcon(button.querySelector(':scope > i'), 'bi-chevron-right');
    });
    replaceIcon(form.querySelector('.booking-confirmation > i'), 'bi-check2');
  }

  function decorateBookingForm() {
    const form = document.querySelector('#passengerForm');
    const panel = form?.closest('.booking-panel');
    if (!form || !panel) return;
    panel.classList.add('phase3-booking-panel');
    form.classList.add('phase3-booking-form');
    panel.closest('.driver-ticket-workspace')?.classList.add('phase3-driver-booking');
    panel.querySelector('.booking-panel-head')?.classList.add('phase3-booking-head');
    panel.querySelector('.booking-workspace')?.classList.add('phase3-booking-workspace');
    panel.querySelector('.booking-step-host')?.classList.add('phase3-step-host');
    const summary = panel.querySelector('.booking-summary');
    summary?.classList.add('phase3-booking-summary');
    const summaryTitle = summary?.querySelector(':scope > small');
    if (summaryTitle && !summaryTitle.querySelector('.bi')) {
      const label = summaryTitle.textContent.trim();
      summaryTitle.innerHTML = `<i class="bi bi-card-checklist" aria-hidden="true"></i><span>${label}</span>`;
    }
    panel.querySelector('.booking-actions')?.classList.add('phase3-booking-actions');
    panel.querySelector('.booking-safe')?.classList.add('phase3-booking-safe');
    bookingContext(panel);
    decorateProgress(form);
    decorateSteps(form);
  }

  const renderTabBeforePhaseThree = renderTab;
  renderTab = function phaseThreeRenderTab() {
    const result = renderTabBeforePhaseThree();
    decorateBookingForm();
    return result;
  };

  const renderTripBeforePhaseThree = renderTrip;
  renderTrip = function phaseThreeRenderTrip() {
    const result = renderTripBeforePhaseThree();
    decorateBookingForm();
    return result;
  };
})();
