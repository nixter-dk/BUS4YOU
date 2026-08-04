const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'busops-system-'));
process.env.DB_FILE = path.join(testRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(testRoot, 'uploads');

const { server } = require('../server');

function cookieFrom(response) {
  return String(response.headers.get('set-cookie') || '').split(';')[0];
}

async function request(baseUrl, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const contentType = response.headers.get('content-type') || '';
  const value = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, value };
}

async function expectStatus(baseUrl, status, pathname, options) {
  const result = await request(baseUrl, pathname, options);
  assert.equal(result.response.status, status, `${options?.method || 'GET'} ${pathname}: ${JSON.stringify(result.value)}`);
  return result;
}

test('complete booking, check-in, baggage, expense and cash workflow', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await expectStatus(baseUrl, 401, '/api/bootstrap');
    await expectStatus(baseUrl, 401, '/api/login', { method: 'POST', body: { email: 'admin@albaturist.dk', password: 'forkert' } });

    const adminLogin = await expectStatus(baseUrl, 200, '/api/login', { method: 'POST', body: { email: 'admin@albaturist.dk', password: 'admin123' } });
    const admin = cookieFrom(adminLogin.response);
    const driverLogin = await expectStatus(baseUrl, 200, '/api/login', { method: 'POST', body: { email: 'mads@albaturist.dk', password: 'chauffor123' } });
    const driver = cookieFrom(driverLogin.response);

    const empty = await expectStatus(baseUrl, 200, '/api/bootstrap', { cookie: admin });
    assert.deepEqual(empty.value.stops, []);
    assert.deepEqual(empty.value.buses, []);
    assert.deepEqual(empty.value.trips, []);

    const origin = (await expectStatus(baseUrl, 201, '/api/stops', { method: 'POST', cookie: admin, body: { name: 'København', address: 'Ingerslevsgade' } })).value;
    const destination = (await expectStatus(baseUrl, 201, '/api/stops', { method: 'POST', cookie: admin, body: { name: 'Skopje', address: 'Busstationen' } })).value;
    const extraStop = (await expectStatus(baseUrl, 201, '/api/stops', { method: 'POST', cookie: admin, body: { name: 'Odense', address: 'Parkering' } })).value;
    await expectStatus(baseUrl, 403, '/api/stops', { method: 'POST', cookie: driver, body: { name: 'Ikke tilladt' } });

    const standardBus = (await expectStatus(baseUrl, 201, '/api/buses', { method: 'POST', cookie: admin, body: { name: 'Almindelig 54', registration: 'AB 12345', type: 'standard', seatCount: 54 } })).value;
    assert.equal(standardBus.seatCount, 54);
    const doubleBus = (await expectStatus(baseUrl, 201, '/api/buses', { method: 'POST', cookie: admin, body: { name: 'Dobbeltdækker 84', registration: 'CD 67890', type: 'double', seatCount: 12 } })).value;
    assert.equal(doubleBus.seatCount, 84);
    assert.equal(doubleBus.lowerDeckSeats, 22);
    await expectStatus(baseUrl, 400, '/api/buses', { method: 'POST', cookie: admin, body: { name: 'For stor', registration: 'EF 11111', type: 'standard', seatCount: 55 } });
    await expectStatus(baseUrl, 403, '/api/buses', { method: 'POST', cookie: driver, body: { name: 'Ikke tilladt', registration: 'XX 00000', type: 'standard', seatCount: 10 } });

    const spareDriver = (await expectStatus(baseUrl, 201, '/api/drivers', { method: 'POST', cookie: admin, body: { name: 'Test Chauffør', email: 'testdriver@albaturist.dk', password: 'testpass123' } })).value;
    const salesManager = (await expectStatus(baseUrl, 201, '/api/sales-managers', { method: 'POST', cookie: admin, body: { name: 'Test Salgschef', email: 'testsalg@albaturist.dk', password: 'testpass123' } })).value;
    const salesLogin = await expectStatus(baseUrl, 200, '/api/login', { method: 'POST', body: { email: 'testsalg@albaturist.dk', password: 'testpass123' } });
    const sales = cookieFrom(salesLogin.response);
    const spareLogin = await expectStatus(baseUrl, 200, '/api/login', { method: 'POST', body: { email: 'testdriver@albaturist.dk', password: 'testpass123' } });
    const spare = cookieFrom(spareLogin.response);

    const trip = (await expectStatus(baseUrl, 201, '/api/trips', {
      method: 'POST', cookie: admin, body: {
        title: 'Systemtest København–Skopje',
        departureAt: new Date(Date.now() + 86400000).toISOString(),
        durationMinutes: 720,
        originId: origin.id,
        destinationId: destination.id,
        basePrice: 400,
        busId: doubleBus.id,
        primaryDriverId: 2,
        secondaryDriverId: 3,
        salesManagerId: salesManager.id
      }
    })).value;
    assert.equal(trip.seatCount, 84);
    assert.equal(trip.durationMinutes, 720);

    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}`, { cookie: driver });
    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}`, { cookie: sales });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}`, { cookie: spare });
    await expectStatus(baseUrl, 403, '/api/reports', { cookie: driver });
    await expectStatus(baseUrl, 403, '/api/reports', { cookie: sales });

    const seats = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/seats`, { cookie: admin })).value;
    assert.equal(seats.length, 84);
    assert.equal(seats.filter(seat => seat.deck === 'lower').length, 22);
    assert.equal(seats.filter(seat => seat.deck === 'upper').length, 62);
    assert.equal(seats.filter(seat => seat.type === 'table').length, 8);
    assert.equal(seats.filter(seat => seat.type === 'front').length, 4);
    assert.equal(seats.find(seat => seat.number === 1).surcharge, 75);
    assert.equal(seats.find(seat => seat.number === 23).surcharge, 100);

    const unpaidPassenger = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Ubetalt Passager', phone: '11111111', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'unpaid', seatNumber: 23 } })).value;
    await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Euro Passager', phone: '22222222', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'cash', paymentCurrency: 'EUR', cashAmount: 25, seatNumber: 1 } });
    await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Gratis Passager', phone: '33333333', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'free', freeTicketReason: 'Test', seatNumber: 2 } });
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Dublet', phone: '44444444', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'unpaid', seatNumber: 1 } });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: driver, body: { name: 'Ikke tilladt', phone: '55555555', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'unpaid', seatNumber: 3 } });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: sales, body: { name: 'Forkert stop', phone: '55555555', pickupStopId: extraStop.id, destinationStopId: destination.id, paymentStatus: 'cash', paymentCurrency: 'DKK', cashAmount: 100, seatNumber: 3 } });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: sales, body: { name: 'Gratis fra salg', phone: '55555555', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'free', seatNumber: 3 } });
    await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: sales, body: { name: 'Startsted Passager', phone: '66666666', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'cash', paymentCurrency: 'DKK', cashAmount: 100, seatNumber: 3 } });

    const baggagePhotoData = `data:image/png;base64,${Buffer.from('busops-baggage-photo').toString('base64')}`;
    await expectStatus(baseUrl, 400, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: admin, body: { senderName: 'Uden foto', phone: '70000000', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 1, paymentStatus: 'unpaid' } });
    const driverBaggage = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: admin, body: { senderName: 'Bagage A', phone: '77777777', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 2, description: 'Kufferter', paymentStatus: 'unpaid', photoName: 'bagage.png', photoType: 'image/png', photoData: baggagePhotoData } })).value;
    assert.ok(driverBaggage.photoFile);
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: sales, body: { senderName: 'Forkert bagage', phone: '77777777', pickupStopId: extraStop.id, destinationStopId: destination.id, pieces: 1, paymentStatus: 'cash', cashAmount: 50, paymentCurrency: 'DKK' } });
    await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: sales, body: { senderName: 'Bagage ved start', phone: '88888888', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 1, description: 'Pakke', paymentStatus: 'cash', cashAmount: 50, paymentCurrency: 'DKK', photoName: 'pakke.png', photoType: 'image/png', photoData: baggagePhotoData } });
    const baggagePhoto = await expectStatus(baseUrl, 200, `/api/baggage/${driverBaggage.id}/photo`, { cookie: driver });
    assert.equal(baggagePhoto.response.headers.get('content-type'), 'image/png');
    await expectStatus(baseUrl, 403, `/api/baggage/${driverBaggage.id}/photo`, { cookie: spare });

    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: driver, body: { id: unpaidPassenger.id, checkedIn: true } });
    const paidPassenger = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: driver, body: { id: unpaidPassenger.id, paymentStatus: 'cash', cashAmount: 500, paymentCurrency: 'DKK', paymentLocation: 'bus' } })).value;
    assert.equal(paidPassenger.cashHolderUserId, 2);
    const unchangedPayment = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: driver, body: { id: unpaidPassenger.id, paymentStatus: 'unpaid' } })).value;
    assert.equal(unchangedPayment.paymentStatus, 'cash');
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}`, { method: 'PATCH', cookie: admin, body: { primaryDriverId: 3, secondaryDriverId: 2 } });

    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/baggage`, { method: 'PATCH', cookie: driver, body: { id: driverBaggage.id, paymentStatus: 'cash', cashAmount: 20, paymentCurrency: 'EUR', paymentLocation: 'bus' } });
    for (const status of ['received', 'onboard', 'delivered']) {
      const updated = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/baggage`, { method: 'PATCH', cookie: driver, body: { id: driverBaggage.id, status } })).value;
      assert.equal(updated.status, status);
    }

    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/expenses`, { method: 'POST', cookie: sales, body: { category: 'Brændstof', amount: 120, currency: 'DKK' } });
    const expense = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/expenses`, { method: 'POST', cookie: driver, body: { category: 'Brændstof', description: 'Tankning', amount: 120, currency: 'DKK', paymentMethod: 'private' } })).value;
    assert.equal(expense.status, 'pending');
    assert.equal(expense.receiptFile, null);
    await expectStatus(baseUrl, 409, `/api/expenses/${expense.id}`, { method: 'PATCH', cookie: admin, body: { status: 'approved' } });
    const receiptData = `data:image/png;base64,${Buffer.from('busops-receipt').toString('base64')}`;
    const withReceipt = (await expectStatus(baseUrl, 200, `/api/expenses/${expense.id}`, { method: 'PATCH', cookie: driver, body: { receiptName: 'kvittering.png', receiptType: 'image/png', receiptData } })).value;
    assert.ok(withReceipt.receiptFile);
    const receipt = await expectStatus(baseUrl, 200, `/api/expenses/${expense.id}/receipt`, { cookie: driver });
    assert.equal(receipt.response.headers.get('content-type'), 'image/png');
    await expectStatus(baseUrl, 403, `/api/expenses/${expense.id}/receipt`, { cookie: sales });
    await expectStatus(baseUrl, 200, `/api/expenses/${expense.id}`, { method: 'PATCH', cookie: admin, body: { status: 'approved', reviewNote: 'OK' } });
    const reimbursed = (await expectStatus(baseUrl, 200, `/api/expenses/${expense.id}`, { method: 'PATCH', cookie: admin, body: { reimbursementStatus: 'paid' } })).value;
    assert.equal(reimbursed.reimbursementStatus, 'paid');

    const driverDashboard = (await expectStatus(baseUrl, 200, '/api/dashboard', { cookie: driver })).value;
    assert.equal(driverDashboard.cashHeld.DKK, 500);
    assert.equal(driverDashboard.cashHeld.EUR, 20);
    const salesDashboard = (await expectStatus(baseUrl, 200, '/api/dashboard', { cookie: sales })).value;
    assert.equal(salesDashboard.cashHeld.DKK, 150);

    const driverSettlement = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/settlements`, { method: 'POST', cookie: driver, body: { deliveredDKK: 500, deliveredEUR: 20 } })).value;
    assert.deepEqual(driverSettlement.expected, { DKK: 500, EUR: 20 });
    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/settlements`, { method: 'PATCH', cookie: admin, body: { id: driverSettlement.id, status: 'approved' } });
    const salesSettlement = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/settlements`, { method: 'POST', cookie: sales, body: { deliveredDKK: 150, deliveredEUR: 0 } })).value;
    assert.deepEqual(salesSettlement.expected, { DKK: 150, EUR: 0 });
    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/settlements`, { method: 'PATCH', cookie: admin, body: { id: salesSettlement.id, status: 'approved' } });

    const reports = (await expectStatus(baseUrl, 200, '/api/reports', { cookie: admin })).value;
    assert.equal(reports.summary.tickets, 4);
    assert.equal(reports.summary.paidTickets, 3);
    assert.equal(reports.summary.freeTickets, 1);
    assert.deepEqual(reports.summary.ticketRevenue, { DKK: 600, EUR: 25 });
    assert.deepEqual(reports.summary.baggageRevenue, { DKK: 50, EUR: 20 });
    assert.deepEqual(reports.summary.expenseTotals, { DKK: 120, EUR: 0 });
    assert.deepEqual(reports.tripResults[0].net, { DKK: 530, EUR: 45 });
    assert.deepEqual(reports.summary.cashAtOffice, { DKK: 650, EUR: 20 });

    const adminDashboard = (await expectStatus(baseUrl, 200, '/api/dashboard', { cookie: admin })).value;
    assert.equal(adminDashboard.cashHeld.payments, 0);
    await expectStatus(baseUrl, 409, `/api/stops/${origin.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 409, `/api/buses/${doubleBus.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 409, '/api/drivers/2', { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 200, `/api/drivers/${spareDriver.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 200, `/api/buses/${standardBus.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 200, '/api/logout', { method: 'POST', cookie: admin });
    await expectStatus(baseUrl, 401, '/api/me', { cookie: admin });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});
