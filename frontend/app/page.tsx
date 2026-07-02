'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ChatMessage } from '@/components/ChatMessage';
import { 
  Sparkles, Send, Database, Cpu, Link, Upload, FileCode,
  Terminal, RefreshCw, Layers, CheckCircle2, AlertTriangle, Play, AlertCircle
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  citations?: any[];
  agentType?: string;
}

interface SystemStats {
  redis: string;
  ai_service: string;
  qdrant_chunks: number;
  in_memory_history_size: number;
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Real Ingestion States
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  
  const [githubUrl, setGithubUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [stats, setStats] = useState<SystemStats>({
    redis: 'checking',
    ai_service: 'checking',
    qdrant_chunks: 0,
    in_memory_history_size: 0
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversation history and stats on mount
  useEffect(() => {
    fetchHistory();
    fetchStats();
    
    // Poll stats every 4 seconds to show live updates
    const interval = setInterval(fetchStats, 4000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom of chat when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const fetchHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5050/api/chat/history');
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to load history', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('http://localhost:5050/api/chat/stats');
      setStats(response.data);
    } catch (error) {
      setStats({
        redis: 'offline',
        ai_service: 'offline',
        qdrant_chunks: 0,
        in_memory_history_size: 0
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, newUserMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:5050/api/chat', { query: newUserMsg.content });

      const newAgentMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: response.data.answer,
        citations: response.data.citations,
        agentType: response.data.agent_type,
      };

      setMessages((prev) => [...prev, newAgentMsg]);
    } catch (error) {
      console.error('Error fetching AI response', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '⚠️ Failed to connect to the backend server. Make sure `node server.js` is running on http://localhost:5050.',
          agentType: 'Error'
        }
      ]);
    } finally {
      setIsLoading(false);
      fetchStats();
    }
  };

  // 1. Real ZIP Upload Handler
  const handleZipIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsIngesting(true);
    setIngestStatus('Uploading and extracting ZIP archive...');

    const formData = new FormData();
    formData.append('repository', selectedFile);
    formData.append('repositoryId', 'default');

    try {
      const response = await axios.post('http://localhost:5050/api/repo/upload/zip', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setIngestStatus('ZIP Ingestion complete!');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          content: `Uploaded ZIP file: ${selectedFile.name}`
        },
        {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `🎉 **ZIP Upload Successful!**\n- ${response.data.message}\n- **Indexed Files:** ${response.data.files_indexed}\n- **AI Status:** ${response.data.details}\n\nYou can now ask me questions about the code inside this ZIP repository.`,
          agentType: 'System'
        }
      ]);
    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message;
      setIngestStatus('ZIP Ingestion failed.');
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `❌ **ZIP Ingestion Failed**\n${errMsg}`,
          agentType: 'Error'
        }
      ]);
    } finally {
      setTimeout(() => {
        setIngestStatus(null);
        setIsIngesting(false);
      }, 3500);
      fetchStats();
    }
  };

  // 2. Real GitHub URL Ingest Handler
  const handleGithubIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) return;

    setIsIngesting(true);
    setIngestStatus('Connecting to GitHub & downloading repository...');

    try {
      const response = await axios.post('http://localhost:5050/api/repo/upload/github', {
        repoUrl: githubUrl,
        githubToken: githubToken || undefined,
        repositoryId: 'default'
      });

      setIngestStatus('GitHub Ingestion complete!');
      const targetUrl = githubUrl;
      setGithubUrl('');
      setGithubToken('');

      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          content: `Connected GitHub repository: ${targetUrl}`
        },
        {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `🎉 **GitHub Integration Successful!**\n- ${response.data.message}\n- **Indexed Files:** ${response.data.files_indexed}\n- **AI Status:** ${response.data.details}\n\nYou can now ask me questions about this GitHub codebase.`,
          agentType: 'System'
        }
      ]);
    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message;
      setIngestStatus('GitHub Ingestion failed.');
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `❌ **GitHub Ingestion Failed**\n${errMsg}`,
          agentType: 'Error'
        }
      ]);
    } finally {
      setTimeout(() => {
        setIngestStatus(null);
        setIsIngesting(false);
      }, 3500);
      fetchStats();
    }
  };

  // recruiter demo feature: One-click simulated ingestion
  const handleSimulatedIngest = async () => {
    setIsIngesting(true);
    setIngestStatus('Preparing source files...');
    
    // Sample codebase files to index for demo purposes
    const demoFiles = [
      {
        file_path: "src/auth/jwt.js",
        language: "javascript",
        content: `// JSON Web Token authentication middleware
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'super-developer-key';

function generateAccessToken(user) {
    return jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '1h' });
}

function verifyAccessToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = decoded;
        next();
    });
}`
      },
      {
        file_path: "src/database/qdrant.py",
        language: "python",
        content: `# Qdrant client connection and index management
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance

def init_vector_store(host="localhost", port=6333):
    client = QdrantClient(host=host, port=port)
    collection_name = "codepilot_chunks"
    
    # Ensure collection config matches the embeddings dimensionality (384 for all-MiniLM-L6-v2)
    if not client.collection_exists(collection_name):
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE)
        )
    return client`
      },
      {
        file_path: "src/controllers/userController.js",
        language: "javascript",
        content: `// User profile management and endpoints controller
const db = require('../database/models');

async function getUserProfile(req, res) {
    try {
        const user = await db.User.findByPk(req.user.id, {
            attributes: ['id', 'email', 'createdAt']
        });
        if (!user) return res.status(404).json({ error: 'User profile not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Internal database error' });
    }
}`
      }
    ];

    try {
      setIngestStatus('Connecting to AI ingestion service...');
      const response = await axios.post('http://localhost:5050/api/chat/ingest', {
        repository_id: 'default',
        files: demoFiles
      });
      
      setIngestStatus('Ingested successfully!');
      setTimeout(() => {
        setIngestStatus(null);
        setIsIngesting(false);
      }, 3000);
      
      // Seed default greeting chat messages to showcase working citations
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          content: 'Simulated Ingestion Triggered'
        },
        {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '🎉 **Success!** I have ingested 3 sample repository files into the Qdrant Vector database:\n- `src/auth/jwt.js` (JavaScript)\n- `src/database/qdrant.py` (Python)\n- `src/controllers/userController.js` (JavaScript)\n\nTry asking me: **"Explain how JWT tokens are verified"** or **"How is Qdrant initialized?"** to check hybrid search and code citations!',
          agentType: 'System'
        }
      ]);
    } catch (error: any) {
      setIngestStatus('Error running ingestion.');
      console.error(error);
      setTimeout(() => {
        setIngestStatus(null);
        setIsIngesting(false);
      }, 3000);
    } finally {
      fetchStats();
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#09090b] text-[#f4f4f5] overflow-hidden bg-grid">
      
      {/* 1. Left Side Control Panel */}
      <aside className="w-80 border-r border-zinc-800 bg-[#0d0e12]/80 backdrop-blur-md flex flex-col justify-between select-none z-10 overflow-y-auto">
        
        <div className="p-5 space-y-5">
          {/* Logo Branding */}
          <div className="flex items-center gap-2">
            <div className="bg-purple-600 p-2 rounded-lg text-white glow-panel">
              <Terminal size={18} />
            </div>
            <div>
              <h1 className="text-md font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                CodePilot AI
              </h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                Developer Agent Console
              </p>
            </div>
          </div>

          {/* Active Connection States Widget */}
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center justify-between">
              System Console
              <RefreshCw 
                size={11} 
                className="text-zinc-600 hover:text-zinc-400 cursor-pointer transition-colors" 
                onClick={() => { fetchStats(); fetchHistory(); }}
              />
            </h2>
            <div className="space-y-2.5">
              
              {/* Node Backend Status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Cpu size={12} className="text-zinc-500" /> Express Backend
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Online (5050)
                </span>
              </div>

              {/* Redis status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Database size={12} className="text-zinc-500" /> Redis Cache
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-300">
                  <span className={`w-1.5 h-1.5 rounded-full ${stats.redis === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                  {stats.redis === 'connected' ? 'Connected' : 'Offline'}
                </span>
              </div>

              {/* FastAPI status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-zinc-500" /> Python AI Service
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-300">
                  <span className={`w-1.5 h-1.5 rounded-full ${stats.ai_service === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                  {stats.ai_service === 'online' ? 'Online (8001)' : 'Offline'}
                </span>
              </div>

              {/* Indexed Vectors */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-800/80">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Layers size={12} className="text-zinc-500" /> Qdrant Vectors
                </span>
                <span className="font-mono font-bold text-purple-400 text-xs">
                  {stats.qdrant_chunks} chunks
                </span>
              </div>
            </div>
          </div>

          {/* GitHub Integration Widget */}
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Link size={12} className="text-purple-400" /> GitHub Repository
            </h2>
            <form onSubmit={handleGithubIngest} className="space-y-2.5">
              <div>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  disabled={isIngesting}
                  className="w-full bg-[#0a0b0d] border border-zinc-800 text-[11px] rounded-lg px-2.5 py-2 placeholder-zinc-700 text-zinc-300 focus:outline-none focus:border-purple-600 transition-colors"
                />
              </div>
              <div>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="OAuth/Personal Token (optional)"
                  disabled={isIngesting}
                  className="w-full bg-[#0a0b0d] border border-zinc-800 text-[11px] rounded-lg px-2.5 py-2 placeholder-zinc-700 text-zinc-300 focus:outline-none focus:border-purple-600 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isIngesting || !githubUrl.trim() || stats.ai_service === 'offline'}
                className="w-full bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all py-1.5 rounded-lg font-semibold text-[10px] text-zinc-200 border border-zinc-700 flex items-center justify-center gap-1"
              >
                <Link size={10} /> Link & Index Repository
              </button>
            </form>
          </div>

          {/* ZIP File Ingest Widget */}
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Upload size={12} className="text-purple-400" /> ZIP Source Archive
            </h2>
            <form onSubmit={handleZipIngest} className="space-y-3">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#0a0b0d] hover:bg-[#12131a] active:scale-[0.99] border-dashed border-2 border-zinc-800 hover:border-purple-900/50 rounded-lg p-4 cursor-pointer text-center transition-all"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  accept=".zip"
                  className="hidden"
                />
                <FileCode size={18} className="mx-auto text-zinc-600 mb-1.5" />
                <span className="text-[10px] text-zinc-400 font-semibold block truncate">
                  {selectedFile ? selectedFile.name : 'Select repository .zip'}
                </span>
                <span className="text-[9px] text-zinc-600 block mt-0.5">
                  Max size: 50MB
                </span>
              </div>
              {selectedFile && (
                <button
                  type="submit"
                  disabled={isIngesting || stats.ai_service === 'offline'}
                  className="w-full bg-purple-600/80 hover:bg-purple-600 active:scale-[0.98] transition-all py-1.5 rounded-lg font-semibold text-[10px] text-white border border-purple-500/20 flex items-center justify-center gap-1"
                >
                  <Upload size={10} /> Upload & Extract
                </button>
              )}
            </form>
          </div>

          {/* Recruiter Simulated Ingest Button */}
          <div className="pt-2">
            <button
              onClick={handleSimulatedIngest}
              disabled={isIngesting || stats.ai_service === 'offline'}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl py-3 px-4 font-semibold text-xs tracking-wide shadow-lg hover:from-purple-500 hover:to-indigo-500 hover:shadow-purple-500/10 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
            >
              {isIngesting ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Play size={12} className="fill-current" />
              )}
              {isIngesting ? 'Ingesting Sample...' : 'Demo Index Codebase'}
            </button>
            {ingestStatus && (
              <p className="text-[10px] text-center text-purple-400 mt-2 font-mono animate-pulse">
                {ingestStatus}
              </p>
            )}
          </div>
        </div>

      </aside>

      {/* 2. Main Chat Panel */}
      <main className="flex-1 flex flex-col justify-between h-full bg-[#09090b]/40 backdrop-blur-sm z-0">
        
        {/* Chat Feed Header */}
        <header className="border-b border-zinc-800/80 h-16 px-6 flex items-center justify-between bg-[#0d0e12]/30 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500 glow-panel"></span>
            <span className="text-xs font-bold text-zinc-300 font-mono">Agent Conversation Channel</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-full">
            <Sparkles size={11} className="text-purple-400" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Enterprise RAG</span>
          </div>
        </header>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto p-4 select-none animate-fade-in">
              <div className="bg-purple-950/20 border border-purple-900/30 p-4 rounded-2xl text-purple-400 mb-4 glow-panel animate-bounce">
                <Sparkles size={36} />
              </div>
              <h3 className="text-md font-bold text-zinc-200 mb-1">
                Explore Your Codebase Contextually
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed mb-6">
                Connect your GitHub repository or upload a ZIP file in the sidebar to scan, index, and verify queries with citations.
              </p>
              <div className="grid grid-cols-2 gap-3 w-full">
                <div 
                  onClick={() => setInput("Explain the authentication flow in this codebase")}
                  className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3.5 text-left text-xs text-zinc-400 hover:border-purple-900/50 hover:bg-purple-950/10 cursor-pointer transition-all duration-300"
                >
                  <span className="font-bold text-purple-400 block mb-1">Architecture</span>
                  "Explain the authentication flow in this codebase"
                </div>
                <div 
                  onClick={() => setInput("How is the vector store connection initialized?")}
                  className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3.5 text-left text-xs text-zinc-400 hover:border-purple-900/50 hover:bg-purple-950/10 cursor-pointer transition-all duration-300"
                >
                  <span className="font-bold text-purple-400 block mb-1">Diagnostics</span>
                  "How is the vector store connection initialized?"
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessage key={msg.id} {...msg} />
            ))
          )}
          {isLoading && (
            <div className="flex items-center gap-2 p-5 bg-zinc-900/20 border border-zinc-800/30 rounded-xl mr-12 text-xs text-zinc-500 font-mono">
              <RefreshCw size={12} className="animate-spin text-purple-400" />
              <span>AI Search agent is navigating the codebase index...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Text Form */}
        <form onSubmit={handleSendMessage} className="p-6 border-t border-zinc-800/80 bg-[#0d0e12]/30 backdrop-blur-md flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your repository or upload code..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm text-zinc-300 focus:outline-none focus:border-purple-600 placeholder-zinc-600 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-purple-600 text-white rounded-xl px-5 hover:bg-purple-500 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center justify-center gap-1.5 font-bold text-xs tracking-wider uppercase active:scale-95"
          >
            <Send size={12} />
            Ask
          </button>
        </form>

      </main>

    </div>
  );
}