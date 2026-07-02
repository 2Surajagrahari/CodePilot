// backend/routes/repo.js
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const router = express.Router();

// Ensure uploads folder exists
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for ZIP storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
    storage, 
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
            cb(null, true);
        } else {
            cb(new Error('Only ZIP files are allowed'), false);
        }
    }
});

const SUPPORTED_EXTENSIONS = {
    '.py': 'python',
    '.js': 'javascript',
    '.ts': 'javascript',
    '.tsx': 'javascript',
    '.jsx': 'javascript',
    '.java': 'java',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.c': 'cpp',
    '.h': 'cpp'
};

const IGNORED_DIRS = [
    '.git', 'node_modules', '.venv', 'venv', 'env', '__pycache__', 
    '.next', 'out', 'build', 'dist', '.gemini', 'uploads'
];

// Helper to extract and ingest a ZIP file from local path
async function ingestZipArchive(zipPath, repositoryId) {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    const filesToIngest = [];

    for (const entry of zipEntries) {
        if (entry.isDirectory) continue;

        const entryName = entry.entryName;
        const pathSegments = entryName.split('/');
        
        // Skip ignored directories, MacOS metadata, and DS_Store files
        const isIgnored = pathSegments.some(segment => IGNORED_DIRS.includes(segment));
        if (isIgnored || entryName.includes('__MACOSX') || entryName.endsWith('.DS_Store')) {
            continue;
        }

        const ext = path.extname(entryName).lowerCase || path.extname(entryName).toLowerCase();
        if (ext in SUPPORTED_EXTENSIONS) {
            const content = entry.getData().toString('utf8');
            if (content.trim()) {
                // Remove root folder prefix from github zipball paths if present
                // (GitHub zipballs prefix all files with a dynamic folder name: owner-repo-commit/)
                const relativePath = pathSegments.slice(1).join('/');
                
                filesToIngest.append || filesToIngest.push({
                    file_path: relativePath || entryName,
                    content: content,
                    language: SUPPORTED_EXTENSIONS[ext]
                });
            }
        }
    }

    if (filesToIngest.length === 0) {
        throw new Error('No supported programming files found in the ZIP archive.');
    }

    // Call FastAPI ingestion microservice
    const aiServiceUrl = process.env.AI_SERVICE_URL 
        ? process.env.AI_SERVICE_URL.replace('/api/search', '/api/ingest') 
        : 'http://localhost:8001/api/ingest';

    const response = await axios.post(aiServiceUrl, {
        repository_id: repositoryId,
        files: filesToIngest
    });

    return {
        message: response.data.message,
        fileCount: filesToIngest.length
    };
}

// 1. ZIP File Upload Endpoint
router.post('/upload/zip', upload.single('repository'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No valid ZIP file uploaded' });

    const repositoryId = req.body.repositoryId || 'default';
    const tempFilePath = req.file.path;

    try {
        const result = await ingestZipArchive(tempFilePath, repositoryId);
        res.json({
            message: 'ZIP repository indexed successfully!',
            details: result.message,
            files_indexed: result.fileCount
        });
    } catch (error) {
        console.error('[ZIP Ingestion Error]:', error.message);
        res.status(500).json({ error: `ZIP Ingestion failed: ${error.message}` });
    } finally {
        // Clean up the uploaded ZIP from server memory
        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        } catch (unlinkErr) {
            console.error('Failed to clean up temp file:', unlinkErr.message);
        }
    }
});

// 2. GitHub Integration Endpoint
router.post('/upload/github', async (req, res) => {
    const { repoUrl, githubToken, repositoryId = 'default' } = req.body;

    if (!repoUrl) return res.status(400).json({ error: 'GitHub repository URL required' });

    let tempZipPath = '';
    try {
        // Parse owner and repo name from github URL
        // Format: https://github.com/owner/repo
        const cleanUrl = repoUrl.replace(/\/$/, ""); // Strip trailing slash
        const urlParts = cleanUrl.split('/');
        const owner = urlParts[urlParts.length - 2];
        const repo = urlParts[urlParts.length - 1];

        if (!owner || !repo) {
            return res.status(400).json({ error: 'Invalid GitHub repository URL format' });
        }

        console.log(`Downloading zipball from GitHub for: ${owner}/${repo}`);

        // Fetch zipball stream from GitHub API
        const zipballUrl = `https://api.github.com/repos/${owner}/${repo}/zipball`;
        const headers = {
            'User-Agent': 'CodePilot-AI-App'
        };
        if (githubToken) {
            headers['Authorization'] = `token ${githubToken}`;
        }

        const response = await axios.get(zipballUrl, {
            responseType: 'arraybuffer',
            headers: headers
        });

        // Write the zip archive buffer temporarily to disk
        tempZipPath = path.join(UPLOADS_DIR, `${Date.now()}-${owner}-${repo}.zip`);
        fs.writeFileSync(tempZipPath, response.data);

        // Ingest zip files to vector DB
        const result = await ingestZipArchive(tempZipPath, repositoryId);

        res.json({
            message: 'GitHub repository cloned and indexed successfully!',
            details: result.message,
            files_indexed: result.fileCount
        });

    } catch (error) {
        console.error('[GitHub Ingestion Error]:', error.message);
        res.status(500).json({ error: `GitHub Ingestion failed: ${error.message}` });
    } finally {
        // Clean up temporary zip
        try {
            if (tempZipPath && fs.existsSync(tempZipPath)) {
                fs.unlinkSync(tempZipPath);
            }
        } catch (unlinkErr) {
            console.error('Failed to clean up temp zip:', unlinkErr.message);
        }
    }
});

module.exports = router;