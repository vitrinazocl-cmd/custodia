/**
 * Main Application logic for Luggage Custodia (App Equipaje)
 * Coordinates UI updates, tab changes, and event listeners.
 */

// Selected luggage type for ticket creation
let selectedLuggage = {
  type: '100 - Maleta',
  basePrice: 2000
};

// Currently generated ticket for preview
let activeCreatedTicket = null;

// Currently searched ticket for checkout
let activeCheckoutTicket = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initSession();
  initTheme();
});

// ==========================================
// SESSION MANAGEMENT
// ==========================================
function initSession() {
  const currentUser = DB.getCurrentUser();
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app-shell');

  if (currentUser) {
    loginScreen.style.display = 'none';
    appShell.style.display = 'flex';
    
    // Update operator UI displays
    document.getElementById('user-display-name').innerText = currentUser.name;
    document.getElementById('user-display-shift').innerHTML = `
      <span class="material-symbols-outlined">${currentUser.shift === 'Día' ? 'wb_sunny' : 'bedtime'}</span>
      Turno ${currentUser.shift}
    `;

    // Apply shift-specific styling theme automatically
    applyShiftTheme(currentUser.shift);

    // Initial Dashboard & Transaction lists load
    updateDashboard();
    renderTransactions();
    renderSystemLogs();
    syncERPFoliosUI();
  } else {
    loginScreen.style.display = 'flex';
    appShell.style.display = 'none';
    document.body.className = ''; // Reset body classes
  }
}

function quickFillLogin(email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = password;
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  const result = DB.login(email, password);
  if (result.success) {
    errorDiv.style.display = 'none';
    initSession();
  } else {
    errorDiv.innerText = result.message;
    errorDiv.style.display = 'block';
  }
}

function handleLogout() {
  DB.logout();
  initSession();
}

function applyShiftTheme(shift) {
  if (shift === 'Noche') {
    document.body.classList.add('theme-night');
    document.getElementById('theme-btn-icon').innerText = 'light_mode';
  } else {
    document.body.classList.remove('theme-night');
    document.getElementById('theme-btn-icon').innerText = 'dark_mode';
  }
}

// ==========================================
// THEME & VIEW ROUTING
// ==========================================
function initTheme() {
  const isNight = document.body.classList.contains('theme-night');
  document.getElementById('theme-btn-icon').innerText = isNight ? 'light_mode' : 'dark_mode';
}

function toggleTheme() {
  const isNight = document.body.classList.toggle('theme-night');
  document.getElementById('theme-btn-icon').innerText = isNight ? 'light_mode' : 'dark_mode';
  DB.logSystemEvent('Cambio Tema UI', `El operador cambió visualmente la interfaz a modo ${isNight ? 'Oscuro' : 'Claro'}.`);
}

function switchView(viewId) {
  // Hide all sections
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  
  // Show target section
  const targetSection = document.getElementById(`view-${viewId}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  // Update navbar items active states (for both sidebar and mobile nav)
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item, .mobile-nav .mobile-nav-item');
  navItems.forEach(item => {
    // Check if the click function contains the target viewId
    if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${viewId}'`)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update Header Title
  const titles = {
    pos: 'Punto de Venta POS',
    checkout: 'Retiro de Equipaje',
    audit: 'Control de Caja & Auditoría',
    erp: 'Consultas Facturación & ERP',
    promo: 'Publicidad & Campañas',
    support: 'Soporte y Contacto'
  };
  document.getElementById('view-title').innerText = titles[viewId] || 'Panel de Administración';

  // Refresh statistics/tables when loading Audit Tab
  if (viewId === 'audit') {
    updateDashboard();
    renderTransactions();
    renderSystemLogs();
  }

  // Scroll to top of view
  window.scrollTo(0, 0);
}

// ==========================================
// POS: CLIENT REGISTRATION & SEARCH
// ==========================================
function lookupClient() {
  const searchId = document.getElementById('client-search-id').value.trim();
  if (!searchId) return;

  const client = DB.findClient(searchId);
  const detailsDiv = document.getElementById('client-details-fields');
  const luggageDiv = document.getElementById('luggage-section');

  detailsDiv.style.display = 'block';
  luggageDiv.style.display = 'block';

  if (client) {
    // Fill client data (Already recognized)
    document.getElementById('client-name').value = client.name;
    document.getElementById('client-phone').value = client.phone;
    document.getElementById('client-name').focus();
    
    // Add visual notice
    DB.logSystemEvent('Búsqueda Cliente', `Se reconoció cliente RUT/Pasaporte: ${client.id} (${client.name})`);
  } else {
    // New Client: leave inputs blank for filling
    document.getElementById('client-name').value = '';
    document.getElementById('client-phone').value = '+56 9 ';
    document.getElementById('client-name').focus();
  }
}

// ==========================================
// POS: LUGGAGE CALCULATIONS & TICKET
// ==========================================
function selectLuggageType(type, basePrice, element) {
  // Remove selected from other type options
  document.querySelectorAll('.type-option').forEach(opt => opt.classList.remove('selected'));
  
  // Mark current selected
  element.classList.add('selected');
  selectedLuggage.type = type;
  selectedLuggage.basePrice = basePrice;

  calculateCustomFee();
}

function calculateCustomFee() {
  const pieces = parseInt(document.getElementById('luggage-pieces').value) || 1;
  const feeInput = document.getElementById('luggage-fee');
  feeInput.value = selectedLuggage.basePrice * pieces;
}

function generateTicket() {
  const clientId = document.getElementById('client-search-id').value.trim();
  const clientName = document.getElementById('client-name').value.trim();
  const clientPhone = document.getElementById('client-phone').value.trim();
  const luggagePieces = document.getElementById('luggage-pieces').value;
  const luggageFee = document.getElementById('luggage-fee').value;
  const luggageNotes = document.getElementById('luggage-notes').value.trim();

  // Validate inputs
  if (!clientId || !clientName || !clientPhone) {
    alert('Por favor complete los datos del cliente (RUT/Pasaporte, Nombre y Teléfono).');
    return;
  }

  const clientData = {
    id: clientId,
    name: clientName,
    phone: clientPhone
  };

  const luggageData = {
    type: selectedLuggage.type,
    pieces: luggagePieces,
    fee: luggageFee,
    notes: luggageNotes
  };

  // Save to DB (returns created ticket containing code and dates)
  const ticket = DB.createTicket(clientData, luggageData);
  activeCreatedTicket = ticket;

  // Show ticket preview card
  document.getElementById('no-ticket-placeholder').style.display = 'none';
  const receiptCard = document.getElementById('printable-receipt-content');
  receiptCard.style.display = 'flex';
  
  // Fill receipts nodes
  document.getElementById('ticket-preview-barcode').innerText = ticket.code;
  document.getElementById('ticket-preview-code').innerText = ticket.code;
  document.getElementById('ticket-preview-rut').innerText = ticket.client.id;
  document.getElementById('ticket-preview-name').innerText = ticket.client.name;
  document.getElementById('ticket-preview-phone').innerText = ticket.client.phone;
  document.getElementById('ticket-preview-type').innerText = ticket.luggageType;
  document.getElementById('ticket-preview-pieces').innerText = ticket.pieces;
  
  const dateObj = new Date(ticket.dateIn);
  document.getElementById('ticket-preview-date-in').innerText = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  document.getElementById('ticket-preview-shift').innerText = ticket.shift;
  document.getElementById('ticket-preview-notes').innerText = ticket.notes || 'Ninguna';
  document.getElementById('ticket-preview-total').innerText = '$' + parseFloat(ticket.fee).toLocaleString('es-CL');

  // Trigger sound effect or visual confirmation
  DB.logSystemEvent('Emisión Ticket', `Se generó ticket interno ${ticket.code} para cliente ${clientName} (${clientId}) por un monto de $${ticket.fee}.`);
  updateDashboard();
}

function sendTicketWhatsApp() {
  if (!activeCreatedTicket) return;

  const phone = activeCreatedTicket.client.phone.replace(/[^0-9]/g, '');
  const message = `*TICKET DE CUSTODIA - EQUIPAJEAPP*\n\n` +
                  `*Código:* ${activeCreatedTicket.code}\n` +
                  `*Cliente:* ${activeCreatedTicket.client.name}\n` +
                  `*RUT/Pasaporte:* ${activeCreatedTicket.client.id}\n` +
                  `*Detalle:* ${activeCreatedTicket.pieces} pieza(s) - ${activeCreatedTicket.luggageType}\n` +
                  `*Ingreso:* ${new Date(activeCreatedTicket.dateIn).toLocaleDateString()} ${new Date(activeCreatedTicket.dateIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\n` +
                  `*Monto Pagado:* $${parseFloat(activeCreatedTicket.fee).toLocaleString('es-CL')}\n\n` +
                  `Conserva este mensaje para el retiro de tu equipaje. ¡Muchas gracias!`;

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
  DB.logSystemEvent('Envío WhatsApp', `Se envió comprobante del ticket ${activeCreatedTicket.code} al teléfono ${phone} vía API WhatsApp.`);
}

function resetPOSForm() {
  document.getElementById('client-search-id').value = '';
  document.getElementById('client-name').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('client-details-fields').style.display = 'none';
  document.getElementById('luggage-section').style.display = 'none';
  document.getElementById('luggage-pieces').value = 1;
  document.getElementById('luggage-fee').value = '';
  document.getElementById('luggage-notes').value = '';
  
  // Set first type as selected
  const defaultOption = document.querySelector('.type-option');
  if (defaultOption) {
    selectLuggageType('100 - Maleta', 2000, defaultOption);
  }

  // Receipt box
  document.getElementById('no-ticket-placeholder').style.display = 'block';
  document.getElementById('printable-receipt-content').style.display = 'none';
  activeCreatedTicket = null;
}

// ==========================================
// CHECKOUT: LUGGAGE RETRIEVAL
// ==========================================
// ==========================================
// CHECKOUT: LUGGAGE RETRIEVAL
// ==========================================
let activeCheckoutDetails = null;

function lookupCheckout() {
  const searchCode = document.getElementById('checkout-search-code').value.trim();
  const errorDiv = document.getElementById('checkout-error');
  const detailsDiv = document.getElementById('checkout-result');

  errorDiv.style.display = 'none';
  detailsDiv.style.display = 'none';

  if (!searchCode) return;

  const tickets = DB.getTickets();
  // Search by code or by RUT/Passport
  const foundTicket = tickets.find(t => 
    t.code.toUpperCase() === searchCode.toUpperCase() || 
    t.client.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === searchCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  );

  if (!foundTicket) {
    errorDiv.innerText = 'No se encontró ningún ticket activo o cliente registrado con ese identificador.';
    errorDiv.style.display = 'block';
    return;
  }

  activeCheckoutTicket = foundTicket;
  detailsDiv.style.display = 'block';

  // Calculate overnight / multi-day stay details
  activeCheckoutDetails = DB.calculateCheckoutDetails(foundTicket);

  // Fill UI details
  document.getElementById('chk-code').innerText = foundTicket.code;
  document.getElementById('chk-name').innerText = foundTicket.client.name;
  document.getElementById('chk-rut').innerText = foundTicket.client.id;
  document.getElementById('chk-type').innerText = `${foundTicket.pieces} pieza(s) (${foundTicket.luggageType})`;
  document.getElementById('chk-fee').innerText = '$' + parseFloat(foundTicket.fee).toLocaleString('es-CL');

  const inDateObj = new Date(foundTicket.dateIn);
  document.getElementById('chk-date-in').innerText = inDateObj.toLocaleDateString() + ' ' + inDateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

  // Overnight details
  document.getElementById('chk-days-stayed').innerText = `${activeCheckoutDetails.daysStayed} día(s)`;
  document.getElementById('chk-additional-fee').innerText = '$' + activeCheckoutDetails.additionalFee.toLocaleString('es-CL');
  document.getElementById('chk-total-fee').innerText = '$' + activeCheckoutDetails.totalAmount.toLocaleString('es-CL');

  const statusBadge = document.getElementById('chk-status');
  const confirmBtn = document.getElementById('btn-confirm-checkout');

  if (foundTicket.status === 'Retirado') {
    statusBadge.innerText = 'Entregado / Cerrado';
    statusBadge.className = 'badge badge-success';
    
    const outDateObj = new Date(foundTicket.dateOut);
    document.getElementById('chk-date-out').innerText = outDateObj.toLocaleDateString() + ' ' + outDateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    confirmBtn.style.display = 'none';

    // Show what actually was saved historically
    document.getElementById('chk-days-stayed').innerText = `${foundTicket.daysStayed || 1} día(s)`;
    document.getElementById('chk-additional-fee').innerText = '$' + (foundTicket.additionalFee || 0).toLocaleString('es-CL');
    document.getElementById('chk-total-fee').innerText = '$' + (foundTicket.totalFee || foundTicket.fee).toLocaleString('es-CL');
  } else {
    statusBadge.innerText = 'En Custodia';
    statusBadge.className = 'badge badge-warning';
    document.getElementById('chk-date-out').innerText = 'En custodia activa';
    confirmBtn.style.display = 'flex';
  }
}

function confirmCheckout() {
  if (!activeCheckoutTicket || !activeCheckoutDetails) return;

  const result = DB.checkoutTicket(
    activeCheckoutTicket.code, 
    activeCheckoutDetails.additionalFee, 
    activeCheckoutDetails.daysStayed
  );
  
  if (result.success) {
    let msg = `Retiro del equipaje ${activeCheckoutTicket.code} registrado con éxito.\n` +
              `Estadía: ${activeCheckoutDetails.daysStayed} día(s).\n` +
              `Pago Inicial: $${parseFloat(activeCheckoutTicket.fee).toLocaleString('es-CL')}\n`;
    if (activeCheckoutDetails.additionalFee > 0) {
      msg += `Pago Adicional Cobrado: $${activeCheckoutDetails.additionalFee.toLocaleString('es-CL')}\n`;
    }
    msg += `Total Transacción: $${activeCheckoutDetails.totalAmount.toLocaleString('es-CL')}`;
    alert(msg);
    resetCheckoutForm();
    updateDashboard();
  } else {
    alert(result.message);
  }
}

function resetCheckoutForm() {
  document.getElementById('checkout-search-code').value = '';
  document.getElementById('checkout-result').style.display = 'none';
  document.getElementById('checkout-error').style.display = 'none';
  activeCheckoutTicket = null;
  activeCheckoutDetails = null;
}

// ==========================================
// CAJA & AUDITORÍA (Leakage control dashboard)
// ==========================================
function updateDashboard() {
  const currentUser = DB.getCurrentUser();
  if (!currentUser) return;

  // Active in custody count (All tickets that are 'Activo')
  const allTickets = DB.getTickets();
  const activeCount = allTickets.filter(t => t.status === 'Activo').length;
  document.getElementById('stats-active-count').innerText = activeCount;

  // Get active shift stats
  const stats = DB.getShiftStats(currentUser.shift);
  document.getElementById('stats-collected-amount').innerText = '$' + stats.totalCollected.toLocaleString('es-CL');
  document.getElementById('stats-total-tickets').innerText = stats.totalTickets;

  // Render overnight tickets list
  renderOvernightTickets();
}

function renderOvernightTickets() {
  const tbody = document.querySelector('#overnight-tickets-table tbody');
  if (!tbody) return;

  const tickets = DB.getTickets();
  const now = new Date();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Filter for Active tickets that were registered before today
  const overnightTickets = tickets.filter(t => {
    if (t.status !== 'Activo') return false;
    const dateIn = new Date(t.dateIn);
    const dateInMidnight = new Date(dateIn.getFullYear(), dateIn.getMonth(), dateIn.getDate());
    return dateInMidnight < nowMidnight;
  });

  tbody.innerHTML = '';

  if (overnightTickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-tertiary); padding: 16px;">No hay equipajes pernoctados actualmente. Todo en orden.</td></tr>`;
    return;
  }

  overnightTickets.forEach(ticket => {
    const tr = document.createElement('tr');
    
    // Calculate days stayed
    const dateIn = new Date(ticket.dateIn);
    const dateInMidnight = new Date(dateIn.getFullYear(), dateIn.getMonth(), dateIn.getDate());
    const daysDiff = Math.round((nowMidnight - dateInMidnight) / (1000 * 60 * 60 * 24));
    const daysStayed = daysDiff + 1; // e.g. entered yesterday -> 2 calendar days

    const dateFormatted = dateIn.toLocaleDateString() + ' ' + dateIn.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    tr.innerHTML = `
      <td><strong style="color: var(--primary-color);">${ticket.code}</strong></td>
      <td>${ticket.client.id}</td>
      <td>${ticket.client.name}</td>
      <td>${dateFormatted}</td>
      <td><span class="badge badge-warning" style="font-size: 11px; font-weight: bold;">${daysStayed} día(s)</span></td>
      <td>${ticket.luggageType}</td>
      <td>${ticket.pieces}</td>
      <td>$${parseFloat(ticket.fee).toLocaleString('es-CL')}</td>
      <td>
        <button class="btn-primary" style="padding: 6px 12px; font-size: 11px; border-radius: 6px; width: auto; font-weight: 500;" onclick="goToCheckoutWithCode('${ticket.code}')">
          Cobrar Retiro
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function goToCheckoutWithCode(code) {
  // Prefill search code
  document.getElementById('checkout-search-code').value = code;
  // Switch view to checkout
  switchView('checkout');
  // Lookup
  lookupCheckout();
}

function renderTransactions() {
  const tbody = document.querySelector('#transactions-table tbody');
  if (!tbody) return;

  const shiftFilter = document.getElementById('filter-tx-shift').value;
  let transactions = DB.getTransactions();

  if (shiftFilter !== 'todos') {
    transactions = transactions.filter(t => t.shift === shiftFilter);
  }

  tbody.innerHTML = '';

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-tertiary);">No hay registros de transacciones para el filtro seleccionado.</td></tr>`;
    return;
  }

  transactions.forEach(tx => {
    const tr = document.createElement('tr');
    const date = new Date(tx.timestamp);
    const dateFormatted = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const amountClass = tx.type === 'Ingreso' ? 'amount-income' : 'amount-neutral';
    const amountPrefix = tx.type === 'Ingreso' ? '+' : '';

    tr.innerHTML = `
      <td>${dateFormatted}</td>
      <td>${tx.operator}</td>
      <td><span class="badge ${tx.shift === 'Día' ? 'badge-info' : 'badge-warning'}">${tx.shift}</span></td>
      <td><strong style="color: var(--primary-color);">${tx.ticketCode}</strong></td>
      <td>${tx.clientName}</td>
      <td><span class="badge ${tx.type === 'Ingreso' ? 'badge-success' : 'badge-info'}">${tx.type}</span></td>
      <td class="${amountClass}">${amountPrefix}$${parseFloat(tx.amount).toLocaleString('es-CL')}</td>
      <td>${tx.details}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSystemLogs() {
  const tbody = document.querySelector('#system-logs-table tbody');
  if (!tbody) return;

  const logs = DB.getSystemLogs();
  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-tertiary);">No hay logs de seguridad registrados.</td></tr>`;
    return;
  }

  logs.slice(0, 10).forEach(log => {
    const tr = document.createElement('tr');
    const date = new Date(log.timestamp);
    const dateFormatted = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    tr.innerHTML = `
      <td>${dateFormatted}</td>
      <td><strong>${log.event}</strong></td>
      <td>${log.description}</td>
      <td><span style="font-size: 11px; font-weight: 500;">${log.operator}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function exportTransactions() {
  const transactions = DB.getTransactions();
  const header = ['Fecha', 'Operador', 'Turno', 'Ticket', 'Pasajero', 'Acción', 'Monto', 'Detalles'];
  const rows = transactions.map(t => [
    new Date(t.timestamp).toISOString(),
    t.operator,
    t.shift,
    t.ticketCode,
    t.clientName,
    t.type,
    t.amount,
    t.details
  ]);

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Include BOM for Excel
  csvContent += header.join(";") + "\n";
  rows.forEach(rowArray => {
    const row = rowArray.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";");
    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `auditoria_caja_equipaje_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  DB.logSystemEvent('Exportación de Caja', 'Se exportó el libro de transacciones a formato CSV para cuadratura externa.');
}

// ==========================================
// ERP SIMULATION CONTROLS
// ==========================================
function syncERPFoliosUI() {
  const folios = DB.getERPFolios();
  document.getElementById('erp-folios-available').innerText = folios.totalAvailable;
  document.getElementById('erp-caf-filename').innerText = folios.cafFilename + ` (Cargado: ${new Date(folios.loadedAt).toLocaleDateString()})`;
}

function triggerCAFUpload() {
  document.getElementById('caf-file-input').click();
}

function handleCAFUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Mock parsing file and load details
  const folios = DB.loadCAF(file.name);
  syncERPFoliosUI();
  alert(`CAF cargado exitosamente. Se sumaron 500 folios disponibles en el sistema.`);
}

function requestMoreFolios() {
  const qty = prompt("Ingrese la cantidad de folios que desea solicitar al ERP (Máx. 1000):", "250");
  const parsed = parseInt(qty);
  if (!parsed || parsed <= 0) {
    if (qty !== null) alert("Por favor, ingrese un número entero positivo.");
    return;
  }

  const folios = DB.requestFolios(parsed);
  syncERPFoliosUI();
  alert(`Solicitud aprobada por ERP. ${parsed} folios adicionales cargados al timbraje local.`);
}

function syncERPFolios() {
  alert("Sincronizando estado local con folios timbrados en el ERP externo...\nSincronización exitosa.");
  DB.logSystemEvent('Sincronización ERP', 'Se ejecutó sincronización completa de folios y estados del SII con el ERP externo.');
}

function lookupERPDocument() {
  const docId = document.getElementById('erp-search-doc').value.trim();
  const detailsDiv = document.getElementById('erp-document-details');

  if (!docId) return;

  // Mock doc lookup
  detailsDiv.style.display = 'block';
  document.getElementById('erp-doc-id').innerText = docId;

  // Fill in some random info based on doc number to make it look active
  const docAmount = 2000 + (parseInt(docId) % 5) * 1500;
  document.getElementById('erp-doc-amount').innerText = '$' + docAmount.toLocaleString('es-CL') + ' CLP';
  
  const docRuts = ['14.512.981-k', '19.821.439-2', '12.345.678-9', '18.112.556-7'];
  document.getElementById('erp-doc-rut').innerText = docRuts[parseInt(docId) % docRuts.length];
}

// ==========================================
// CIERRE DE CAJA POR TURNO
// ==========================================
function showShiftClosureModal() {
  const currentUser = DB.getCurrentUser();
  if (!currentUser) {
    alert('No hay una sesión activa para realizar el cierre.');
    return;
  }

  const stats = DB.getShiftStats(currentUser.shift);
  const allTxs = DB.getTransactions().filter(t => t.shift === currentUser.shift);
  const now = new Date();
  
  // Calculate breakdown
  let intakeCollected = 0;
  let checkoutCollected = 0;
  
  allTxs.forEach(t => {
    if (t.type === 'Ingreso') {
      if (t.details.includes('Recepción')) {
        intakeCollected += t.amount;
      } else if (t.details.includes('Cobro adicional') || t.details.includes('Estadía')) {
        checkoutCollected += t.amount;
      } else {
        intakeCollected += t.amount;
      }
    }
  });

  const modalBody = document.getElementById('closure-modal-body');
  modalBody.innerHTML = `
    <div id="shift-closure-receipt" style="font-family: monospace; background: white; color: black; padding: 20px; border: 1px dashed #ccc; border-radius: 4px; font-size: 13px;">
      <div style="text-align: center; margin-bottom: 12px; border-bottom: 1px dashed black; padding-bottom: 12px;">
        <h2 style="margin: 0; font-size: 16px;">COMPROBANTE DE CIERRE</h2>
        <p style="margin: 4px 0; font-size: 11px;">CUSTODIA EQUIPAJE EXPRESS</p>
        <p style="margin: 4px 0; font-size: 10px;">Fecha: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</p>
      </div>
      
      <div style="margin-bottom: 12px; border-bottom: 1px dashed black; padding-bottom: 8px;">
        <p style="margin: 4px 0; display: flex; justify-content: space-between;"><strong>Operador:</strong> <span>${currentUser.name}</span></p>
        <p style="margin: 4px 0; display: flex; justify-content: space-between;"><strong>Turno:</strong> <span>${currentUser.shift}</span></p>
        <p style="margin: 4px 0; display: flex; justify-content: space-between;"><strong>Estado:</strong> <span>Cerrado</span></p>
      </div>

      <div style="margin-bottom: 12px; border-bottom: 1px dashed black; padding-bottom: 8px;">
        <h4 style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase;">Resumen del Turno</h4>
        <p style="margin: 4px 0; display: flex; justify-content: space-between;"><span>Servicios Totales:</span> <span>${stats.totalTickets} ticket(s)</span></p>
        <p style="margin: 4px 0; display: flex; justify-content: space-between;"><span>Equipajes en Custodia:</span> <span>${stats.activeCount}</span></p>
        <p style="margin: 4px 0; display: flex; justify-content: space-between;"><span>Retiros Entregados:</span> <span>${stats.completedCount}</span></p>
      </div>

      <div style="margin-bottom: 12px; border-bottom: 1px dashed black; padding-bottom: 8px;">
        <h4 style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase;">Flujo de Efectivo</h4>
        <p style="margin: 4px 0; display: flex; justify-content: space-between;"><span>Recaudado Recepción:</span> <span>$${intakeCollected.toLocaleString('es-CL')}</span></p>
        <p style="margin: 4px 0; display: flex; justify-content: space-between;"><span>Recaudado Retiros (Extras):</span> <span>$${checkoutCollected.toLocaleString('es-CL')}</span></p>
        <p style="margin: 6px 0 0 0; display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; border-top: 1px dashed #eee; padding-top: 4px;">
          <span>TOTAL EFECTIVO:</span> <span>$${stats.totalCollected.toLocaleString('es-CL')}</span>
        </p>
      </div>

      <div style="margin-top: 40px; text-align: center;">
        <div style="border-top: 1px solid black; width: 150px; margin: 0 auto 4px auto;"></div>
        <p style="margin: 0; font-size: 11px;">Firma de Entrega</p>
        <p style="margin: 2px 0 0 0; font-size: 10px; color: #555;">${currentUser.name}</p>
      </div>

      <div style="margin-top: 30px; text-align: center;">
        <div style="border-top: 1px dashed black; width: 150px; margin: 0 auto 4px auto;"></div>
        <p style="margin: 0; font-size: 11px;">Firma de Recepción</p>
        <p style="margin: 2px 0 0 0; font-size: 9px; color: #888;">Turno Siguiente</p>
      </div>
    </div>
  `;
  
  document.getElementById('closure-modal').style.display = 'flex';
}

function closeClosureModal() {
  document.getElementById('closure-modal').style.display = 'none';
}

function confirmShiftClosure() {
  const currentUser = DB.getCurrentUser();
  if (!currentUser) return;

  const stats = DB.getShiftStats(currentUser.shift);
  const allTxs = DB.getTransactions().filter(t => t.shift === currentUser.shift);
  const now = new Date();
  
  // Calculate breakdown
  let intakeCollected = 0;
  let checkoutCollected = 0;
  
  allTxs.forEach(t => {
    if (t.type === 'Ingreso') {
      if (t.details.includes('Recepción')) {
        intakeCollected += t.amount;
      } else if (t.details.includes('Cobro adicional') || t.details.includes('Estadía')) {
        checkoutCollected += t.amount;
      } else {
        intakeCollected += t.amount;
      }
    }
  });

  const totalCollected = stats.totalCollected;
  
  // Log event
  DB.logSystemEvent('Cierre Turno', `Cierre de caja realizado para el turno ${currentUser.shift} por ${currentUser.name}. Total recaudado: $${totalCollected.toLocaleString('es-CL')}.`);

  // Format WhatsApp message for supervisor/support
  const supportPhone = '56951496392';
  const wspMessage = 
    `🔒 *CIERRE DE CAJA - CUSTODIA EQUIPAJE*\n\n` +
    `👤 *Operador:* ${currentUser.name}\n` +
    `⏰ *Turno:* ${currentUser.shift}\n` +
    `📅 *Fecha/Hora:* ${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n` +
    `----------------------------------\n` +
    `📦 *Resumen de Bultos:*\n` +
    `• Servicios Totales: ${stats.totalTickets} ticket(s)\n` +
    `• En Custodia Activos: ${stats.activeCount}\n` +
    `• Retiros Entregados: ${stats.completedCount}\n` +
    `----------------------------------\n` +
    `💰 *Flujo de Efectivo:*\n` +
    `• Recepción: $${intakeCollected.toLocaleString('es-CL')}\n` +
    `• Retiros (Extras): $${checkoutCollected.toLocaleString('es-CL')}\n` +
    `*TOTAL ENTREGADO: $${totalCollected.toLocaleString('es-CL')}*\n\n` +
    `⚠️ _Caja cerrada de forma inmutable en el sistema._`;

  const wspUrl = `https://wa.me/${supportPhone}?text=${encodeURIComponent(wspMessage)}`;

  // Simple print handler
  const printContent = document.getElementById('shift-closure-receipt').outerHTML;
  
  const win = window.open('', '_blank');
  win.document.write('<html><head><title>Cierre de Caja</title><style>body { font-family: monospace; padding: 20px; } @media print { body { padding: 0; } }</style></head><body>');
  win.document.write(printContent);
  win.document.write('</body></html>');
  win.document.close();
  win.print();
  win.close();

  closeClosureModal();
  
  // Open WhatsApp in a new tab/window to notify supervisor
  window.open(wspUrl, '_blank');
  
  // Force operator logout
  handleLogout();
  alert('Cierre de caja registrado exitosamente. Se ha abierto WhatsApp para enviar el reporte al administrador y se ha cerrado el turno.');
}

// ==========================================
// CLIENT PORTAL (Seguimiento de Custodia)
// ==========================================
function showClientPortal(show) {
  const loginScreen = document.getElementById('login-screen');
  const clientPortalScreen = document.getElementById('client-portal-screen');
  
  // Clear search inputs and results
  document.getElementById('client-portal-search-code').value = '';
  document.getElementById('client-portal-error').style.display = 'none';
  document.getElementById('client-portal-result').style.display = 'none';
  
  if (show) {
    loginScreen.style.display = 'none';
    clientPortalScreen.style.display = 'flex';
  } else {
    loginScreen.style.display = 'flex';
    clientPortalScreen.style.display = 'none';
  }
}

function lookupClientPortalTicket() {
  const searchCode = document.getElementById('client-portal-search-code').value.trim();
  const errorDiv = document.getElementById('client-portal-error');
  const resultDiv = document.getElementById('client-portal-result');

  errorDiv.style.display = 'none';
  resultDiv.style.display = 'none';

  if (!searchCode) {
    errorDiv.innerText = 'Por favor ingresa un código de ticket.';
    errorDiv.style.display = 'block';
    return;
  }

  const tickets = DB.getTickets();
  const foundTicket = tickets.find(t => t.code.toUpperCase() === searchCode.toUpperCase());

  if (!foundTicket) {
    errorDiv.innerText = 'No se encontró ningún ticket de custodia con el código ingresado. Verifica e intenta nuevamente.';
    errorDiv.style.display = 'block';
    return;
  }

  // Populate tracking result
  resultDiv.style.display = 'block';
  
  // Format Date In
  const dateInObj = new Date(foundTicket.dateIn);
  document.getElementById('track-time-in').innerText = dateInObj.toLocaleDateString() + ' ' + dateInObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

  // Setup Timeline Steps (Retail progress bar style)
  const stepReceived = document.getElementById('track-step-received');
  const stepCustody = document.getElementById('track-step-custody');
  const stepDelivered = document.getElementById('track-step-delivered');

  // Step 1: Received is always completed
  stepReceived.className = 'timeline-step completed';
  
  // Step 2 & 3: depends on status
  if (foundTicket.status === 'Activo') {
    // Under custody
    stepCustody.className = 'timeline-step active';
    stepCustody.querySelector('.timeline-icon span').innerText = 'hourglass_empty';
    
    // Calculate days stayed currently
    const details = DB.calculateCheckoutDetails(foundTicket);
    document.getElementById('track-custody-detail').innerText = `En resguardo seguro. Días transcurridos: ${details.daysStayed} día(s).`;
    
    // Delivered is pending
    stepDelivered.className = 'timeline-step';
    document.getElementById('track-time-out').innerText = 'Pendiente de retiro';
    
    // Balances
    document.getElementById('track-pieces').innerText = `${foundTicket.pieces} bulto(s) (${foundTicket.luggageType})`;
    document.getElementById('track-days').innerText = `${details.daysStayed} día(s)`;
    document.getElementById('track-paid-initial').innerText = '$' + parseFloat(foundTicket.fee).toLocaleString('es-CL');
    document.getElementById('track-balance-pending').innerText = '$' + details.additionalFee.toLocaleString('es-CL');
    document.getElementById('track-total-cost').innerText = '$' + details.totalAmount.toLocaleString('es-CL');
  } else {
    // Already delivered
    stepCustody.className = 'timeline-step completed';
    stepCustody.querySelector('.timeline-icon span').innerText = 'check_circle';
    document.getElementById('track-custody-detail').innerText = `Custodia finalizada. Días totales: ${foundTicket.daysStayed || 1} día(s).`;
    
    stepDelivered.className = 'timeline-step completed';
    const dateOutObj = new Date(foundTicket.dateOut);
    document.getElementById('track-time-out').innerText = dateOutObj.toLocaleDateString() + ' ' + dateOutObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Balances
    document.getElementById('track-pieces').innerText = `${foundTicket.pieces} bulto(s) (${foundTicket.luggageType})`;
    document.getElementById('track-days').innerText = `${foundTicket.daysStayed || 1} día(s)`;
    document.getElementById('track-paid-initial').innerText = '$' + parseFloat(foundTicket.fee).toLocaleString('es-CL');
    document.getElementById('track-balance-pending').innerText = '$' + (foundTicket.additionalFee || 0).toLocaleString('es-CL');
    document.getElementById('track-total-cost').innerText = '$' + (foundTicket.totalFee || foundTicket.fee).toLocaleString('es-CL');
  }

  // Pre-fill WhatsApp link with specific inquiry text
  const phone = '56951496392';
  const wspText = `Hola, mi nombre es ${foundTicket.client.name} y tengo una consulta sobre mi custodia del ticket ${foundTicket.code} (${foundTicket.pieces} pieza/s).`;
  document.getElementById('client-portal-wsp-btn').href = `https://wa.me/${phone}?text=${encodeURIComponent(wspText)}`;
}

function toggleCardFullscreen(btn) {
  const card = btn.closest('.card');
  if (!card) return;

  const isFullscreen = card.classList.toggle('card-fullscreen');
  
  // Toggle body class to reset parent CSS animation context
  document.body.classList.toggle('fullscreen-active', isFullscreen);
  
  const icon = btn.querySelector('.material-symbols-outlined');
  
  if (icon) {
    icon.innerText = isFullscreen ? 'close' : 'fullscreen';
  }

  DB.logSystemEvent('Vista Pantalla Completa', `Se ${isFullscreen ? 'expandió' : 'contrajo'} la tabla de auditoría: ${card.querySelector('h3').innerText.trim()}`);
}
