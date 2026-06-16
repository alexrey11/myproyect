const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3001;
const SECRET_KEY = 'tecoposplus_secret_key_change_in_production';

app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database('./tecopos.db');

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

db.serialize(() => {
  // Tablas
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'vendedor')`);
  const adminHash = bcrypt.hashSync('admin123', 10);
  db.run("INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)", ['admin', adminHash, 'admin']);

  db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL, min_stock INTEGER DEFAULT 5, sku TEXT UNIQUE, currency TEXT DEFAULT 'CUP')`);
  db.run(`CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, total REAL NOT NULL, currency TEXT DEFAULT 'CUP', payment_method TEXT DEFAULT 'efectivo', transaction_id TEXT, date TEXT NOT NULL, synced INTEGER DEFAULT 0, FOREIGN KEY(customer_id) REFERENCES customers(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER, product_id INTEGER, quantity INTEGER, price REAL, currency TEXT DEFAULT 'CUP', FOREIGN KEY(sale_id) REFERENCES sales(id), FOREIGN KEY(product_id) REFERENCES products(id))`);

  // Migraciones para sales
  db.all("PRAGMA table_info(sales)", (err, columns) => {
    if (!err && columns && Array.isArray(columns)) {
      if (!columns.some(col => col.name === 'currency')) {
        db.run("ALTER TABLE sales ADD COLUMN currency TEXT DEFAULT 'CUP'");
      }
      if (!columns.some(col => col.name === 'payment_method')) {
        db.run("ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT 'efectivo'");
      }
      if (!columns.some(col => col.name === 'transaction_id')) {
        db.run("ALTER TABLE sales ADD COLUMN transaction_id TEXT");
      }
      if (!columns.some(col => col.name === 'synced')) {
        db.run("ALTER TABLE sales ADD COLUMN synced INTEGER DEFAULT 0");
      }
    }
  });

  // Migraciones para products
  db.all("PRAGMA table_info(products)", (err, columns) => {
    if (!err && columns && Array.isArray(columns)) {
      if (!columns.some(col => col.name === 'currency')) {
        db.run("ALTER TABLE products ADD COLUMN currency TEXT DEFAULT 'CUP'");
      }
      if (!columns.some(col => col.name === 'min_stock')) {
        db.run("ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 5");
      }
    }
  });

  // Datos de ejemplo
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
    }
  });
});

// ========== AUTH ==========
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
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });
});

// ========== PRODUCTOS ==========
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
    [name, price, stock, min_stock, sku, currency, req.params.id],
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

// ========== CLIENTES ==========
app.get('/api/customers', authenticateToken, (req, res) => {
  db.all("SELECT * FROM customers ORDER BY name", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/customers', authenticateToken, isAdmin, (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  db.run("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)",
    [name, email, phone, address],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.get('/api/customers/:id/purchases', authenticateToken, (req, res) => {
  const customerId = req.params.id;
  const query = `
    SELECT s.id, s.date, s.total, s.currency, s.payment_method, s.transaction_id,
           si.product_id, p.name as product_name, si.quantity, si.price, si.currency as item_currency
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
        price: row.price,
        currency: row.item_currency || 'CUP'
      });
    });
    res.json(Array.from(purchasesMap.values()));
  });
});

// ========== VENTAS ==========
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

app.get('/api/sales/recent', authenticateToken, (req, res) => {
  db.all(`
    SELECT s.id, s.date, s.total, c.name as customer_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    ORDER BY s.date DESC
    LIMIT 5
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/dashboard/top-products', authenticateToken, (req, res) => {
  db.all(`
    SELECT p.name, SUM(si.quantity) as total_sold
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    GROUP BY si.product_id
    ORDER BY total_sold DESC
    LIMIT 5
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
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
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: err.message });
        }
        const saleId = this.lastID;
        let itemsProcessed = 0;
        let hasError = false;

        for (const item of items) {
          db.run("INSERT INTO sale_items (sale_id, product_id, quantity, price, currency) VALUES (?, ?, ?, ?, ?)",
            [saleId, item.product_id, item.quantity, item.price, item.currency || 'CUP'],
            (err) => { if (err) hasError = true; });

          db.run("UPDATE products SET stock = stock - ? WHERE id = ?",
            [item.quantity, item.product_id],
            (err) => {
              if (err) hasError = true;
              itemsProcessed++;
              if (itemsProcessed === items.length) {
                if (hasError) {
                  db.run("ROLLBACK");
                  return res.status(500).json({ error: "Error actualizando stock" });
                } else {
                  db.run("COMMIT");
                  res.json({ success: true, saleId });
                }
              }
            });
        }
      });
  });
});

// ========== ACTUALIZAR VENTA (PUT) ==========
app.put('/api/sales/:id', authenticateToken, (req, res) => {
  const { total, payment_method, transaction_id } = req.body;
  const id = req.params.id;
  db.run(
    "UPDATE sales SET total = ?, payment_method = ?, transaction_id = ? WHERE id = ?",
    [total, payment_method, transaction_id, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Venta no encontrada' });
      res.json({ success: true });
    }
  );
});

// ========== DASHBOARD STATS ==========
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  db.get("SELECT COUNT(*) as totalProducts FROM products", (err, productCount) => {
    db.get("SELECT COUNT(*) as lowStockCount FROM products WHERE stock <= min_stock", (err, lowStock) => {
      db.get("SELECT SUM(total) as todaySales FROM sales WHERE date LIKE ?", [`${today}%`], (err, salesToday) => {
        db.get("SELECT COUNT(DISTINCT customer_id) as totalCustomers FROM sales", (err, customers) => {
          db.get("SELECT SUM(quantity) as totalItemsSold FROM sale_items", (err, itemsSold) => {
            res.json({
              totalProducts: productCount.totalProducts || 0,
              lowStockCount: lowStock.lowStockCount || 0,
              todaySales: (salesToday && salesToday.todaySales) || 0,
              totalCustomers: (customers && customers.totalCustomers) || 0,
              totalItemsSold: (itemsSold && itemsSold.totalItemsSold) || 0
            });
          });
        });
      });
    });
  });
});

app.listen(port, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${port}`);
});