import React, { useState } from 'react';
import { FileText, Terminal, User, Sparkles, Copy, Check } from 'lucide-react';

interface Citation {
    id: string;
    file_path: string;
}

interface MessageProps {
    role: 'user' | 'agent';
    content: string;
    citations?: Citation[];
    agentType?: string;
}

export const ChatMessage: React.FC<MessageProps> = ({ role, content, citations, agentType }) => {
    const isUser = role === 'user';
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Custom parser to format ```code block snippets``` beautifully without markdown libraries
    const formatMessageText = (text: string) => {
        if (!text.includes('```')) {
            return <p className="leading-relaxed whitespace-pre-wrap">{text}</p>;
        }

        const parts = text.split('```');
        return parts.map((part, index) => {
            if (index % 2 === 1) {
                // Inside a code block
                const lines = part.split('\n');
                let language = 'code';
                let code = part;
                if (lines.length > 0 && lines[0].trim() && !lines[0].includes(' ') && lines[0].length < 15) {
                    language = lines[0].trim();
                    code = lines.slice(1).join('\n');
                }
                if (code.endsWith('\n')) {
                    code = code.slice(0, -1);
                }

                return (
                    <div key={index} className="my-3 overflow-hidden rounded-lg border border-zinc-800 bg-[#0b0c10] text-left font-mono text-[11px] leading-relaxed glow-panel">
                        <div className="flex items-center justify-between border-b border-zinc-800 bg-[#12131a] px-4 py-1.5 text-zinc-400">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400">{language}</span>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(code);
                                }}
                                className="hover:text-white transition-colors text-[10px] flex items-center gap-1 font-sans"
                            >
                                <Copy size={10} />
                                Copy Code
                            </button>
                        </div>
                        <pre className="overflow-x-auto p-4 text-zinc-300"><code>{code}</code></pre>
                    </div>
                );
            } else {
                return <p key={index} className="leading-relaxed whitespace-pre-wrap my-1">{part}</p>;
            }
        });
    };

    return (
        <div className={`flex gap-4 p-5 rounded-xl mb-4 border transition-all duration-300 ${
            isUser 
                ? 'bg-zinc-900/40 border-zinc-800/60 ml-12' 
                : 'bg-gradient-to-br from-purple-950/20 to-zinc-900/40 border-purple-900/20 mr-12'
        }`}>
            {/* Avatar Circle */}
            <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 border ${
                isUser 
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300' 
                    : 'bg-purple-900/30 border-purple-800/50 text-purple-400'
            }`}>
                {isUser ? <User size={16} /> : <Sparkles size={16} />}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${
                        isUser ? 'text-zinc-400' : 'text-purple-400'
                    }`}>
                        {isUser ? 'Developer' : `${agentType || 'AI'} Agent`}
                    </span>
                    <button
                        onClick={handleCopy}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Copy entire message"
                    >
                        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                </div>
                
                <div className={`text-[14px] leading-relaxed ${
                    isUser ? 'text-zinc-300' : 'text-zinc-200'
                }`}>
                    {formatMessageText(content)}
                </div>

                {/* Render Citations if present */}
                {citations && citations.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-zinc-800/80">
                        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2 block">
                            Indexed Source References:
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {citations.map((cite) => (
                                <span 
                                    key={cite.id} 
                                    className="inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 px-2.5 py-1 rounded-md font-mono hover:border-purple-900/50 hover:text-zinc-300 transition-colors"
                                >
                                    <FileText size={11} className="text-zinc-500" />
                                    {cite.file_path}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};