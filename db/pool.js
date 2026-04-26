const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'collegewtf',
  password: 'Familjaime1!',
  port: 5432,
});

module.exports = pool;