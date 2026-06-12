const sql = require('mssql');
const config = require('../config/db');

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('[DB] SQL Server 连接池已建立');
  }
  return pool;
}

async function query(sqlStr, params = [], types = []) {
  const p = await getPool();
  const request = p.request();
  params.forEach((val, i) => {
    if (types[i]) {
      request.input(`p${i}`, types[i], val);
    } else {
      request.input(`p${i}`, val);
    }
  });
  return request.query(sqlStr);
}

async function execute(procName, params = {}) {
  const p = await getPool();
  const request = p.request();
  Object.entries(params).forEach(([key, val]) => {
    request.input(key, val);
  });
  return request.execute(procName);
}

module.exports = { getPool, query, execute, sql };
