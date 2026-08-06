/**
 * Database and Storage Layer for Luggage App (App Equipaje)
 * Uses localStorage for persistent data and mock data for demonstration.
 */

const DB = (() => {
  // Predefined users (Shifts)
  const MOCK_USERS = [
    { email: 'dia@equipaje.com', name: 'Operador Día', password: 'dia123', shift: 'Día' },
    { email: 'noche@equipaje.com', name: 'Operador Noche', password: 'noche123', shift: 'Noche' }
  ];

  // Helper to load/save from LocalStorage
  const loadData = (key, defaultVal) => {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultVal;
  };

  const saveData = (key, val) => {
    localStorage.setItem(key, JSON.stringify(val));
  };

  return {
    // Authentication
    login(email, password) {
      const user = MOCK_USERS.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
      if (user) {
        const sessionUser = { email: user.email, name: user.name, shift: user.shift };
        saveData('active_user', sessionUser);
        
        // Log system sign-in
        this.logSystemEvent('Inicio de Turno', `El operador del turno ${user.shift} ingresó al sistema.`);
        return { success: true, user: sessionUser };
      }
      return { success: false, message: 'Correo o contraseña incorrectos.' };
    },

    logout() {
      const currentUser = this.getCurrentUser();
      if (currentUser) {
        this.logSystemEvent('Cierre de Turno', `El operador del turno ${currentUser.shift} cerró sesión.`);
      }
      localStorage.removeItem('active_user');
    },

    getCurrentUser() {
      return loadData('active_user', null);
    },

    // Clients
    getClients() {
      return loadData('luggage_clients', {});
    },

    findClient(id) {
      // id can be RUT or Passport
      const clients = this.getClients();
      const cleanedId = id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      
      // Search matching clean keys
      for (const key in clients) {
        if (key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanedId) {
          return clients[key];
        }
      }
      return null;
    },

    saveClient(client) {
      const clients = this.getClients();
      const key = client.id.trim();
      clients[key] = {
        id: client.id,       // RUT or Passport
        name: client.name,
        phone: client.phone,
        updatedAt: new Date().toISOString()
      };
      saveData('luggage_clients', clients);
      return clients[key];
    },

    // Tickets
    getTickets() {
      const tickets = loadData('luggage_tickets', null);
      if (tickets === null || tickets.length === 0) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2); // 2 days ago

        const seedTickets = [
          {
            id: 'tk_seed1',
            code: 'EQ-260803-0001',
            tagCode: 'A31 - 1',
            client: {
              id: '12345678-9',
              name: 'Juan Pérez',
              phone: '+56912345678'
            },
            luggageType: '03000 - Televisor',
            pieces: 1,
            fee: 5000,
            notes: 'Televisor Smart TV 55 pulgadas en caja',
            status: 'Activo',
            dateIn: yesterday.toISOString(),
            dateOut: null,
            createdBy: 'Operador Día',
            shift: 'Día',
            withdrawnBy: null
          }
        ];
        
        const clients = this.getClients();
        clients['12345678-9'] = {
          id: '12345678-9',
          name: 'Juan Pérez',
          phone: '+56912345678',
          updatedAt: yesterday.toISOString()
        };
        saveData('luggage_clients', clients);
        saveData('luggage_tickets', seedTickets);
        
        // Register initial intake transaction
        this.addTransaction({
          ticketCode: 'EQ-260803-0001',
          clientName: 'Juan Pérez',
          type: 'Ingreso',
          amount: 5000,
          shift: 'Día',
          operator: 'Operador Día',
          details: 'Recepción de 1 pieza(s) (03000 - Televisor)'
        });

        return seedTickets;
      }
      return tickets;
    },

    createTicket(clientData, luggageData) {
      const tickets = this.getTickets();
      const currentUser = this.getCurrentUser();
      
      // Auto-register client if new or details changed
      this.saveClient(clientData);

      const timestamp = new Date();
      
      // Calculate tag code: Letter + Week + "-" + DailySequence
      const daysLetters = ['G', 'A', 'B', 'C', 'D', 'E', 'F'];
      const dayLetter = daysLetters[timestamp.getDay()];
      
      const getWeekNumber = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      };
      const weekNum = getWeekNumber(timestamp);
      
      const todayMidnight = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
      const dailySequence = tickets.filter(t => new Date(t.dateIn) >= todayMidnight).length + 1;
      const tagCode = `${dayLetter}${weekNum} - ${dailySequence}`;

      // Generate unique ticket code: EQ-YYMMDD-XXX
      const dateStr = timestamp.toISOString().slice(2, 10).replace(/-/g, '');
      const sequence = String(tickets.length + 1).padStart(4, '0');
      const ticketCode = `EQ-${dateStr}-${sequence}`;

      const newTicket = {
        id: 'tk_' + Math.random().toString(36).substr(2, 9),
        code: ticketCode,
        tagCode: tagCode,
        client: {
          id: clientData.id,
          name: clientData.name,
          phone: clientData.phone
        },
        luggageType: luggageData.type, // 'Mochila', 'Maleta Mediana', 'Maleta Grande', 'Especial'
        pieces: parseInt(luggageData.pieces) || 1,
        fee: parseFloat(luggageData.fee) || 0,
        notes: luggageData.notes || '',
        status: 'Activo', // 'Activo' (en custodia), 'Retirado'
        dateIn: timestamp.toISOString(),
        dateOut: null,
        createdBy: currentUser ? currentUser.name : 'Sistema',
        shift: currentUser ? currentUser.shift : 'Desconocido',
        withdrawnBy: null
      };

      tickets.push(newTicket);
      saveData('luggage_tickets', tickets);

      // Register transaction to avoid money leakage (money collected at intake)
      this.addTransaction({
        ticketCode: ticketCode,
        clientName: clientData.name,
        type: 'Ingreso',
        amount: newTicket.fee,
        shift: newTicket.shift,
        operator: newTicket.createdBy,
        details: `Recepción de ${newTicket.pieces} pieza(s) (${newTicket.luggageType})`
      });

      return newTicket;
    },

    calculateCheckoutDetails(ticket) {
      if (!ticket) return null;
      
      const dateIn = new Date(ticket.dateIn);
      const dateOut = new Date();
      
      const dateInMidnight = new Date(dateIn.getFullYear(), dateIn.getMonth(), dateIn.getDate());
      const dateOutMidnight = new Date(dateOut.getFullYear(), dateOut.getMonth(), dateOut.getDate());
      
      const daysDiff = Math.round((dateOutMidnight - dateInMidnight) / (1000 * 60 * 60 * 24));
      const daysStayed = Math.max(1, daysDiff + 1);
      
      // Determine daily rate
      const prices = {
        '100 - Maleta': 2000,
        '500 - Mochila': 1500,
        '400 - Bolso': 1500,
        '700 - Carrito': 3000,
        '01000 - Bolsa Grande': 1000,
        '2000 - Bicicleta': 4000,
        '800 - Otros': 2000,
        '900 - Día Adicional': 2000,
        '200 - Matutero': 3000,
        '03000 - Televisor': 5000,
        '600 - Caja': 2000,
        '300 - Fardo o Saco': 3000
      };
      const dailyPrice = (prices[ticket.luggageType] || 2000) * ticket.pieces;
      const totalAmount = dailyPrice * daysStayed;
      const additionalFee = Math.max(0, totalAmount - ticket.fee);

      return {
        daysStayed,
        dailyPrice,
        totalAmount,
        additionalFee
      };
    },

    checkoutTicket(ticketCode, additionalAmountPaid = 0, daysStayed = 1) {
      const tickets = this.getTickets();
      const currentUser = this.getCurrentUser();
      const ticketIndex = tickets.findIndex(t => t.code.toUpperCase() === ticketCode.toUpperCase().trim());

      if (ticketIndex === -1) {
        return { success: false, message: 'Ticket no encontrado.' };
      }

      const ticket = tickets[ticketIndex];
      if (ticket.status === 'Retirado') {
        return { success: false, message: 'Este equipaje ya fue retirado anteriormente.' };
      }

      const timestamp = new Date();
      ticket.status = 'Retirado';
      ticket.dateOut = timestamp.toISOString();
      ticket.withdrawnBy = currentUser ? currentUser.name : 'Sistema';
      ticket.daysStayed = daysStayed;
      ticket.additionalFee = additionalAmountPaid;
      ticket.totalFee = ticket.fee + additionalAmountPaid;

      tickets[ticketIndex] = ticket;
      saveData('luggage_tickets', tickets);

      // Log transaction for checkout (marks the custody release)
      this.addTransaction({
        ticketCode: ticket.code,
        clientName: ticket.client.name,
        type: 'Retiro',
        amount: 0, 
        shift: currentUser ? currentUser.shift : 'Desconocido',
        operator: currentUser ? currentUser.name : 'Sistema',
        details: `Retiro de equipaje. Custodia cerrada. Días de estadía: ${daysStayed}.`
      });

      // If additional money was paid for overnight, log an Income Transaction to prevent cash leakage!
      if (additionalAmountPaid > 0) {
        this.addTransaction({
          ticketCode: ticket.code,
          clientName: ticket.client.name,
          type: 'Ingreso',
          amount: additionalAmountPaid,
          shift: currentUser ? currentUser.shift : 'Desconocido',
          operator: currentUser ? currentUser.name : 'Sistema',
          details: `Cobro adicional por estadía prolongada (${daysStayed} días en total).`
        });
      }

      return { success: true, ticket: ticket };
    },

    // Transactions (Audit Log for anti-leakage)
    getTransactions() {
      return loadData('luggage_transactions', []);
    },

    addTransaction(tx) {
      const transactions = this.getTransactions();
      const newTx = {
        id: 'tx_' + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        ticketCode: tx.ticketCode,
        clientName: tx.clientName,
        type: tx.type, // 'Ingreso', 'Retiro', 'Ajuste'
        amount: parseFloat(tx.amount) || 0,
        shift: tx.shift,
        operator: tx.operator,
        details: tx.details
      };
      transactions.unshift(newTx); // Newest first
      saveData('luggage_transactions', transactions);
      return newTx;
    },

    // System event logs (for audits)
    getSystemLogs() {
      return loadData('system_logs', []);
    },

    logSystemEvent(event, description) {
      const logs = this.getSystemLogs();
      const currentUser = this.getCurrentUser();
      const newLog = {
        id: 'log_' + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        event: event,
        description: description,
        operator: currentUser ? `${currentUser.name} (${currentUser.shift})` : 'Sistema'
      };
      logs.unshift(newLog);
      saveData('system_logs', logs);
    },

    // Statistics and Cash Controls (Leakage prevention)
    getShiftStats(shiftName) {
      const tickets = this.getTickets();
      const transactions = this.getTransactions();
      
      const filteredTxs = transactions.filter(t => t.shift === shiftName);
      const activeTickets = tickets.filter(t => t.shift === shiftName && t.status === 'Activo');
      const completedTickets = tickets.filter(t => t.shift === shiftName && t.status === 'Retirado');

      const totalCollected = filteredTxs
        .filter(t => t.type === 'Ingreso' || (t.type === 'Ajuste' && t.amount > 0))
        .reduce((sum, t) => sum + t.amount, 0);

      return {
        totalTickets: activeTickets.length + completedTickets.length,
        activeCount: activeTickets.length,
        completedCount: completedTickets.length,
        totalCollected: totalCollected
      };
    },

    // Simulating ERP Folio management (Internal Boletas / external ERP integration details)
    getERPFolios() {
      return loadData('erp_folios', {
        currentFolio: 1540,
        totalAvailable: 460,
        cafLoaded: true,
        cafFilename: 'CAF_8123281_77_2026.xml',
        loadedAt: '2026-07-15T12:00:00Z',
        lastRequestedAt: '2026-07-15T11:45:00Z'
      });
    },

    saveERPFolios(folios) {
      saveData('erp_folios', folios);
    },

    requestFolios(qty) {
      const folios = this.getERPFolios();
      folios.totalAvailable += parseInt(qty);
      folios.lastRequestedAt = new Date().toISOString();
      this.saveERPFolios(folios);
      this.logSystemEvent('Solicitud Folios ERP', `Se solicitaron y cargaron ${qty} folios adicionales de boletas.`);
      return folios;
    },

    loadCAF(filename) {
      const folios = this.getERPFolios();
      folios.cafLoaded = true;
      folios.cafFilename = filename;
      folios.totalAvailable += 500; // Carga 500 folios más
      folios.loadedAt = new Date().toISOString();
      this.saveERPFolios(folios);
      this.logSystemEvent('Carga CAF', `Se cargó archivo CAF ${filename} sumando 500 folios.`);
      return folios;
    }
  };
})();
