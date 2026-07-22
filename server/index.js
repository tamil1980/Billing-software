import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const getDbConfig = () => ({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ledgerly',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10
});

let pool = null;
let dbError = null;

async function addColumnIfNotExists(table, column, definition) {
  try {
    const [rows] = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
      [process.env.DB_NAME || 'ledgerly', table, column]
    );
    if (rows.length === 0) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`Added column ${column} to table ${table}`);
    }
  } catch (e) {
    console.error(`Error migrating column ${column}:`, e.message);
  }
}

async function initDatabase() {
  dbError = null;
  const config = getDbConfig();
  console.log(`Connecting to MySQL at ${config.host}:${config.port} as user '${config.user}' (password: ${config.password ? 'YES' : 'NO'})...`);

  try {
    const rootConn = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port
    });

    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\`;`);
    await rootConn.end();

    pool = mysql.createPool(config);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        sku VARCHAR(60) UNIQUE,
        category VARCHAR(80) DEFAULT 'General',
        price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        stock INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(120),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_no VARCHAR(50) NOT NULL UNIQUE,
        customer_name VARCHAR(150) NOT NULL,
        invoice_date DATE NOT NULL,
        total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        status ENUM('Paid', 'Pending', 'Overdue') DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrations for existing invoices table
    await addColumnIfNotExists('invoices', 'supplier_name', 'VARCHAR(150)');
    await addColumnIfNotExists('invoices', 'supplier_address', 'TEXT');
    await addColumnIfNotExists('invoices', 'supplier_phone', 'VARCHAR(50)');
    await addColumnIfNotExists('invoices', 'gst_rate', 'DECIMAL(5,2) DEFAULT 18.00');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        item_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );
    `);

    // Seed default login accounts if users table is empty
    const [userRows] = await pool.query('SELECT COUNT(*) as count FROM users');
    if (userRows[0].count === 0) {
      await pool.query(`
        INSERT INTO users (name, email, password, role) VALUES
        ('Admin User', 'admin@ledgerly.in', 'admin123', 'admin'),
        ('Billing User', 'user@ledgerly.in', 'user123', 'user')
      `);
      console.log('Seeded default login accounts into MySQL users table.');
    }

    // Seed starter items if empty
    const [itemRows] = await pool.query('SELECT COUNT(*) as count FROM items');
    if (itemRows[0].count === 0) {
      await pool.query(`
        INSERT INTO items (id, name, sku, category, price, stock) VALUES
        (1, 'Wireless Headphones', 'WH-2401', 'Electronics', 2499.00, 24),
        (2, 'USB-C Cable', 'UC-1102', 'Accessories', 499.00, 67),
        (3, 'Desk Lamp', 'DL-3320', 'Office', 1699.00, 14)
      `);
      console.log('Seeded starter items into MySQL items table.');
    }

    // Seed starter suppliers if empty
    const [supplierRows] = await pool.query('SELECT COUNT(*) as count FROM suppliers');
    if (supplierRows[0].count === 0) {
      await pool.query(`
        INSERT INTO suppliers (id, name, email, phone, address) VALUES
        (1, 'Apex Electronics Co.', 'sales@apexelectronics.in', '+91 98765 43210', '12 Industrial Estate, Bengaluru, KA'),
        (2, 'Nexus Accessories', 'info@nexusacc.com', '+91 98123 45678', '45 Logistics Park, Mumbai, MH')
      `);
      console.log('Seeded starter suppliers into MySQL suppliers table.');
    }

    console.log('✅ SUCCESS: Connected to MySQL database and all tables are ready!');
  } catch (err) {
    dbError = err.message;
    console.error('❌ ERROR: MySQL connection failed:', err.message);
    console.error('Please verify DB_USER and DB_PASSWORD in your .env file.');
  }
}

initDatabase();

// Middleware to ensure DB connection
const requireDb = (req, res, next) => {
  if (!pool) {
    return res.status(503).json({
      error: `MySQL Database not connected. Error: ${dbError || 'Connection refused'}.`
    });
  }
  next();
};

// Healthcheck
app.get('/api/health', async (_, res) => {
  if (!pool) {
    return res.status(503).json({ status: 'error', database: 'disconnected', message: dbError });
  }
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
  }
});

// Auth / Login Route
app.post('/api/auth/login', requireDb, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, email, role, password FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0 || rows[0].password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users Management
app.get('/api/users', requireDb, async (_, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireDb, async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists in MySQL' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, password, role]
    );

    res.status(201).json({ id: result.insertId, name, email, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted from MySQL' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Items Routes
app.get('/api/items', requireDb, async (_, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM items ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', requireDb, async (req, res) => {
  try {
    const { name, sku, category = 'General', price, stock = 0 } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Item name and price are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO items (name, sku, category, price, stock) VALUES (?, ?, ?, ?, ?)',
      [name, sku || null, category, price, stock]
    );

    res.status(201).json({ id: result.insertId, name, sku, category, price, stock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM items WHERE id = ?', [id]);
    res.json({ message: 'Item deleted from MySQL' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Suppliers Routes
app.get('/api/suppliers', requireDb, async (_, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', requireDb, async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const [result] = await pool.query(
      'INSERT INTO suppliers (name, email, phone, address) VALUES (?, ?, ?, ?)',
      [name, email || '', phone || '', address || '']
    );

    res.status(201).json({ id: result.insertId, name, email, phone, address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
    res.json({ message: 'Supplier deleted from MySQL' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invoices & Invoice Items Routes
app.get('/api/invoices', requireDb, async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = 'SELECT * FROM invoices';
    const params = [];

    if (from && to) {
      query += ' WHERE invoice_date BETWEEN ? AND ?';
      params.push(from, to);
    }
    query += ' ORDER BY invoice_date DESC, id DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invoices/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    const [[invoice]] = await pool.query(
      `SELECT i.*, COALESCE(i.supplier_address, s.address) AS supplier_address, COALESCE(i.supplier_phone, s.phone) AS supplier_phone 
       FROM invoices i 
       LEFT JOIN suppliers s ON s.name = i.supplier_name 
       WHERE i.id = ?`,
      [id]
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const [items] = await pool.query(
      `SELECT ii.item_id, ii.quantity, ii.unit_price, i.name 
       FROM invoice_items ii 
       JOIN items i ON i.id = ii.item_id 
       WHERE ii.invoice_id = ?`,
      [id]
    );

    res.json({ ...invoice, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices', requireDb, async (req, res) => {
  const {
    invoice_no,
    customer_name,
    supplier_name = '',
    supplier_address = '',
    supplier_phone = '',
    invoice_date,
    items = [],
    total,
    status = 'Pending',
    gst_rate = 18
  } = req.body;

  if (!invoice_no || !customer_name || !invoice_date || !items.length) {
    return res.status(400).json({ error: 'Missing required invoice details or line items' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO invoices (invoice_no, customer_name, supplier_name, supplier_address, supplier_phone, invoice_date, gst_rate, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, customer_name, supplier_name, supplier_address, supplier_phone, invoice_date, gst_rate, total, status]
    );

    const invoiceId = result.insertId;

    for (const line of items) {
      await conn.query(
        'INSERT INTO invoice_items (invoice_id, item_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [invoiceId, line.itemId, line.quantity, line.unitPrice]
      );

      await conn.query(
        'UPDATE items SET stock = GREATEST(stock - ?, 0) WHERE id = ?',
        [line.quantity, line.itemId]
      );
    }

    await conn.commit();
    res.status(201).json({ id: invoiceId, invoice_no, total });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.delete('/api/invoices/:id', requireDb, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM invoices WHERE id = ?', [id]);
    res.json({ message: 'Invoice deleted from MySQL' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Ledgerly MySQL API server running on port ${PORT}`));
