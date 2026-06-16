/**
 * AES-256-CBC 可逆加密工具
 * 用于加密/解密 tat_db_sources 表中的外部数据库密码
 * 密文格式: hexIv:hexCiphertext
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'iso15189-monitor-config-secret-2026';

function getKey() {
  return crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();
}

/**
 * 加密密码
 * @param {string} plaintext - 明文密码
 * @returns {string} 格式: hexIv:hexCiphertext
 */
function encryptPassword(plaintext) {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 解密密码
 * @param {string} ciphertext - 格式: hexIv:hexCiphertext
 * @returns {string} 明文密码
 */
function decryptPassword(ciphertext) {
  if (!ciphertext) return '';
  const parts = ciphertext.split(':');
  if (parts.length !== 2) {
    throw new Error('无效的密文格式');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encryptPassword, decryptPassword };
