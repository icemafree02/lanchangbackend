const mysql = require('mysql2');
require('dotenv').config();

const urlDB = `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const connection = mysql.createPool(urlDB).promise();

console.log('db: Database pool created successfully ');

module.exports = connection;