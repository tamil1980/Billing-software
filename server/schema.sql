CREATE DATABASE IF NOT EXISTS ledgerly;
USE ledgerly;

-- Users table for login details & workspace roles
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Items table for inventory management
CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  sku VARCHAR(60) UNIQUE,
  category VARCHAR(80) DEFAULT 'General',
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers table for vendor details
CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(120),
  phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices table for billing header details
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(150) NOT NULL,
  supplier_name VARCHAR(150),
  supplier_address TEXT,
  supplier_phone VARCHAR(50),
  invoice_date DATE NOT NULL,
  gst_rate DECIMAL(5,2) DEFAULT 18.00,
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('Paid', 'Pending', 'Overdue') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoice items table for line item details
CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- Seed default user accounts
INSERT IGNORE INTO users (name, email, password, role) VALUES
('Admin User', 'admin@ledgerly.in', 'admin123', 'admin'),
('Billing User', 'user@ledgerly.in', 'user123', 'user');

-- Seed starter items
INSERT IGNORE INTO items (id, name, sku, category, price, stock) VALUES
(1, 'Wireless Headphones', 'WH-2401', 'Electronics', 2499.00, 24),
(2, 'USB-C Cable', 'UC-1102', 'Accessories', 499.00, 67),
(3, 'Desk Lamp', 'DL-3320', 'Office', 1699.00, 14);

-- Seed starter suppliers
INSERT IGNORE INTO suppliers (id, name, email, phone, address) VALUES
(1, 'Apex Electronics Co.', 'sales@apexelectronics.in', '+91 98765 43210', '12 Industrial Estate, Bengaluru, KA'),
(2, 'Nexus Accessories', 'info@nexusacc.com', '+91 98123 45678', '45 Logistics Park, Mumbai, MH');
