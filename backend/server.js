const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

// ========== BASE DE DATOS (better-sqlite3) ==========
const Database = require('better-sqlite3');
const db = new Database('./gestionpro.db');

// ========== CONFIGURACIÓN DE LA APP ==========
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
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'TU_TOKEN_AQUI';
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

// ========== INICIALIZAR TABLAS (SÍNCRONO) ==========
const createTables = () => {
  // Usuarios
  db.exec(`
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
  db.prepare("INSERT OR IGNORE INTO users (username, password, role, active) VALUES (?, ?, 'admin', 1)").run('admin', adminHash);

  // Productos
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      total REAL NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )
  `);

  // Items de compra
  db.exec(`
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
  db.exec(`
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
  db.exec(`
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
  // Obtener columnas de cada tabla y agregar las que faltan
  const addColumnIfNotExists = (table, columnDef) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const colNames = columns.map(c => c.name);
    if (!colNames.includes(columnDef.split(' ')[0])) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
    }
  };

  addColumnIfNotExists('users', 'permissions TEXT');
  addColumnIfNotExists('users', 'active INTEGER DEFAULT 1');
  addColumnIfNotExists('users', 'last_login TEXT');
  addColumnIfNotExists('products', 'currency TEXT DEFAULT "CUP"');
  addColumnIfNotExists('products', 'min_stock INTEGER DEFAULT 5');
  addColumnIfNotExists('sales', 'currency TEXT DEFAULT "CUP"');
  addColumnIfNotExists('sales', 'payment_method TEXT DEFAULT "efectivo"');
  addColumnIfNotExists('sales', 'transaction_id TEXT');
  addColumnIfNotExists('sales', 'synced INTEGER DEFAULT 0');
  addColumnIfNotExists('sale_items', 'currency TEXT DEFAULT "CUP"');

  // ========== DATOS DE EJEMPLO ==========
  const productCount = db.prepare("SELECT COUNT(*) as count FROM products").get();
  if (productCount.count === 0) {
    const insert = db.prepare("INSERT INTO products (name, price, stock, min_stock, sku, currency) VALUES (?, ?, ?, ?, ?, ?)");
    const prods = [
      ["Café Americano", 2.5, 100, 10, "CAF001", "CUP"],
      ["Croissant", 1.8, 50, 8, "CRO002", "CUP"],
      ["Sandwich de pollo", 4.5, 30, 5, "SAND003", "CUP"],
      ["Jugo de naranja", 2.0, 4, 10, "JUG004", "CUP"]
    ];
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(...item);
    });
    insertMany(prods);
    console.log("✅ Productos de muestra insertados");
  }

  const customerCount = db.prepare("SELECT COUNT(*) as count FROM customers").get();
  if (customerCount.count === 0) {
    const insert = db.prepare("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)");
    const custs = [
      ["Cliente Genérico", "cliente@ejemplo.com", "555-0001", "Calle Principal 123"],
      ["María López", "maria@ejemplo.com", "555-0002", "Av. Central 456"],
      ["Juan Pérez", "juan@ejemplo.com", "555-0003", "Plaza Mayor 789"]
    ];
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(...item);
    });
    insertMany(custs);
    console.log("✅ Clientes de muestra insertados");
  }

  const currencyCount = db.prepare("SELECT COUNT(*) as count FROM currencies").get();
  if (currencyCount.count === 0) {
    const insert = db.prepare("INSERT INTO currencies (code, name, symbol, exchange_rate, is_default, active) VALUES (?, ?, ?, ?, ?, ?)");
    const currencies = [
      ["CUP", "Peso Cubano", "$", 1, 1, 1],
      ["USD", "Dólar Estadounidense", "US$", 24, 0, 1],
      ["MLC", "Moneda Libremente Convertible", "MLC$", 1, 0, 1]
    ];
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(...item);
    });
    insertMany(currencies);
    console.log("✅ Monedas de muestra insertadas");
  }

  const supplierCount = db.prepare("SELECT COUNT(*) as count FROM suppliers").get();
  if (supplierCount.count === 0) {
    const insert = db.prepare("INSERT INTO suppliers (name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?)");
    const suppliers = [
      ["Distribuidora Central", "Carlos Pérez", "555-1000", "central@dist.com", "Calle 1 # 100"],
      ["Proveedora del Este", "Ana Gómez", "555-2000", "este@prov.com", "Av. 2 # 200"],
      ["Alimentos del Oeste", "Luis Rodríguez", "555-3000", "oeste@alim.com", "Calle 3 # 300"]
    ];
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(...item);
    });
    insertMany(suppliers);
    console.log("✅ Proveedores de muestra insertados");
  }
};

// Ejecutar la creación de tablas
try {
  createTables();
} catch (err) {
  console.error('Error creando tablas:', err);
  process.exit(1);
}

// ========== ENDPOINTS DE AUTENTICACIÓN ==========
app.post('/api/auth/register', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const hashed = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run(username, hashed, role || 'vendedor');
    res.json({ id: result.lastInsertRowid, username, role: role || 'vendedor' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
    if (!user.active) return res.status(401).json({ error: 'Usuario inactivo' });
    db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(new Date().toISOString(), user.id);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, permissions: user.permissions },
      SECRET_KEY,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ENDPOINTS DE USUARIOS ==========
app.get('/api/users', authenticateToken, isAdmin, (req, res) => {
  try {
    const rows = db.prepare("SELECT id, username, role, permissions, active, last_login, created_at FROM users ORDER BY id").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role, permissions, active } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const hashed = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare("INSERT INTO users (username, password, role, permissions, active) VALUES (?, ?, ?, ?, ?)")
      .run(username, hashed, role || 'vendedor', JSON.stringify(permissions || {}), active !== undefined ? active : 1);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
  const { username, password, role, permissions, active } = req.body;
  try {
    if (password) {
      const hashed = bcrypt.hashSync(password, 10);
      db.prepare("UPDATE users SET username=?, password=?, role=?, permissions=?, active=? WHERE id=?")
        .run(username, hashed, role || 'vendedor', JSON.stringify(permissions || {}), active !== undefined ? active : 1, req.params.id);
    } else {
      db.prepare("UPDATE users SET username=?, role=?, permissions=?, active=? WHERE id=?")
        .run(username, role || 'vendedor', JSON.stringify(permissions || {}), active !== undefined ? active : 1, req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticateToken, isAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ENDPOINTS DE PRODUCTOS ==========
app.get('/api/products', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM products ORDER BY id").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/low-stock', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM products WHERE stock <= min_stock ORDER BY (stock*1.0/min_stock) ASC").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', authenticateToken, isAdmin, (req, res) => {
  const { name, price, stock, min_stock, sku, currency } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const result = db.prepare("INSERT INTO products (name, price, stock, min_stock, sku, currency) VALUES (?, ?, ?, ?, ?, ?)")
      .run(name, price || 0, stock || 0, min_stock || 5, sku || null, currency || 'CUP');
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', authenticateToken, isAdmin, (req, res) => {
  const { name, price, stock, min_stock, sku, currency } = req.body;
  try {
    db.prepare("UPDATE products SET name=?, price=?, stock=?, min_stock=?, sku=?, currency=? WHERE id=?")
      .run(name, price, stock, min_stock, sku, currency || 'CUP', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, isAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ENDPOINTS DE CLIENTES ==========
app.get('/api/customers', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM customers ORDER BY name").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', authenticateToken, (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const result = db.prepare("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)")
      .run(name, email, phone, address);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
  const { name, email, phone, address } = req.body;
  try {
    db.prepare("UPDATE customers SET name=?, email=?, phone=?, address=? WHERE id=?")
      .run(name, email, phone, address, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', authenticateToken, (req, res) => {
  try {
    db.prepare("DELETE FROM customers WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:id/purchases', authenticateToken, (req, res) => {
  const customerId = req.params.id;
  try {
    const rows = db.prepare(`
      SELECT s.id, s.date, s.total, s.currency, s.payment_method, s.transaction_id,
             si.product_id, p.name as product_name, si.quantity, si.price
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      JOIN products p ON si.product_id = p.id
      WHERE s.customer_id = ?
      ORDER BY s.date DESC
    `).all(customerId);
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ENDPOINTS DE VENTAS ==========
app.get('/api/sales', authenticateToken, (req, res) => {
  const { start, end } = req.query;
  let query = `
    SELECT s.id, s.date, s.total, s.currency, s.payment_method, s.transaction_id,
           c.name as customer_name, c.id as customer_id
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (start && end) {
    query += ` AND date BETWEEN ? AND ?`;
    params.push(start, end);
  } else if (start) {
    query += ` AND date >= ?`;
    params.push(start);
  } else if (end) {
    query += ` AND date <= ?`;
    params.push(end);
  }
  query += ` ORDER BY s.date DESC`;
  try {
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/recent', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT s.id, s.date, s.total, s.currency,
             c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      ORDER BY s.date DESC
      LIMIT 10
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/daily', authenticateToken, (req, res) => {
  const { days = 7 } = req.query;
  try {
    const rows = db.prepare(`
      SELECT date(date) as day, SUM(total) as total
      FROM sales
      WHERE date >= date('now', '-' || ? || ' days')
      GROUP BY date(date)
      ORDER BY day ASC
    `).all(days);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sales/:id', authenticateToken, (req, res) => {
  const { total, payment_method, transaction_id } = req.body;
  try {
    const result = db.prepare("UPDATE sales SET total=?, payment_method=?, transaction_id=? WHERE id=?")
      .run(total, payment_method, transaction_id, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sales', authenticateToken, (req, res) => {
  const { items, total, customer_id, currency, payment_method, transaction_id } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Carrito vacío' });
  const date = new Date().toISOString();

  try {
    const insertSale = db.prepare("INSERT INTO sales (customer_id, total, currency, payment_method, transaction_id, date) VALUES (?, ?, ?, ?, ?, ?)");
    const insertItem = db.prepare("INSERT INTO sale_items (sale_id, product_id, quantity, price, currency) VALUES (?, ?, ?, ?, ?)");
    const updateStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");

    const result = db.transaction(() => {
      const saleResult = insertSale.run(customer_id || null, total, currency || 'CUP', payment_method || 'efectivo', transaction_id || '', date);
      const saleId = saleResult.lastInsertRowid;
      for (const item of items) {
        insertItem.run(saleId, item.product_id, item.quantity, item.price, item.currency || 'CUP');
        updateStock.run(item.quantity, item.product_id);
      }
      return { saleId };
    })();

    res.json({ success: true, saleId: result.saleId });
  } catch (err) {
    console.error('Error en venta:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sales/:id/ticket', authenticateToken, (req, res) => {
  const saleId = req.params.id;
  try {
    const rows = db.prepare(`
      SELECT s.id, s.date, s.total, s.currency, s.payment_method, s.transaction_id,
             c.name as customer_name, c.phone as customer_phone,
             si.product_id, p.name as product_name, si.quantity, si.price
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      JOIN sale_items si ON s.id = si.sale_id
      JOIN products p ON si.product_id = p.id
      WHERE s.id = ?
    `).all(saleId);
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ENDPOINTS DE DASHBOARD ==========
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const totalProducts = db.prepare("SELECT COUNT(*) as count FROM products").get();
    const lowStockCount = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock <= min_stock").get();
    const todaySales = db.prepare("SELECT SUM(total) as total FROM sales WHERE date LIKE ?").get(`${today}%`);
    const totalItemsSold = db.prepare("SELECT SUM(quantity) as total FROM sale_items").get();
    const totalCustomers = db.prepare("SELECT COUNT(*) as count FROM customers").get();
    res.json({
      totalProducts: totalProducts.count || 0,
      lowStockCount: lowStockCount.count || 0,
      todaySales: todaySales.total || 0,
      totalItemsSold: totalItemsSold.total || 0,
      totalCustomers: totalCustomers.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/top-products', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.name, SUM(si.quantity) as total_sold
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      GROUP BY si.product_id
      ORDER BY total_sold DESC
      LIMIT 5
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== NOTIFICACIONES ==========
app.get('/api/notifications/low-stock', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT id, name, stock, min_stock FROM products WHERE stock <= min_stock").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/subscribe', authenticateToken, (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Suscripción inválida' });
  try {
    db.prepare("INSERT OR REPLACE INTO subscriptions (user_id, endpoint, keys) VALUES (?, ?, ?)")
      .run(req.user.id, subscription.endpoint, JSON.stringify(subscription.keys));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/send', authenticateToken, (req, res) => {
  const { title, body, targetUserId } = req.body;
  const userId = targetUserId || req.user.id;
  if (targetUserId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No tienes permiso para enviar a otros usuarios' });
  }
  try {
    const rows = db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").all(userId);
    if (rows.length === 0) return res.status(404).json({ error: 'No hay suscripciones para este usuario' });
    const notifications = rows.map(sub => {
      const subscription = { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) };
      return webpush.sendNotification(subscription, JSON.stringify({ title, body }))
        .catch(err => { console.error('Error enviando notificación:', err); return null; });
    });
    Promise.all(notifications)
      .then(results => res.json({ success: true, sent: results.filter(r => r !== null).length, total: rows.length }))
      .catch(err => res.status(500).json({ error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications/check-stock', authenticateToken, isAdmin, (req, res) => {
  try {
    const products = db.prepare("SELECT * FROM products WHERE stock <= min_stock").all();
    if (products.length === 0) return res.json({ message: 'No hay productos con stock bajo', products: [] });
    const title = '⚠️ Alerta de stock bajo';
    const body = `${products.length} producto(s) tienen stock bajo: ${products.map(p => p.name).join(', ')}`;
    const rows = db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").all(req.user.id);
    rows.forEach(sub => {
      const subscription = { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) };
      webpush.sendNotification(subscription, JSON.stringify({ title, body }))
        .catch(err => console.error('Error enviando notificación stock:', err));
    });
    res.json({ products, notifications_sent: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  try {
    const products = db.prepare("SELECT * FROM products WHERE stock <= min_stock").all();
    if (products.length === 0) return;
    const body = products.map(p => `• *${p.name}*: stock ${p.stock} (mínimo ${p.min_stock})`).join('\n');
    await sendTelegramAlert(`📦 Stock bajo (${products.length} productos)`, body);
  } catch (err) { console.error('Error en checkStockAndNotifyTelegram:', err); }
};
setInterval(checkStockAndNotifyTelegram, 6 * 60 * 60 * 1000);
setTimeout(checkStockAndNotifyTelegram, 5000);

// ========== MONEDAS ==========
app.get('/api/currencies', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM currencies ORDER BY code").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/currencies', authenticateToken, isAdmin, (req, res) => {
  const { code, name, symbol, exchange_rate, is_default, active } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Código y nombre requeridos' });
  try {
    const result = db.prepare("INSERT INTO currencies (code, name, symbol, exchange_rate, is_default, active) VALUES (?, ?, ?, ?, ?, ?)")
      .run(code, name, symbol || '$', exchange_rate || 1, is_default || 0, active !== undefined ? active : 1);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/currencies/:id', authenticateToken, isAdmin, (req, res) => {
  const { code, name, symbol, exchange_rate, is_default, active } = req.body;
  try {
    db.prepare("UPDATE currencies SET code=?, name=?, symbol=?, exchange_rate=?, is_default=?, active=? WHERE id=?")
      .run(code, name, symbol, exchange_rate, is_default, active, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/currencies/:id', authenticateToken, isAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM currencies WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PROVEEDORES ==========
app.get('/api/suppliers', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM suppliers ORDER BY name").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', authenticateToken, isAdmin, (req, res) => {
  const { name, contact, phone, email, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const result = db.prepare("INSERT INTO suppliers (name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?)")
      .run(name, contact, phone, email, address);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', authenticateToken, isAdmin, (req, res) => {
  const { name, contact, phone, email, address } = req.body;
  try {
    db.prepare("UPDATE suppliers SET name=?, contact=?, phone=?, email=?, address=? WHERE id=?")
      .run(name, contact, phone, email, address, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', authenticateToken, isAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM suppliers WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== COMPRAS ==========
app.post('/api/purchases', authenticateToken, isAdmin, (req, res) => {
  const { supplier_id, items, total, date } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Sin productos' });
  const purchaseDate = date || new Date().toISOString();
  try {
    const insertPurchase = db.prepare("INSERT INTO purchases (supplier_id, total, date) VALUES (?, ?, ?)");
    const insertItem = db.prepare("INSERT INTO purchase_items (purchase_id, product_id, quantity, price) VALUES (?, ?, ?, ?)");
    const updateProduct = db.prepare("UPDATE products SET stock = stock + ?, price = ? WHERE id = ?");
    const getProduct = db.prepare("SELECT * FROM products WHERE id = ?");

    const result = db.transaction(() => {
      const purchaseResult = insertPurchase.run(supplier_id || null, total, purchaseDate);
      const purchaseId = purchaseResult.lastInsertRowid;
      for (const item of items) {
        insertItem.run(purchaseId, item.product_id, item.quantity, item.price);
        const product = getProduct.get(item.product_id);
        if (product) {
          updateProduct.run(item.quantity, item.price, item.product_id);
        }
      }
      return { purchaseId };
    })();

    res.json({ success: true, purchaseId: result.purchaseId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/purchases', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.date, p.total, s.name as supplier_name
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.date DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== INVENTARIO ==========
app.get('/api/inventory/valuation', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.name, p.stock, p.price, p.currency, (p.stock * p.price) as total_value
      FROM products p WHERE p.stock > 0 ORDER BY total_value DESC
    `).all();
    const total = rows.reduce((sum, r) => sum + (r.total_value || 0), 0);
    res.json({ items: rows, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  try {
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', authenticateToken, (req, res) => {
  const { type, category, description, amount, currency, date } = req.body;
  if (!type || !category || !amount) return res.status(400).json({ error: 'Tipo, categoría y monto son requeridos' });
  const transactionDate = date || new Date().toISOString();
  try {
    const result = db.prepare("INSERT INTO transactions (type, category, description, amount, currency, date, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(type, category, description || '', amount, currency || 'CUP', transactionDate, req.user.id);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/transactions/:id', authenticateToken, (req, res) => {
  const { type, category, description, amount, currency, date } = req.body;
  try {
    const result = db.prepare("UPDATE transactions SET type=?, category=?, description=?, amount=?, currency=?, date=? WHERE id=? AND (user_id=? OR user_id IS NULL)")
      .run(type, category, description, amount, currency, date, req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  try {
    const result = db.prepare("DELETE FROM transactions WHERE id=? AND (user_id=? OR user_id IS NULL)")
      .run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/transactions/summary', authenticateToken, (req, res) => {
  const { start, end } = req.query;
  let query = "SELECT type, SUM(amount) as total FROM transactions WHERE user_id = ? OR user_id IS NULL";
  const params = [req.user.id];
  if (start && end) { query += " AND date BETWEEN ? AND ?"; params.push(start, end); }
  else if (start) { query += " AND date >= ?"; params.push(start); }
  else if (end) { query += " AND date <= ?"; params.push(end); }
  query += " GROUP BY type";
  try {
    const rows = db.prepare(query).all(...params);
    const summary = { income: 0, expense: 0, balance: 0 };
    rows.forEach(row => {
      if (row.type === 'income') summary.income = row.total || 0;
      if (row.type === 'expense') summary.expense = row.total || 0;
    });
    summary.balance = summary.income - summary.expense;
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/transactions/categories', authenticateToken, (req, res) => {
  try {
    const rows = db.prepare("SELECT DISTINCT category FROM transactions WHERE user_id = ? OR user_id IS NULL ORDER BY category")
      .all(req.user.id);
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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