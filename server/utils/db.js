const sql = require('mssql');
const config = require('../config/db');

let pool = null;

async function getPool() {
  // 检查连接池是否存在且有效：mssql ConnectionPool 有 connected 属性
  if (pool && pool.connected) {
    return pool;
  }

  // 连接已断开或从未建立 → 重新连接
  if (pool) {
    console.log('[DB] 连接池已断开，正在重新连接...');
    pool = null;
  }

  pool = await sql.connect(config);
  console.log('[DB] SQL Server 连接池已建立');

  // 监听连接池错误，防止未捕获的异常导致进程崩溃
  pool.on('error', (err) => {
    console.error('[DB] 连接池错误:', err.message);
    pool = null;
  });

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
