// backend/server.js
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const repoRoutes = require('./routes/repo');
const chatRoutes = require('./routes/chat');

const app = express();
app.use(express.json());
app.use(cors());

// Route wiring
app.use('/api/auth', authRoutes);
app.use('/api/repo', repoRoutes);
app.use('/api/chat', chatRoutes);

const PORT = process.env.PORT || 5050;
const USE_HTTPS = process.env.USE_HTTPS === 'true';

if (USE_HTTPS) {
    const options = {
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.cert')
    };
    https.createServer(options, app).listen(PORT, () => {
        console.log(`Secure traffic controller running on https://localhost:${PORT}`);
    });
} else {
    http.createServer(app).listen(PORT, () => {
        console.log(`Traffic controller running on http://localhost:${PORT}`);
    });
}