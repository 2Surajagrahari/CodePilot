// backend/routes/chat.js
const express = require('express');
const axios = require('axios');
const { createClient } = require('redis');
const router = express.Router();

// 1. Initialize Redis Client with fallback to in-memory store
let redisConnected = false;
let localChatHistory = [];

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
    console.warn('[Redis] Connection error, using in-memory store:', err.message);
    redisConnected = false;
});

redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
    redisConnected = true;
});

redisClient.connect().catch((err) => {
    console.warn('[Redis] Connection failed on startup, using in-memory store:', err.message);
    redisConnected = false;
});

// Helper to get history
async function getHistory() {
    if (redisConnected) {
        try {
            const data = await redisClient.get('chat_history');
            return data ? JSON.parse(data) : [];
        } catch (err) {
            console.error('[Redis] Failed to fetch history, falling back to local:', err.message);
        }
    }
    return localChatHistory;
}

// Helper to save history
async function saveHistory(history) {
    if (redisConnected) {
        try {
            await redisClient.set('chat_history', JSON.stringify(history));
            return;
        } catch (err) {
            console.error('[Redis] Failed to save history, falling back to local:', err.message);
        }
    }
    localChatHistory = history;
}

// 2. GET Chat History Endpoint
router.get('/history', async (req, res) => {
    try {
        const history = await getHistory();
        res.json(history);
    } catch (error) {
        console.error('Failed to get chat history:', error);
        res.status(500).json({ error: 'Failed to retrieve chat history' });
    }
});

// 3. POST Chat Message / Search Endpoint
router.post('/', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: query
    };

    let answer = '';
    let citations = [];
    let agent_type = 'Search';

    try {
        // Query the Python AI microservice for hybrid search results
        const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001/api/search';
        const response = await axios.post(aiServiceUrl, {
            query: query,
            repository_id: 'default'
        });

        const results = response.data.results || [];
        citations = results.map(r => ({
            id: r.id || Math.random().toString(),
            file_path: r.file_path || 'unknown_file'
        }));

        if (results.length > 0) {
            answer = `Here is the relevant code found in the repository:\n\n` + 
                results.map(r => `### ${r.file_path}\n\`\`\`\n${r.code_snippet}\n\`\`\``).join('\n\n');
        } else {
            answer = `I searched the codebase but couldn't find any direct matches for your query.`;
        }
    } catch (error) {
        console.warn('[AI Service] Microservice unreachable or failed. Falling back to mock response:', error.message);
        agent_type = 'Mock';
        citations = [
            { id: 'mock-1', file_path: 'backend/server.js' },
            { id: 'mock-2', file_path: 'frontend/app/page.tsx' }
        ];
        answer = `I could not communicate with the Python AI microservice. Here is a simulated answer for your query: "${query}"\n\nTypically, this query would retrieve relevant code files, split them into structural AST blocks, and output specific file citations.`;
    }

    const agentMsg = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: answer,
        citations: citations,
        agentType: agent_type
    };

    // Save exchange to history
    try {
        const history = await getHistory();
        history.push(userMsg, agentMsg);
        await saveHistory(history);
    } catch (err) {
        console.error('Failed to update chat history:', err);
    }
    res.json({
        answer,
        citations,
        agent_type
    });
});

// 4. GET System Stats Endpoint
router.get('/stats', async (req, res) => {
    let qdrantChunks = 0;
    let aiServiceStatus = 'offline';
    
    try {
        const statsUrl = process.env.AI_SERVICE_URL ? process.env.AI_SERVICE_URL.replace('/api/search', '/api/stats') : 'http://localhost:8001/api/stats';
        const response = await axios.get(statsUrl);
        qdrantChunks = response.data.total_chunks || 0;
        aiServiceStatus = 'online';
    } catch (err) {
        console.warn('[Stats] Failed to retrieve stats from AI service:', err.message);
    }
    
    res.json({
        redis: redisConnected ? 'connected' : 'offline',
        ai_service: aiServiceStatus,
        qdrant_chunks: qdrantChunks,
        in_memory_history_size: localChatHistory.length
    });
});

// 5. POST Ingest Endpoint (Proxy to FastAPI)
router.post('/ingest', async (req, res) => {
    try {
        const ingestUrl = process.env.AI_SERVICE_URL 
            ? process.env.AI_SERVICE_URL.replace('/api/search', '/api/ingest') 
            : 'http://localhost:8001/api/ingest';
            
        const response = await axios.post(ingestUrl, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('[Ingest Proxy] Failed to proxy ingestion to AI service:', error.message);
        res.status(500).json({ error: 'Ingestion service failed' });
    }
});

module.exports = router;
