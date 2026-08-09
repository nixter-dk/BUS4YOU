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
    const secondaryLogin = await expectStatus(baseUrl, 200, '/api/login', { method: 'POST', body: { email: 'sara@albaturist.dk', password: 'chauffor123' } });
    const secondaryDriver = cookieFrom(secondaryLogin.response);

    const empty = await expectStatus(baseUrl, 200, '/api/bootstrap', { cookie: admin });
    assert.deepEqual(empty.value.stops, []);
    assert.deepEqual(empty.value.buses, []);
    assert.deepEqual(empty.value.trips, []);
    const profileImageData = `data:image/png;base64,${Buffer.from('busops-profile-image').toString('base64')}`;
    await expectStatus(baseUrl, 403, '/api/branding', { method: 'PATCH', cookie: driver, body: { logoName: 'logo.png', logoType: 'image/png', logoData: profileImageData } });
    const branding = (await expectStatus(baseUrl, 200, '/api/branding', { method: 'PATCH', cookie: admin, body: { logoName: 'logo.png', logoType: 'image/png', logoData: profileImageData } })).value;
    assert.equal(branding.hasLogo, true);
    const logo = await expectStatus(baseUrl, 200, '/api/branding/logo');
    assert.equal(logo.response.headers.get('content-type'), 'image/png');

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

    const spareDriver = (await expectStatus(baseUrl, 201, '/api/drivers', { method: 'POST', cookie: admin, body: { name: 'Test Chauffør', email: 'testdriver@albaturist.dk', password: 'testpass1234', portraitName: 'chauffor.png', portraitType: 'image/png', portraitData: profileImageData } })).value;
    assert.equal(spareDriver.hasPortrait, true);
    const portrait = await expectStatus(baseUrl, 200, `/api/drivers/${spareDriver.id}/portrait`, { cookie: admin });
    assert.equal(portrait.response.headers.get('content-type'), 'image/png');
    const salesManager = (await expectStatus(baseUrl, 201, '/api/sales-managers', { method: 'POST', cookie: admin, body: { name: 'Test Salgschef', email: 'testsalg@albaturist.dk', password: 'testpass1234' } })).value;
    const salesLogin = await expectStatus(baseUrl, 200, '/api/login', { method: 'POST', body: { email: 'testsalg@albaturist.dk', password: 'testpass1234' } });
    const sales = cookieFrom(salesLogin.response);
    const spareLogin = await expectStatus(baseUrl, 200, '/api/login', { method: 'POST', body: { email: 'testdriver@albaturist.dk', password: 'testpass1234' } });
    const spare = cookieFrom(spareLogin.response);
    assert.equal((await expectStatus(baseUrl, 200, '/api/profile/language', { method: 'PATCH', cookie: admin, body: { language: 'en' } })).value.language, 'en');
    assert.equal((await expectStatus(baseUrl, 200, '/api/profile/language', { method: 'PATCH', cookie: driver, body: { language: 'sq' } })).value.language, 'sq');
    assert.equal((await expectStatus(baseUrl, 200, '/api/profile/language', { method: 'PATCH', cookie: sales, body: { language: 'de' } })).value.language, 'de');
    assert.equal((await expectStatus(baseUrl, 200, '/api/profile/language', { method: 'PATCH', cookie: spare, body: { language: 'da' } })).value.language, 'da');
    await expectStatus(baseUrl, 400, '/api/profile/language', { method: 'PATCH', cookie: driver, body: { language: 'fr' } });
    const languageBootstrap = (await expectStatus(baseUrl, 200, '/api/bootstrap', { cookie: driver })).value;
    assert.equal(languageBootstrap.user.language, 'sq');
    await expectStatus(baseUrl, 403, `/api/drivers/${spareDriver.id}`, { method:'PATCH',cookie:admin,body:{name:spareDriver.name,email:'changed-by-admin@albaturist.dk',password:'admin-changed-password'} });
    await expectStatus(baseUrl, 401, '/api/profile', { method:'PATCH',cookie:spare,body:{email:'minchauffor@albaturist.dk',currentPassword:'forkert',newPassword:''} });
    const ownDriverProfile=(await expectStatus(baseUrl,200,'/api/profile',{method:'PATCH',cookie:spare,body:{email:'minchauffor@albaturist.dk',currentPassword:'testpass1234',newPassword:'chaufforens-nye-kode'}})).value;
    assert.equal(ownDriverProfile.user.email,'minchauffor@albaturist.dk');
    await expectStatus(baseUrl,401,'/api/login',{method:'POST',body:{email:'testdriver@albaturist.dk',password:'testpass1234'}});
    await expectStatus(baseUrl,200,'/api/login',{method:'POST',body:{email:'minchauffor@albaturist.dk',password:'chaufforens-nye-kode'}});
    await expectStatus(baseUrl,403,`/api/sales-managers/${salesManager.id}`,{method:'PATCH',cookie:admin,body:{name:salesManager.name,email:'changed-by-admin-sales@albaturist.dk'}});

    await expectStatus(baseUrl, 400, '/api/trips', {
      method: 'POST', cookie: admin, body: {
        title: 'Ugyldigt startsted',
        departureAt: new Date(Date.now() + 86400000).toISOString(),
        originId: extraStop.id,
        destinationId: destination.id,
        busId: doubleBus.id,
        primaryDriverId: 2
      }
    });

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
    assert.equal(trip.timetable.length, 2);
    assert.equal(trip.timetable[0].stopId, origin.id);
    assert.equal(trip.timetable[1].stopId, destination.id);
    const timetableStart = new Date(trip.departureAt);
    const timetable = [
      { stopId: origin.id, arrivalAt: timetableStart.toISOString(), departureAt: new Date(timetableStart.getTime() + 15 * 60000).toISOString() },
      { stopId: extraStop.id, arrivalAt: new Date(timetableStart.getTime() + 120 * 60000).toISOString(), departureAt: new Date(timetableStart.getTime() + 135 * 60000).toISOString() },
      { stopId: destination.id, arrivalAt: new Date(timetableStart.getTime() + 720 * 60000).toISOString(), departureAt: new Date(timetableStart.getTime() + 720 * 60000).toISOString() }
    ];
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}`, { method: 'PATCH', cookie: driver, body: { timetable } });
    await expectStatus(baseUrl, 400, `/api/trips/${trip.id}`, { method: 'PATCH', cookie: admin, body: { timetable: timetable.map((row,index) => index===1 ? { ...row, departureAt: new Date(timetableStart.getTime() + 60 * 60000).toISOString() } : row) } });
    const scheduledTrip = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}`, { method: 'PATCH', cookie: admin, body: { timetable } })).value;
    assert.equal(scheduledTrip.timetable.length, 3);
    assert.equal(scheduledTrip.timetable[1].stopId, extraStop.id);
    assert.equal(scheduledTrip.timetable[1].arrivalAt, timetable[1].arrivalAt);

    const emptyTrip = (await expectStatus(baseUrl, 201, '/api/trips', {
      method: 'POST', cookie: admin, body: {
        title: 'Tom tur til sletning',
        departureAt: new Date(Date.now() + 172800000).toISOString(),
        originId: origin.id,
        destinationId: destination.id,
        busId: doubleBus.id,
        primaryDriverId: 2
      }
    })).value;
    assert.equal(emptyTrip.basePrice, 0);
    await expectStatus(baseUrl, 403, `/api/trips/${emptyTrip.id}`, { method: 'DELETE', cookie: driver });
    await expectStatus(baseUrl, 200, `/api/trips/${emptyTrip.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 404, `/api/trips/${emptyTrip.id}`, { cookie: admin });

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
    assert.deepEqual(seats.filter(seat => seat.type === 'table').map(seat => seat.number), [1,2,3,4,5,6,7,8]);
    assert.equal(seats.filter(seat => seat.type === 'front').length, 4);
    assert.equal(seats.find(seat => seat.number === 1).surcharge, 75);
    assert.equal(seats.find(seat => seat.number === 5).surcharge, 75);
    assert.equal(seats.find(seat => seat.number === 23).surcharge, 100);

    const unpaidPassenger = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Betaler i Danmark', ticketNumber: 'TEST-001', phone: '11111111', pickupStopId: extraStop.id, destinationStopId: destination.id, paymentStatus: 'pay_dk', seatNumber: 23 } })).value;
    assert.equal(unpaidPassenger.paymentStatus, 'pay_dk');
    assert.equal(unpaidPassenger.ticketNumber, 'TEST-001');
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Dublet billetnummer', ticketNumber: 'test-001', phone: '10101011', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'unpaid', seatNumber: 24 } });
    await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Euro Passager', phone: '22222222', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'cash', paymentCurrency: 'EUR', cashAmount: 25, seatNumber: 1 } });
    await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Gratis Passager', phone: '33333333', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'free', freeTicketReason: 'Test', seatNumber: 2 } });
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Dublet', phone: '44444444', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'unpaid', seatNumber: 1 } });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: driver, body: { name: 'Ikke tilladt', phone: '55555555', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'unpaid', seatNumber: 3 } });
    const intermediateStopSale = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: sales, body: { name: 'Opsamling undervejs', phone: '55555555', pickupStopId: extraStop.id, destinationStopId: destination.id, paymentStatus: 'pay_dk', seatNumber: 3 } })).value;
    assert.equal(intermediateStopSale.pickupStopId, extraStop.id);
    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'DELETE', cookie: sales, body: { id: intermediateStopSale.id, deletionReason: 'Fjerner testregistreringen igen' } });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: sales, body: { name: 'Gratis fra salg', phone: '55555555', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'free', seatNumber: 3 } });
    await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: sales, body: { name: 'Startsted Passager', phone: '66666666', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'cash', paymentCurrency: 'DKK', cashAmount: 100, seatNumber: 3 } });
    const driverTicket = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: driver, body: { name: 'Billet i bussen', phone: '67676767', pickupStopId: extraStop.id, destinationStopId: destination.id, paymentStatus: 'cash', paymentCurrency: 'EUR', cashAmount: 40, seatNumber: 4 } })).value;
    assert.equal(driverTicket.pickupStopId, extraStop.id);
    assert.equal(driverTicket.paymentLocation, 'bus');
    assert.equal(driverTicket.paymentRecordedBy, 2);
    assert.equal(driverTicket.cashHolderUserId, 2);
    await expectStatus(baseUrl, 400, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: driver, body: { id: driverTicket.id, edit: true, name: driverTicket.name, phone: driverTicket.phone, pickupStopId: driverTicket.pickupStopId, destinationStopId: driverTicket.destinationStopId, seatNumber: driverTicket.seatNumber, cashAmount: driverTicket.cashAmount, paymentCurrency: driverTicket.paymentCurrency } });
    const correctedPassenger = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: driver, body: { id: driverTicket.id, edit: true, name: 'Rettet Billetkunde', phone: '67670000', pickupStopId: extraStop.id, destinationStopId: destination.id, seatNumber: 5, cashAmount: 40, paymentCurrency: 'EUR', correctionReason: 'Navn, telefon og sæde var tastet forkert' } })).value;
    assert.equal(correctedPassenger.seatNumber, 5);
    assert.equal(correctedPassenger.editHistory.at(-1).editedBy, 2);
    assert.equal(correctedPassenger.editHistory.at(-1).editedByName, 'Mads Chauffør');
    const noShowPassenger = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: driver, body: { id: driverTicket.id, attendanceStatus: 'no_show' } })).value;
    assert.equal(noShowPassenger.attendanceStatus, 'no_show');
    assert.equal(noShowPassenger.checkedIn, false);
    assert.equal(noShowPassenger.attendanceHistory.at(-1).action, 'no_show');
    assert.equal(noShowPassenger.attendanceHistory.at(-1).userId, 2);
    const salesTripView = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}`, { cookie: sales })).value;
    assert.equal(salesTripView.passengers.length, 5);
    assert.ok(salesTripView.passengers.some(passenger => passenger.pickupStopId === extraStop.id));
    const mistakenPassenger = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Oprettet ved fejl', phone: '68680000', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'unpaid', seatNumber: 6 } })).value;
    await expectStatus(baseUrl, 400, `/api/trips/${trip.id}/passengers`, { method: 'DELETE', cookie: driver, body: { id: mistakenPassenger.id } });
    const deletedPassenger = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'DELETE', cookie: driver, body: { id: mistakenPassenger.id, deletionReason: 'Passageren blev oprettet ved en fejl' } })).value;
    assert.equal(deletedPassenger.freedSeatNumber, 6);
    const seatsAfterPassengerDeletion = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/seats`, { cookie: driver })).value;
    assert.equal(seatsAfterPassengerDeletion.find(seat => seat.number === 6).passengerId, null);
    await expectStatus(baseUrl, 404, `/api/trips/${trip.id}/passengers`, { method: 'DELETE', cookie: driver, body: { id: mistakenPassenger.id, deletionReason: 'Forsøger igen' } });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: spare, body: { name: 'Ikke tildelt chauffør', phone: '68686868', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'cash', paymentCurrency: 'DKK', cashAmount: 100, seatNumber: 5 } });

    const baggagePhotoData = `data:image/png;base64,${Buffer.from('busops-baggage-photo').toString('base64')}`;
    const largeBaggagePhotoData = `data:image/png;base64,${Buffer.alloc(6 * 1024 * 1024, 0x42).toString('base64')}`;
    await expectStatus(baseUrl, 400, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: admin, body: { senderName: 'Uden foto', recipientName: 'Modtager A', phone: '70000000', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 1, paymentStatus: 'unpaid' } });
    const driverBaggage = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: admin, body: { senderName: 'Bagage A', recipientName: 'Modtager B', phone: '77777777', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 2, description: 'Kufferter', paymentStatus: 'pay_mk', photoName: 'bagage.png', photoType: 'image/png', photoData: largeBaggagePhotoData } })).value;
    assert.ok(driverBaggage.photoFile);
    assert.equal(driverBaggage.paymentStatus, 'pay_mk');
    const mistakenBaggage = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: admin, body: { senderName: 'Fejlbagage', recipientName: 'Forkert modtager', phone: '70000001', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 1, paymentStatus: 'pay_dk', photoName: 'fejl.png', photoType: 'image/png', photoData: baggagePhotoData } })).value;
    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/baggage`, { method: 'DELETE', cookie: secondaryDriver, body: { id: mistakenBaggage.id, deletionReason: 'Bagagen blev oprettet ved en fejl' } });
    await expectStatus(baseUrl, 404, `/api/baggage/${mistakenBaggage.id}/photo`, { cookie: admin });
    const tripAfterDeletions = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}`, { cookie: admin })).value;
    assert.equal(tripAfterDeletions.trip.deletionHistory.at(-2).kind, 'passenger');
    assert.equal(tripAfterDeletions.trip.deletionHistory.at(-1).kind, 'baggage');
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: sales, body: { senderName: 'Forkert bagage', recipientName: 'Modtager C', phone: '77777777', pickupStopId: extraStop.id, destinationStopId: destination.id, pieces: 1, paymentStatus: 'cash', cashAmount: 50, paymentCurrency: 'DKK' } });
    await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: sales, body: { senderName: 'Bagage ved start', recipientName: 'Modtager D', phone: '88888888', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 1, description: 'Pakke', paymentStatus: 'cash', cashAmount: 50, paymentCurrency: 'DKK', photoName: 'pakke.png', photoType: 'image/png', photoData: baggagePhotoData } });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: driver, body: { senderName: 'Ubetalt i bus', recipientName: 'Modtager E', phone: '89898989', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 1, paymentStatus: 'unpaid', photoName: 'ubetalt.png', photoType: 'image/png', photoData: baggagePhotoData } });
    const baggageInBus = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: driver, body: { senderName: 'Bagage i bussen', recipientName: 'Modtager F', phone: '89898989', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 1, description: 'Taske', paymentStatus: 'cash', cashAmount: 30, paymentCurrency: 'DKK', photoName: 'taske.png', photoType: 'image/png', photoData: baggagePhotoData } })).value;
    assert.equal(baggageInBus.paymentLocation, 'bus');
    assert.equal(baggageInBus.paymentRecordedBy, 2);
    assert.equal(baggageInBus.cashHolderUserId, 2);
    assert.ok(baggageInBus.photoFile);
    const correctedBaggage = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/baggage`, { method: 'PATCH', cookie: secondaryDriver, body: { id: baggageInBus.id, edit: true, senderName: baggageInBus.senderName, recipientName: 'Ny modtager', phone: baggageInBus.phone, pickupStopId: baggageInBus.pickupStopId, destinationStopId: baggageInBus.destinationStopId, pieces: 2, description: 'To tasker', notes: 'Rettet ved optælling', cashAmount: 30, paymentCurrency: 'DKK', correctionReason: 'Antal kolli og modtager var forkert' } })).value;
    assert.equal(correctedBaggage.pieces, 2);
    assert.equal(correctedBaggage.editHistory.at(-1).editedBy, 3);
    assert.equal(correctedBaggage.recipientName, 'Ny modtager');
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/baggage`, { method: 'POST', cookie: spare, body: { senderName: 'Ikke tildelt', recipientName: 'Modtager G', phone: '90909090', pickupStopId: origin.id, destinationStopId: destination.id, pieces: 1, paymentStatus: 'cash', cashAmount: 30, paymentCurrency: 'DKK', photoName: 'afvist.png', photoType: 'image/png', photoData: baggagePhotoData } });
    const baggagePhoto = await expectStatus(baseUrl, 200, `/api/baggage/${driverBaggage.id}/photo`, { cookie: driver });
    assert.equal(baggagePhoto.response.headers.get('content-type'), 'image/png');
    await expectStatus(baseUrl, 403, `/api/baggage/${driverBaggage.id}/photo`, { cookie: spare });

    const salesCheckIn = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: sales, body: { id: unpaidPassenger.id, checkedIn: true } })).value;
    assert.equal(salesCheckIn.checkedInBy, salesManager.id);
    const manuallyUnchecked = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: driver, body: { id: unpaidPassenger.id, checkedIn: false } })).value;
    assert.equal(manuallyUnchecked.checkedIn, false);
    assert.equal(manuallyUnchecked.attendanceStatus, 'pending');
    assert.equal(manuallyUnchecked.attendanceHistory.at(-1).action, 'check_in_undone');
    assert.equal(manuallyUnchecked.attendanceHistory.at(-1).userId, 2);
    const checkedInAgain = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: sales, body: { id: unpaidPassenger.id, checkedIn: true } })).value;
    assert.equal(checkedInAgain.checkedIn, true);
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: sales, body: { id: unpaidPassenger.id, paymentStatus: 'cash', cashAmount: 500, paymentCurrency: 'DKK', paymentLocation: 'departure' } });
    const completedExtraStop = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}`, { method: 'PATCH', cookie: sales, body: { completedStopId: extraStop.id } })).value;
    assert.ok(completedExtraStop.completedStopIds.includes(extraStop.id));
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
    const correctedExpense = (await expectStatus(baseUrl, 200, `/api/expenses/${expense.id}`, { method: 'PATCH', cookie: secondaryDriver, body: { edit: true, category: 'Brændstof', description: 'Tankning og AdBlue', amount: 125, currency: 'DKK', paymentMethod: 'private', paidByUserId: 2, correctionReason: 'Kvitteringens total var forkert' } })).value;
    assert.equal(correctedExpense.amount, 125);
    assert.equal(correctedExpense.editHistory.at(-1).editedBy, 3);
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

    const transfer = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/transfers`, { method: 'POST', cookie: driver, body: { toDriverId: 3, paymentRefs: [`baggage:${baggageInBus.id}`], note: 'Kontanter afleveret i bussen' } })).value;
    assert.equal(transfer.status, 'pending');
    assert.deepEqual(transfer.totals, { DKK: 30, EUR: 0 });
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}/transfers`, { method: 'PATCH', cookie: driver, body: { id: transfer.id, status: 'accepted' } });
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}/settlements`, { method: 'POST', cookie: driver, body: { deliveredDKK: 530, deliveredEUR: 60 } });
    const acceptedTransfer = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/transfers`, { method: 'PATCH', cookie: secondaryDriver, body: { id: transfer.id, status: 'accepted' } })).value;
    assert.equal(acceptedTransfer.status, 'accepted');
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}/baggage`, { method: 'DELETE', cookie: secondaryDriver, body: { id: baggageInBus.id, deletionReason: 'Må ikke bryde kontanthistorikken' } });
    const transferredTrip = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}`, { cookie: secondaryDriver })).value;
    assert.equal(transferredTrip.baggage.find(item => item.id === baggageInBus.id).cashHolderUserId, 3);

    const driverDashboard = (await expectStatus(baseUrl, 200, '/api/dashboard', { cookie: driver })).value;
    assert.equal(driverDashboard.cashHeld.DKK, 500);
    assert.equal(driverDashboard.cashHeld.EUR, 60);
    const secondaryDashboard = (await expectStatus(baseUrl, 200, '/api/dashboard', { cookie: secondaryDriver })).value;
    assert.equal(secondaryDashboard.cashHeld.DKK, 30);
    const salesDashboard = (await expectStatus(baseUrl, 200, '/api/dashboard', { cookie: sales })).value;
    assert.equal(salesDashboard.cashHeld.DKK, 150);

    const driverSettlement = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/settlements`, { method: 'POST', cookie: driver, body: { deliveredDKK: 500, deliveredEUR: 60 } })).value;
    assert.deepEqual(driverSettlement.expected, { DKK: 500, EUR: 60 });
    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/settlements`, { method: 'PATCH', cookie: admin, body: { id: driverSettlement.id, status: 'approved' } });
    const secondarySettlement = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/settlements`, { method: 'POST', cookie: secondaryDriver, body: { deliveredDKK: 30, deliveredEUR: 0 } })).value;
    assert.deepEqual(secondarySettlement.expected, { DKK: 30, EUR: 0 });
    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/settlements`, { method: 'PATCH', cookie: admin, body: { id: secondarySettlement.id, status: 'approved' } });
    const salesSettlement = (await expectStatus(baseUrl, 201, `/api/trips/${trip.id}/settlements`, { method: 'POST', cookie: sales, body: { deliveredDKK: 150, deliveredEUR: 0 } })).value;
    assert.deepEqual(salesSettlement.expected, { DKK: 150, EUR: 0 });
    await expectStatus(baseUrl, 200, `/api/trips/${trip.id}/settlements`, { method: 'PATCH', cookie: admin, body: { id: salesSettlement.id, status: 'approved' } });

    const reports = (await expectStatus(baseUrl, 200, '/api/reports', { cookie: admin })).value;
    assert.equal(reports.summary.tickets, 5);
    assert.equal(reports.summary.paidTickets, 4);
    assert.equal(reports.summary.freeTickets, 1);
    assert.deepEqual(reports.summary.ticketRevenue, { DKK: 600, EUR: 65 });
    assert.equal(reports.summary.baggage, 3);
    assert.equal(reports.summary.paidBaggage, 3);
    assert.deepEqual(reports.summary.baggageRevenue, { DKK: 80, EUR: 20 });
    assert.deepEqual(reports.summary.expenseTotals, { DKK: 125, EUR: 0 });
    assert.deepEqual(reports.tripResults[0].net, { DKK: 555, EUR: 85 });
    assert.deepEqual(reports.summary.cashAtOffice, { DKK: 680, EUR: 60 });

    const adminDashboard = (await expectStatus(baseUrl, 200, '/api/dashboard', { cookie: admin })).value;
    assert.equal(adminDashboard.cashHeld.payments, 0);
    await expectStatus(baseUrl, 403, `/api/trips/${trip.id}`, { method: 'PATCH', cookie: driver, body: { status: 'cancelled', cancellationReason: 'Ikke tilladt' } });
    await expectStatus(baseUrl, 400, `/api/trips/${trip.id}`, { method: 'PATCH', cookie: admin, body: { status: 'cancelled', cancellationReason: '' } });
    const cancelledTrip = (await expectStatus(baseUrl, 200, `/api/trips/${trip.id}`, { method: 'PATCH', cookie: admin, body: { status: 'cancelled', cancellationReason: 'Afgangen er aflyst af driften' } })).value;
    assert.equal(cancelledTrip.status, 'cancelled');
    assert.equal(cancelledTrip.cancellationReason, 'Afgangen er aflyst af driften');
    assert.equal(cancelledTrip.cancelledByName, 'Administrator');
    assert.ok(cancelledTrip.cancelledAt);
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}/passengers`, { method: 'POST', cookie: admin, body: { name: 'Efter annullering', phone: '10101010', pickupStopId: origin.id, destinationStopId: destination.id, paymentStatus: 'unpaid', seatNumber: 5 } });
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}/passengers`, { method: 'PATCH', cookie: driver, body: { id: unpaidPassenger.id, checkedIn: true } });
    await expectStatus(baseUrl, 409, `/api/trips/${trip.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 409, `/api/stops/${origin.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 409, `/api/buses/${doubleBus.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 409, '/api/drivers/2', { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 200, `/api/drivers/${spareDriver.id}`, { method: 'DELETE', cookie: admin });
    await expectStatus(baseUrl, 200, `/api/buses/${standardBus.id}`, { method: 'DELETE', cookie: admin });
    const ownAdminProfile=(await expectStatus(baseUrl,200,'/api/profile',{method:'PATCH',cookie:admin,body:{email:'administrator-ny@albaturist.dk',currentPassword:'admin123',newPassword:'administratorens-nye-kode'}})).value;
    assert.equal(ownAdminProfile.user.email,'administrator-ny@albaturist.dk');
    await expectStatus(baseUrl, 200, '/api/logout', { method: 'POST', cookie: admin });
    await expectStatus(baseUrl, 401, '/api/me', { cookie: admin });
    await expectStatus(baseUrl,401,'/api/login',{method:'POST',body:{email:'admin@albaturist.dk',password:'admin123'}});
    await expectStatus(baseUrl,200,'/api/login',{method:'POST',body:{email:'administrator-ny@albaturist.dk',password:'administratorens-nye-kode'}});
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

test('responsive check-in controls stay inside the visible workspace', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(styles, /\.content\{overflow-x:hidden\}/);
  assert.match(styles, /\.table-scroll\{width:100%;max-width:100%;overflow-x:auto\}/);
  assert.match(styles, /\.checkin-group\{overflow:visible\}/);
  assert.match(styles, /@media\(min-width:701px\)\{\.checkin-more\.open-up>div\{top:auto;bottom:44px\}\}/);
  assert.match(styles, /\.checkin-more>div\{position:fixed;left:12px;right:12px;top:auto;bottom:calc\(80px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(app, /panelRect\.bottom>window\.innerHeight-12\|\|panelRect\.bottom>groupRect\.bottom-8/);
  assert.match(app, /if\(other!==menu\)other\.open=false/);
  assert.match(app, /COPENHAGEN_TIME_ZONE='Europe\/Copenhagen'/);
  assert.match(app, /data\.departureAt=copenhagenDateFromInput\(data\.departureAt\)\.toISOString\(\)/);
  assert.match(app, /arrivalAt:copenhagenDateFromInput/);
  assert.match(app, /<small>SÆDE NR\.<\/small>/);
  assert.match(app, /checkin-name-label">NAVN/);
  assert.match(app, /checkin-pickup"><small>OPSAMLINGSSTED/);
  assert.match(app, /checkin-destination"><small>DESTINATION/);
  assert.match(app, /data-passenger-actions="\$\{p\.id\}"/);
  assert.match(app, /function showPassengerActionSheet/);
  assert.match(app, /function performManualUncheck/);
  assert.match(app, /data-sheet-action="uncheck"/);
  assert.match(app, /Fjern check-in/);
  assert.match(app, /state\.currentCheckinStop=passenger\.pickupStopId;state\.checkInListFilter='pending'/);
  assert.match(app, /Alle passagerer · hele turen/);
  assert.match(app, /function renderAllPassengerCheckIn\(\)/);
  assert.match(app, /state\.checkInAllPassengers=event\.target\.value==='all'/);
  assert.match(app, /Alle opsamlingssteder vises samlet/);
  assert.doesNotMatch(app, /Forventet varighed/);
  assert.doesNotMatch(app, /name="durationMinutes"/);
  assert.doesNotMatch(html, /Grundpris/);
  assert.doesNotMatch(html, /name="basePrice"/);
  assert.match(app, /data-delete-record="\$\{kind\}:\$\{id\}"/);
  assert.match(app, /method:'DELETE',body:JSON\.stringify\(\{id,deletionReason:reason\}\)/);
  assert.match(styles, /\.deletion-zone\{/);
  assert.match(styles, /@media\(max-width:700px\).*\.checkin-actions\{display:none!important\}/s);
  assert.match(styles, /\.checkin-card\{grid-template-columns:62px minmax\(180px,1fr\)\}\.checkin-payment,\.checkin-actions\{display:none!important\}/);
  assert.match(app, /<span>Betaling <b>\$\{paymentStatus\}<\/b><\/span>/);
  assert.match(app, /p\.paymentStatus==='cash'\?'Betaling registreret':'Betaling mangler'/);
  assert.match(app, /aria-label="Sædeplan for dobbeltdækkerbus"/);
  assert.match(app, /<strong>Overetage<\/strong><small>62 sæder/);
  assert.match(app, /<strong>Underetage<\/strong><small>22 sæder/);
  assert.match(app, /2 BORDGRUPPER · 4 PERSONER VED HVERT BORD/);
  assert.match(styles, /\.double-decker-map \.setra-deck \.seat\.taken\{[^}]*background:#d93d49/);
  assert.match(styles, /@media\(max-width:850px\)\{\.double-decker-map \.setra-decks\{grid-template-columns:1fr\}/);
  assert.match(app, /function upcomingStopTimes\(stopId\)/);
  assert.match(app, /Steder og kommende tider/);
  assert.match(app, /Alle tider vises i København-tid/);
  assert.match(styles, /@media\(max-width:650px\)\{\.stop-schedule-list\{padding:8px\}/);
  assert.match(app, /const isStart=Number\(row\.stopId\)===Number\(trip\.originId\)/);
  assert.match(app, /STARTSTED<\/span><strong>Kun afgang/);
  assert.match(app, /Her registreres kun afgangstid/);
  assert.match(app, /function openPictureSeatPicker\(form\)/);
  assert.match(app, /picture-left-scroll/);
  assert.match(app, /Alle oprettede opsamlingssteder kan vælges – også stoppesteder undervejs/);
  assert.match(app, /Sædeplan – Dobbeltdækkerbus/);
  assert.match(app, /pictureTripInfo\(\).*pictureLegend\(\)/s);
  assert.match(app, /pictureUpperDeck\(upper,pendingSeat\).*pictureLowerDeck\(lower,pendingSeat\)/s);
  assert.match(app, /picture-table-group picture-table-group-\$\{index\}/);
  assert.match(app, /index===0\?\[\.\.\.seats\.slice\(0,2\),\.\.\.seats\.slice\(4,6\)\]/);
  assert.match(app, /picture-lower-front.*picture-stairs tall.*picture-magazine">Magasin.*picture-tables/s);
  assert.match(styles, /\.lower-front-layout \.luggage,\.picture-lower-front \.picture-magazine\{align-self:stretch/);
  assert.match(styles, /\.seat-picker-dialog\{inset:8px;max-width:none/);
  assert.match(styles, /\.picture-left\{grid-template-rows:minmax\(0,1fr\) auto;align-content:stretch;overflow:hidden\}/);
  assert.match(styles, /\.picture-continue\{position:relative;z-index:2;width:100%/);
  assert.match(styles, /@media\(max-width:950px\)\{\.seat-picker-dialog\{inset:0;width:100%;height:100%/);
});

test('official Alba Turist logo is bundled into the login background', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const translations = fs.readFileSync(path.join(__dirname, '..', 'public', 'translations.js'), 'utf8');
  const logo = path.join(__dirname, '..', 'public', 'assets', 'alba-turist-logo.jpg');
  assert.match(html, /\/assets\/alba-turist-logo\.jpg/);
  assert.match(css, /login-official-logo/);
  assert.ok(fs.existsSync(logo));
  assert.ok(fs.statSync(logo).size > 1000);
  assert.doesNotMatch(html, /Demo-login|chauffor123|admin123/);
  assert.match(html, /Husk mig på denne enhed/);
  assert.match(app, /accountNav\.dataset\.view='account'/);
  assert.match(app, /\/api\/profile/);
  assert.match(app, /\/api\/profile\/language/);
  assert.match(app, /Dansk/);
  assert.match(app, /Shqip/);
  assert.match(app, /Deutsch/);
  assert.match(app, /English/);
  assert.match(app, /MutationObserver/);
  assert.match(html, /translations\.js.*app\.js/);
  assert.match(app, /BUSOPS_TRANSLATIONS/);
  assert.match(app, /dynamicTranslationPatterns/);
  assert.match(translations, /Busser i flåden.*Busse in der Flotte.*Buses in the fleet/);
  assert.match(translations, /AKTUELT OPSAMLINGSSTED.*AKTUELLE HALTESTELLE.*CURRENT PICKUP POINT/);
  assert.match(translations, /Registrer udgift.*Ausgabe erfassen.*Record expense/);
  assert.match(app, /accountNav\.onclick=\(\)=>renderAccount\(\)/);
  assert.match(app, /function keepActiveControlVisible/);
  assert.match(app, /\.tabs \.tab\.active/);
  assert.match(css, /Fælles responsiv kvalitetssikring/);
  assert.match(css, /#view button:not\(\.seat\):not\(\.picture-seat\)/);
  assert.match(css, /dialog:not\(\.seat-picker-dialog\)\{width:calc\(100% - 16px\)/);
  assert.match(app, /Kun du kan ændre din e-mail og adgangskode/);
});
