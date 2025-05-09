require('dotenv').config();
const mysql = require('mysql2');

const urlDB = `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const connection = mysql.createConnection(urlDB);

console.log('db: Successfully connected to the database','Host:',process.env.DB_HOST);  

module.exports = connection;
