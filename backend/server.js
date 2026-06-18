const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const app = express();
const port = process.env.PORT || 3001;
const SECRET_KEY = process.env.JWT_SECRET || 'gestionpro_secret_key_change_in_production';

// ========== VAPID (NOTIFICACIONES PUSH) ==========
const VAPID_KEYS_FILE = path.join(__dirname, '.vapid-keys.json');
let vapidKeys;
try {
  if (fs.existsSync(VAPID_KEYS_FILE)) {
    const data = fs.readFileSync(VAPID_KEYS_FILE, 'utf8');
    vapidKeys = JSON.parse(data);
    console.log('✅ Claves VAPID cargadas desde archivo');
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(vapidKeys, null, 2));
    console.log('✅ Claves VAPID generadas y guardadas en .vapid-keys.json');
  }
  webpush.setVapidDetails(
    'mailto:admin@gestionpro.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  console.log('🔔 Notificaciones push habilitadas');
} catch (error) {
  console.warn('⚠️ No se pudieron configurar notificaciones push:', error.message);
  webpush.sendNotification = () => Promise.reject(new Error('Notificaciones no configuradas'));
}

// ========== TELEGRAM ==========
const TelegramBot = require('node-telegram-bot-api');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'TOKEN_AQUI';
let telegramBot;
if (TELEGRAM_TOKEN && TELEGRAM_TOKEN !== 'TU_TOKEN_AQUI') {
  telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
  console.log('✅ Bot de Telegram configurado');
} else {
  console.warn('⚠️ Token de Telegram no configurado. Las funciones de Telegram no estarán disponibles.');
}

// ========== CORS ==========
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(bodyParser.json());

// ========== BASE DE DATOS ==========
const db = new sqlite3.Database('./gestionpro.db');

// ========== MIDDLEWARE ==========
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Requiere rol de administrador' });
  next();
};

// ========== INICIALIZAR TABLAS ==========
db.serialize(() => {
  // Usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'vendedor',
      permissions TEXT,
      active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const adminHash = bcrypt.hashSync('admin123', 10);
  db.run("INSERT OR IGNORE INTO users (username, password, role, active) VALUES (?, ?, 'admin', 1)", ['admin', adminHash]);

  // Productos
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      min_stock INTEGER DEFAULT 5,
      sku TEXT UNIQUE,
      currency TEXT DEFAULT 'CUP',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Clientes
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ventas
  db.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      total REAL NOT NULL,
      currency TEXT DEFAULT 'CUP',
      payment_method TEXT DEFAULT 'efectivo',
      transaction_id TEXT,
      date TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    )
  `);

  // Items de venta
  db.run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER,
      product_id INTEGER,
      quantity INTEGER,
      price REAL,
      currency TEXT DEFAULT 'CUP',
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

  // Monedas
  db.run(`
    CREATE TABLE IF NOT EXISTS currencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT DEFAULT '$',
      exchange_rate REAL DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    )
  `);

  // Proveedores
  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Compras
  db.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      total REAL NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )
  `);

  // Items de compra
  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER,
      product_id INTEGER,
      quantity INTEGER,
      price REAL,
      FOREIGN KEY(purchase_id) REFERENCES purchases(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

  // Suscripciones push
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      endpoint TEXT UNIQUE,
      keys TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Contabilidad - Transacciones
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'CUP',
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // ========== MIGRACIONES ==========
  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (!err && columns && Array.isArray(columns)) {
      if (!columns.some(col => col.name === 'permissions')) db.run("ALTER TABLE users ADD COLUMN permissions TEXT");
      if (!columns.some(col => col.name === 'active')) db.run("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1");
      if (!columns.some(col => col.name === 'last_login')) db.run("ALTER TABLE users ADD COLUMN last_login TEXT");
    }
  });

  db.all("PRAGMA table_info(products)", (err, columns) => {
    if (!err && columns && Array.isArray(columns)) {
      if (!columns.some(col => col.name === 'currency')) db.run("ALTER TABLE products ADD COLUMN currency TEXT DEFAULT 'CUP'");
      if (!columns.some(col => col.name === 'min_stock')) db.run("ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 5");
    }
  });

  db.all("PRAGMA table_info(sales)", (err, columns) => {
    if (!err && columns && Array.isArray(columns)) {
      if (!columns.some(col => col.name === 'currency')) db.run("ALTER TABLE sales ADD COLUMN currency TEXT DEFAULT 'CUP'");
      if (!columns.some(col => col.name === 'payment_method')) db.run("ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT 'efectivo'");
      if (!columns.some(col => col.name === 'transaction_id')) db.run("ALTER TABLE sales ADD COLUMN transaction_id TEXT");
      if (!columns.some(col => col.name === 'synced')) db.run("ALTER TABLE sales ADD COLUMN synced INTEGER DEFAULT 0");
    }
  });

  db.all("PRAGMA table_info(sale_items)", (err, columns) => {
    if (!err && columns && Array.isArray(columns)) {
      if (!columns.some(col => col.name === 'currency')) db.run("ALTER TABLE sale_items ADD COLUMN currency TEXT DEFAULT 'CUP'");
    }
  });

  // ========== DATOS DE EJEMPLO ==========
  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (row && row.count === 0) {
      const prods = [
        { name: "Café Americano", price: 2.5, stock: 100, min_stock: 10, sku: "CAF001", currency: "CUP" },
        { name: "Croissant", price: 1.8, stock: 50, min_stock: 8, sku: "CRO002", currency: "CUP" },
        { name: "Sandwich de pollo", price: 4.5, stock: 30, min_stock: 5, sku: "SAND003", currency: "CUP" },
        { name: "Jugo de naranja", price: 2.0, stock: 4, min_stock: 10, sku: "JUG004", currency: "CUP" }
      ];
      const stmt = db.prepare("INSERT INTO products (name, price, stock, min_stock, sku, currency) VALUES (?, ?, ?, ?, ?, ?)");
      prods.forEach(p => stmt.run(p.name, p.price, p.stock, p.min_stock, p.sku, p.currency));
      stmt.finalize();
      console.log("✅ Productos de muestra insertados");
    }
  });

  db.get("SELECT COUNT(*) as count FROM customers", (err, row) => {
    if (row && row.count === 0) {
      const custs = [
        { name: "Cliente Genérico", email: "cliente@ejemplo.com", phone: "555-0001", address: "Calle Principal 123" },
        { name: "María López", email: "maria@ejemplo.com", phone: "555-0002", address: "Av. Central 456" },
        { name: "Juan Pérez", email: "juan@ejemplo.com", phone: "555-0003", address: "Plaza Mayor 789" }
      ];
      const stmt = db.prepare("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)");
      custs.forEach(c => stmt.run(c.name, c.email, c.phone, c.address));
      stmt.finalize();
      console.log("✅ Clientes de muestra insertados");
    }
  });

  db.get("SELECT COUNT(*) as count FROM currencies", (err, row) => {
    if (row && row.count === 0) {
      const currencies = [
        { code: "CUP", name: "Peso Cubano", symbol: "$", exchange_rate: 1, is_default: 1, active: 1 },
        { code: "USD", name: "Dólar Estadounidense", symbol: "US$", exchange_rate: 24, is_default: 0, active: 1 },
        { code: "MLC", name: "Moneda Libremente Convertible", symbol: "MLC$", exchange_rate: 1, is_default: 0, active: 1 }
      ];
      const stmt = db.prepare("INSERT INTO currencies (code, name, symbol, exchange_rate, is_default, active) VALUES (?, ?, ?, ?, ?, ?)");
      currencies.forEach(c => stmt.run(c.code, c.name, c.symbol, c.exchange_rate, c.is_default, c.active));
      stmt.finalize();
      console.log("✅ Monedas de muestra insertadas");
    }
  });

  db.get("SELECT COUNT(*) as count FROM suppliers", (err, row) => {
    if (row && row.count === 0) {
      const suppliers = [
        { name: "Distribuidora Central", contact: "Carlos Pérez", phone: "555-1000", email: "central@dist.com", address: "Calle 1 # 100" },
        { name: "Proveedora del Este", contact: "Ana Gómez", phone: "555-2000", email: "este@prov.com", address: "Av. 2 # 200" },
        { name: "Alimentos del Oeste", contact: "Luis Rodríguez", phone: "555-3000", email: "oeste@alim.com", address: "Calle 3 # 300" }
      ];
      const stmt = db.prepare("INSERT INTO suppliers (name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?)");
      suppliers.forEach(s => stmt.run(s.name, s.contact, s.phone, s.email, s.address));
      stmt.finalize();
      console.log("✅ Proveedores de muestra insertados");
    }
  });
});

// ========== ENDPOINTS DE AUTENTICACIÓN ==========
app.post('/api/auth/register', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const hashed = bcrypt.hashSync(password, 10);
  db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hashed, role || 'vendedor'], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, username, role: role || 'vendedor' });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
    if (!user.active) return res.status(401).json({ error: 'Usuario inactivo' });
    db.run("UPDATE users SET last_login = ? WHERE id = ?", [new Date().toISOString(), user.id]);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, permissions: user.permissions },
      SECRET_KEY,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions } });
  });
});

// ========== ENDPOINTS DE USUARIOS ==========
app.get('/api/users', authenticateToken, isAdmin, (req, res) => {
  db.all("SELECT id, username, role, permissions, active, last_login, created_at FROM users ORDER BY id", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/users', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role, permissions, active } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const hashed = bcrypt.hashSync(password, 10);
  db.run("INSERT INTO users (username, password, role, permissions, active) VALUES (?, ?, ?, ?, ?)",
    [username, hashed, role || 'vendedor', JSON.stringify(permissions || {}), active !== undefined ? active : 1],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role, permissions, active } = req.body;
  let query = "UPDATE users SET username=?, role=?, permissions=?, active=? WHERE id=?";
  let params = [username, role || 'vendedor', JSON.stringify(permissions || {}), active !== undefined ? active : 1, req.params.id];
  if (password) {
    query = "UPDATE users SET username=?, password=?, role=?, permissions=?, active=? WHERE id=?";
    const hashed = bcrypt.hashSync(password, 10);
    params = [username, hashed, role || 'vendedor', JSON.stringify(permissions || {}), active !== undefined ? active : 1, req.params.id];
  }
  db.run(query, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ========== ENDPOINTS DE PRODUCTOS ==========
app.get('/api/products', authenticateToken, (req, res) => {
  db.all("SELECT * FROM products ORDER BY id", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/products/low-stock', authenticateToken, (req, res) => {
  db.all("SELECT * FROM products WHERE stock <= min_stock ORDER BY (stock*1.0/min_stock) ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/products', authenticateToken, isAdmin, (req, res) => {
  const { name, price, stock, min_stock, sku, currency } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  db.run("INSERT INTO products (name, price, stock, min_stock, sku, currency) VALUES (?, ?, ?, ?, ?, ?)",
    [name, price || 0, stock || 0, min_stock || 5, sku || null, currency || 'CUP'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/products/:id', authenticateToken, isAdmin, (req, res) => {
  const { name, price, stock, min_stock, sku, currency } = req.body;
  db.run("UPDATE products SET name=?, price=?, stock=?, min_stock=?, sku=?, currency=? WHERE id=?",
    [name, price, stock, min_stock, sku, currency || 'CUP', req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.delete('/api/products/:id', authenticateToken, isAdmin, (req, res) => {
  db.run("DELETE FROM products WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ========== ENDPOINTS DE CLIENTES ==========
app.get('/api/customers', authenticateToken, (req, res) => {
  db.all("SELECT * FROM customers ORDER BY name", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/customers', authenticateToken, (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  db.run("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)",
    [name, email, phone, address],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
  const { name, email, phone, address } = req.body;
  db.run("UPDATE customers SET name=?, email=?, phone=?, address=? WHERE id=?",
    [name, email, phone, address, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.delete('/api/customers/:id', authenticateToken, (req, res) => {
  db.run("DELETE FROM customers WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/customers/:id/purchases', authenticateToken, (req, res) => {
  const customerId = req.params.id;
  const query = `
    SELECT s.id, s.date, s.total, s.currency, s.payment_method, s.transaction_id,
           si.product_id, p.name as product_name, si.quantity, si.price
    FROM sales s
    JOIN sale_items si ON s.id = si.sale_id
    JOIN products p ON si.product_id = p.id
    WHERE s.customer_id = ?
    ORDER BY s.date DESC
  `;
  db.all(query, [customerId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const purchasesMap = new Map();
    rows.forEach(row => {
      if (!purchasesMap.has(row.id)) {
        purchasesMap.set(row.id, {
          id: row.id,
          date: row.date,
          total: row.total,
          currency: row.currency || 'CUP',
          payment_method: row.payment_method || 'efectivo',
          transaction_id: row.transaction_id || '',
          items: []
        });
      }
      purchasesMap.get(row.id).items.push({
        product_id: row.product_id,
        product_name: row.product_name,
        quantity: row.quantity,
        price: row.price
      });
    });
    res.json(Array.from(purchasesMap.values()));
  });
});

// ========== ENDPOINTS DE VENTAS ==========
app.get('/api/sales', authenticateToken, (req, res) => {
  const { start, end } = req.query;
  let query = `
    SELECT s.id, s.date, s.total, s.currency, s.payment_method, s.transaction_id,
           c.name as customer_name, c.id as customer_id
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
  `;
  const params = [];
  if (start && end) {
    query += ` WHERE date BETWEEN ? AND ? `;
    params.push(start, end);
  } else if (start) {
    query += ` WHERE date >= ? `;
    params.push(start);
  } else if (end) {
    query += ` WHERE date <= ? `;
    params.push(end);
  }
  query += ` ORDER BY s.date DESC`;
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/sales/recent', authenticateToken, (req, res) => {
  const query = `
    SELECT s.id, s.date, s.total, s.currency,
           c.name as customer_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    ORDER BY s.date DESC
    LIMIT 10
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/sales/daily', authenticateToken, (req, res) => {
  const { days = 7 } = req.query;
  db.all(`
    SELECT date(date) as day, SUM(total) as total
    FROM sales
    WHERE date >= date('now', '-' || ? || ' days')
    GROUP BY date(date)
    ORDER BY day ASC
  `, [days], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/sales/:id', authenticateToken, (req, res) => {
  const { total, payment_method, transaction_id } = req.body;
  const id = req.params.id;
  db.run("UPDATE sales SET total=?, payment_method=?, transaction_id=? WHERE id=?",
    [total, payment_method, transaction_id, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Venta no encontrada' });
      res.json({ success: true });
    });
});

app.post('/api/sales', authenticateToken, (req, res) => {
  const { items, total, customer_id, currency, payment_method, transaction_id } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Carrito vacío' });
  const date = new Date().toISOString();

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    db.run("INSERT INTO sales (customer_id, total, currency, payment_method, transaction_id, date) VALUES (?, ?, ?, ?, ?, ?)",
      [customer_id || null, total, currency || 'CUP', payment_method || 'efectivo', transaction_id || '', date],
      function (err) {
        if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
        const saleId = this.lastID;
        let itemsProcessed = 0;
        let hasError = false;

        for (const item of items) {
          db.run("INSERT INTO sale_items (sale_id, product_id, quantity, price, currency) VALUES (?, ?, ?, ?, ?)",
            [saleId, item.product_id, item.quantity, item.price, item.currency || 'CUP'],
            (err) => { if (err) { hasError = true; } });

          db.run("UPDATE products SET stock = stock - ? WHERE id = ?",
            [item.quantity, item.product_id],
            (err) => {
              if (err) { hasError = true; }
              itemsProcessed++;
              if (itemsProcessed === items.length) {
                if (hasError) { db.run("ROLLBACK"); return res.status(500).json({ error: "Error al actualizar stock" }); }
                else { db.run("COMMIT"); res.json({ success: true, saleId }); }
              }
            });
        }
      });
  });
});

app.get('/api/sales/:id/ticket', authenticateToken, (req, res) => {
  const saleId = req.params.id;
  const query = `
    SELECT s.id, s.date, s.total, s.currency, s.payment_method, s.transaction_id,
           c.name as customer_name, c.phone as customer_phone,
           si.product_id, p.name as product_name, si.quantity, si.price
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    JOIN sale_items si ON s.id = si.sale_id
    JOIN products p ON si.product_id = p.id
    WHERE s.id = ?
  `;
  db.all(query, [saleId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Venta no encontrada' });
    const sale = {
      id: rows[0].id,
      date: rows[0].date,
      total: rows[0].total,
      currency: rows[0].currency || 'CUP',
      payment_method: rows[0].payment_method || 'efectivo',
      transaction_id: rows[0].transaction_id || '',
      customer_name: rows[0].customer_name || 'Cliente genérico',
      customer_phone: rows[0].customer_phone || '',
      items: rows.map(row => ({
        product_name: row.product_name,
        quantity: row.quantity,
        price: row.price
      }))
    };
    res.json(sale);
  });
});

// ========== ENDPOINTS DE DASHBOARD ==========
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  db.get("SELECT COUNT(*) as totalProducts FROM products", (err, productCount) => {
    db.get("SELECT COUNT(*) as lowStockCount FROM products WHERE stock <= min_stock", (err, lowStock) => {
      db.get("SELECT SUM(total) as todaySales FROM sales WHERE date LIKE ?", [`${today}%`], (err, salesToday) => {
        db.get("SELECT SUM(quantity) as totalItemsSold FROM sale_items", (err, itemsSold) => {
          db.get("SELECT COUNT(*) as totalCustomers FROM customers", (err, customers) => {
            res.json({
              totalProducts: productCount.totalProducts || 0,
              lowStockCount: lowStock.lowStockCount || 0,
              todaySales: (salesToday && salesToday.todaySales) || 0,
              totalItemsSold: (itemsSold && itemsSold.totalItemsSold) || 0,
              totalCustomers: (customers && customers.totalCustomers) || 0
            });
          });
        });
      });
    });
  });
});

app.get('/api/dashboard/top-products', authenticateToken, (req, res) => {
  const query = `
    SELECT p.id, p.name, SUM(si.quantity) as total_sold
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    GROUP BY si.product_id
    ORDER BY total_sold DESC
    LIMIT 5
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ========== NOTIFICACIONES ==========
app.get('/api/notifications/low-stock', authenticateToken, (req, res) => {
  db.all("SELECT id, name, stock, min_stock FROM products WHERE stock <= min_stock", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/notifications/subscribe', authenticateToken, (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Suscripción inválida' });
  db.run("INSERT OR REPLACE INTO subscriptions (user_id, endpoint, keys) VALUES (?, ?, ?)",
    [req.user.id, subscription.endpoint, JSON.stringify(subscription.keys)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.post('/api/notifications/send', authenticateToken, (req, res) => {
  const { title, body, targetUserId } = req.body;
  const userId = targetUserId || req.user.id;
  if (targetUserId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No tienes permiso para enviar a otros usuarios' });
  }
  db.all("SELECT * FROM subscriptions WHERE user_id = ?", [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: 'No hay suscripciones para este usuario' });
    const notifications = rows.map(sub => {
      const subscription = { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) };
      return webpush.sendNotification(subscription, JSON.stringify({ title, body }))
        .catch(err => { console.error('Error enviando notificación:', err); return null; });
    });
    Promise.all(notifications)
      .then(results => res.json({ success: true, sent: results.filter(r => r !== null).length, total: rows.length }))
      .catch(err => res.status(500).json({ error: err.message }));
  });
});

app.get('/api/notifications/check-stock', authenticateToken, isAdmin, (req, res) => {
  db.all("SELECT * FROM products WHERE stock <= min_stock", (err, products) => {
    if (err) return res.status(500).json({ error: err.message });
    if (products.length === 0) return res.json({ message: 'No hay productos con stock bajo', products: [] });
    const title = '⚠️ Alerta de stock bajo';
    const body = `${products.length} producto(s) tienen stock bajo: ${products.map(p => p.name).join(', ')}`;
    db.all("SELECT * FROM subscriptions WHERE user_id = ?", [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      rows.forEach(sub => {
        const subscription = { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) };
        webpush.sendNotification(subscription, JSON.stringify({ title, body }))
          .catch(err => console.error('Error enviando notificación stock:', err));
      });
      res.json({ products, notifications_sent: rows.length });
    });
  });
});

// ========== TELEGRAM ==========
app.post('/api/telegram/set-chat-id', authenticateToken, isAdmin, (req, res) => {
  const { chatId } = req.body;
  if (!chatId) return res.status(400).json({ error: 'Chat ID requerido' });
  fs.writeFileSync(path.join(__dirname, '.telegram-chat-id'), chatId);
  res.json({ success: true, chatId });
});

app.get('/api/telegram/chat-id', authenticateToken, (req, res) => {
  const file = path.join(__dirname, '.telegram-chat-id');
  if (fs.existsSync(file)) res.json({ chatId: fs.readFileSync(file, 'utf8').trim() });
  else res.json({ chatId: null });
});

app.post('/api/telegram/send', authenticateToken, isAdmin, async (req, res) => {
  const { message, chatId } = req.body;
  const file = path.join(__dirname, '.telegram-chat-id');
  const targetChatId = chatId || (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null);
  if (!telegramBot) return res.status(400).json({ error: 'Telegram no configurado' });
  if (!targetChatId) return res.status(400).json({ error: 'Chat ID no configurado' });
  try {
    await telegramBot.sendMessage(targetChatId, message, { parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error enviando mensaje Telegram:', err);
    res.status(500).json({ error: err.message });
  }
});

const sendTelegramAlert = async (title, body) => {
  if (!telegramBot) return;
  const file = path.join(__dirname, '.telegram-chat-id');
  if (!fs.existsSync(file)) return;
  const chatId = fs.readFileSync(file, 'utf8').trim();
  try {
    await telegramBot.sendMessage(chatId, `⚠️ *${title}*\n\n${body}\n\n📅 ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
    console.log('✅ Alerta Telegram enviada');
  } catch (err) { console.error('Error enviando alerta Telegram:', err); }
};

const checkStockAndNotifyTelegram = async () => {
  db.all("SELECT * FROM products WHERE stock <= min_stock", async (err, products) => {
    if (err || products.length === 0) return;
    const body = products.map(p => `• *${p.name}*: stock ${p.stock} (mínimo ${p.min_stock})`).join('\n');
    await sendTelegramAlert(`📦 Stock bajo (${products.length} productos)`, body);
  });
};
setInterval(checkStockAndNotifyTelegram, 6 * 60 * 60 * 1000);
setTimeout(checkStockAndNotifyTelegram, 5000);

// ========== MONEDAS ==========
app.get('/api/currencies', authenticateToken, (req, res) => {
  db.all("SELECT * FROM currencies ORDER BY code", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/currencies', authenticateToken, isAdmin, (req, res) => {
  const { code, name, symbol, exchange_rate, is_default, active } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Código y nombre requeridos' });
  db.run("INSERT INTO currencies (code, name, symbol, exchange_rate, is_default, active) VALUES (?, ?, ?, ?, ?, ?)",
    [code, name, symbol || '$', exchange_rate || 1, is_default || 0, active !== undefined ? active : 1],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/currencies/:id', authenticateToken, isAdmin, (req, res) => {
  const { code, name, symbol, exchange_rate, is_default, active } = req.body;
  db.run("UPDATE currencies SET code=?, name=?, symbol=?, exchange_rate=?, is_default=?, active=? WHERE id=?",
    [code, name, symbol, exchange_rate, is_default, active, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.delete('/api/currencies/:id', authenticateToken, isAdmin, (req, res) => {
  db.run("DELETE FROM currencies WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ========== PROVEEDORES ==========
app.get('/api/suppliers', authenticateToken, (req, res) => {
  db.all("SELECT * FROM suppliers ORDER BY name", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/suppliers', authenticateToken, isAdmin, (req, res) => {
  const { name, contact, phone, email, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  db.run("INSERT INTO suppliers (name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?)",
    [name, contact, phone, email, address],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/suppliers/:id', authenticateToken, isAdmin, (req, res) => {
  const { name, contact, phone, email, address } = req.body;
  db.run("UPDATE suppliers SET name=?, contact=?, phone=?, email=?, address=? WHERE id=?",
    [name, contact, phone, email, address, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

app.delete('/api/suppliers/:id', authenticateToken, isAdmin, (req, res) => {
  db.run("DELETE FROM suppliers WHERE id=?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ========== COMPRAS ==========
app.post('/api/purchases', authenticateToken, isAdmin, (req, res) => {
  const { supplier_id, items, total, date } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Sin productos' });
  const purchaseDate = date || new Date().toISOString();
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    db.run("INSERT INTO purchases (supplier_id, total, date) VALUES (?, ?, ?)",
      [supplier_id || null, total, purchaseDate],
      function (err) {
        if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
        const purchaseId = this.lastID;
        let itemsProcessed = 0;
        let hasError = false;
        for (const item of items) {
          db.run("INSERT INTO purchase_items (purchase_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
            [purchaseId, item.product_id, item.quantity, item.price],
            (err) => { if (err) { hasError = true; } });
          db.get("SELECT * FROM products WHERE id = ?", [item.product_id], (err, product) => {
            if (product) {
              db.run("UPDATE products SET stock = ?, price = ? WHERE id = ?",
                [product.stock + item.quantity, item.price, item.product_id]);
            }
            itemsProcessed++;
            if (itemsProcessed === items.length) {
              if (hasError) { db.run("ROLLBACK"); return res.status(500).json({ error: "Error al procesar compra" }); }
              else { db.run("COMMIT"); res.json({ success: true, purchaseId }); }
            }
          });
        }
      });
  });
});

app.get('/api/purchases', authenticateToken, (req, res) => {
  const query = `
    SELECT p.id, p.date, p.total, s.name as supplier_name
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.date DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ========== INVENTARIO ==========
app.get('/api/inventory/valuation', authenticateToken, (req, res) => {
  const query = `
    SELECT p.id, p.name, p.stock, p.price, p.currency, (p.stock * p.price) as total_value
    FROM products p WHERE p.stock > 0 ORDER BY total_value DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = rows.reduce((sum, r) => sum + (r.total_value || 0), 0);
    res.json({ items: rows, total });
  });
});

// ========== CONTABILIDAD ==========
app.get('/api/transactions', authenticateToken, (req, res) => {
  const { start, end, type, category } = req.query;
  let query = "SELECT * FROM transactions WHERE user_id = ? OR user_id IS NULL";
  const params = [req.user.id];
  if (start && end) { query += " AND date BETWEEN ? AND ?"; params.push(start, end); }
  else if (start) { query += " AND date >= ?"; params.push(start); }
  else if (end) { query += " AND date <= ?"; params.push(end); }
  if (type) { query += " AND type = ?"; params.push(type); }
  if (category) { query += " AND category = ?"; params.push(category); }
  query += " ORDER BY date DESC, id DESC";
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/transactions', authenticateToken, (req, res) => {
  const { type, category, description, amount, currency, date } = req.body;
  if (!type || !category || !amount) return res.status(400).json({ error: 'Tipo, categoría y monto son requeridos' });
  const transactionDate = date || new Date().toISOString();
  db.run(
    "INSERT INTO transactions (type, category, description, amount, currency, date, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [type, category, description || '', amount, currency || 'CUP', transactionDate, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

app.put('/api/transactions/:id', authenticateToken, (req, res) => {
  const { type, category, description, amount, currency, date } = req.body;
  const id = req.params.id;
  db.run(
    "UPDATE transactions SET type=?, category=?, description=?, amount=?, currency=?, date=? WHERE id=? AND (user_id=? OR user_id IS NULL)",
    [type, category, description, amount, currency, date, id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Transacción no encontrada' });
      res.json({ success: true });
    }
  );
});

app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  db.run(
    "DELETE FROM transactions WHERE id=? AND (user_id=? OR user_id IS NULL)",
    [id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Transacción no encontrada' });
      res.json({ success: true });
    }
  );
});

app.get('/api/transactions/summary', authenticateToken, (req, res) => {
  const { start, end } = req.query;
  let query = "SELECT type, SUM(amount) as total FROM transactions WHERE user_id = ? OR user_id IS NULL";
  const params = [req.user.id];
  if (start && end) { query += " AND date BETWEEN ? AND ?"; params.push(start, end); }
  else if (start) { query += " AND date >= ?"; params.push(start); }
  else if (end) { query += " AND date <= ?"; params.push(end); }
  query += " GROUP BY type";
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const summary = { income: 0, expense: 0, balance: 0 };
    rows.forEach(row => {
      if (row.type === 'income') summary.income = row.total || 0;
      if (row.type === 'expense') summary.expense = row.total || 0;
    });
    summary.balance = summary.income - summary.expense;
    res.json(summary);
  });
});

app.get('/api/transactions/categories', authenticateToken, (req, res) => {
  db.all("SELECT DISTINCT category FROM transactions WHERE user_id = ? OR user_id IS NULL ORDER BY category", [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.category));
  });
});

// ========== BACKUPS ==========
const backupDB = () => {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  const source = path.join(__dirname, 'gestionpro.db');
  const dest = path.join(backupDir, `backup-${Date.now()}.db`);
  try {
    fs.copyFileSync(source, dest);
    console.log(`📦 Backup creado: ${dest}`);
    sendTelegramAlert('🔄 Backup automático', `Backup creado: ${path.basename(dest)}`);
  } catch (err) { console.error('Error creando backup:', err); }
};
setInterval(backupDB, 6 * 60 * 60 * 1000);
backupDB();

app.post('/api/restore', authenticateToken, isAdmin, (req, res) => {
  const { filename } = req.body;
  const backupPath = path.join(__dirname, 'backups', filename);
  if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Backup no encontrado' });
  try {
    fs.copyFileSync(backupPath, path.join(__dirname, 'gestionpro.db'));
    res.json({ success: true, message: 'Base de datos restaurada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== INICIAR SERVIDOR ==========
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Gestión Pro corriendo en http://0.0.0.0:${port}`);
});