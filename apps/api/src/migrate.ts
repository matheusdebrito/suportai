import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
const path = fileURLToPath(new URL('../sql/001_init.sql',import.meta.url));
const sql = await readFile(path,'utf8');
await pool.query(sql);
await pool.end();
console.log('Schema initialized');
