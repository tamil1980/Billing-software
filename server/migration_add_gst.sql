-- Run this once only if you already created the `ledgerly` database earlier.
USE ledgerly;
ALTER TABLE invoices ADD COLUMN supplier_name VARCHAR(150) NULL AFTER customer_name;
ALTER TABLE invoices ADD COLUMN gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER invoice_date;
ALTER TABLE invoices ADD COLUMN supplier_address TEXT NULL AFTER supplier_name;
ALTER TABLE invoices ADD COLUMN supplier_phone VARCHAR(50) NULL AFTER supplier_address;
