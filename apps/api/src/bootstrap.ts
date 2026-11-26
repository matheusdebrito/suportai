import './env.js';
import argon2 from 'argon2';
import {transaction,pool} from './db.js';
import {validEmail} from './auth.js';
const ifEmpty=process.argv.includes('--if-empty');
try{
 const created=await transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(73016,2)');
   const count=await c.query('SELECT count(*)::int AS total FROM users WHERE role=$1',['ADMIN']);
   if(count.rows[0].total>0){
     if(ifEmpty)return false;
     throw new Error('Admin already exists; refusing bootstrap');
   }
   const email=process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
   const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
   if(!validEmail(email)||!password||password.length<12||password.length>256)
     throw new Error('Set valid BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12-256 chars)');
   await c.query('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3)',[email,await argon2.hash(password),'ADMIN']);
   return true;
 });
 console.log(created?'Admin created. Remove BOOTSTRAP_ADMIN_PASSWORD from your environment':'Admin already exists; bootstrap skipped without changes');
}finally{await pool.end();}
