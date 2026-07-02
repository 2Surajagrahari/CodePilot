// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// Mock DB for demonstration
const usersDB = [];

router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Hash the password securely
        const hashedPassword = await bcrypt.hash(password, 10);
        usersDB.push({ email, password: hashedPassword });
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = usersDB.find(u => u.email === email);

    if (user && await bcrypt.compare(password, user.password)) {
        // Generate JWT
        const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

module.exports = router;