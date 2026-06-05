import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Client } from '@stomp/stompjs';
// @ts-ignore
import SockJS from 'sockjs-client';

const API_BASE = '/api/extraction';
const WS_URL = '/ws-extraction';

export default function App() {
    const [inputPath, setInputPath] = useState('');
    const [outputPath, setOutputPath] = useState('');
    const [takeoutDate, setTakeoutDate] = useState('');
    const [postAction, setPostAction] = useState('KEEP_AWAKE_ONLY');
    const [isBusy, setIsBusy] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [logs, setLogs] = useState<{level: string, message: string}[]>([]);

    const stompClient = useRef<Client | null>(null);

    const handleBrowse = async (setter: React.Dispatch<React.SetStateAction<string>>) => {
        try {
            const res = await axios.get('/api/system/browse-folder');
            if (res.data && res.data.path) {
                setter(res.data.path);
            }
        } catch (e) {
            console.error("Failed to browse folder", e);
        }
    };

    useEffect(() => {
        try {
            const socket = new SockJS(WS_URL);
            const client = new Client({
                webSocketFactory: () => socket,
                onConnect: () => {
                    client.subscribe('/topic/logs', (msg) => {
                        try {
                            const log = JSON.parse(msg.body);
                            setLogs(prev => [...prev, log]);
                        } catch (e) {
                            console.error("Failed to parse log message:", e);
                        }
                    });
                    client.subscribe('/topic/progress', (msg) => {
                        try {
                            setProgress(JSON.parse(msg.body));
                        } catch (e) {
                            console.error("Failed to parse progress message:", e);
                        }
                    });
                }
            });
            stompClient.current = client;
            client.activate();
        } catch (err) {
            console.error("WebSocket connection failed:", err);
            setLogs(prev => [...prev, { level: 'ERROR', message: 'Could not connect to backend WebSocket. Is the server running?' }]);
        }
        return () => {
            if (stompClient.current) {
                stompClient.current.deactivate();
            }
        };
    }, []);

    const handleStart = async () => {
        setIsBusy(true);
        setLogs([]);
        try {
            await axios.post(`${API_BASE}/start`, {
                inputPath, outputPath, postAction, takeoutDate
            });
        } catch (e: any) {
            const errorMsg = e.response?.data?.message || e.response?.data?.error || e.message || 'Unknown error';
            alert(`Failed to start extraction: ${errorMsg}`);
            setIsBusy(false);
        }
    };

    const handlePause = async () => {
        const res = await axios.post(`${API_BASE}/pause`);
        setIsPaused(res.data.paused);
    };

    const handleCancel = async () => {
        await axios.post(`${API_BASE}/cancel`);
        setIsBusy(false);
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
            <div className="max-w-4xl mx-auto space-y-6">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-light tracking-tight text-slate-800">
                        Google Takeout <span className="font-semibold">Metadata Restorer</span>
                    </h1>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Input Folder</label>
                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        value={inputPath} onChange={e => setInputPath(e.target.value)}
                                        placeholder="/path/to/takeout"
                                        disabled={isBusy}
                                    />
                                    <button 
                                        onClick={() => handleBrowse(setInputPath)} 
                                        disabled={isBusy}
                                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
                                    >
                                        Browse
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Output Folder</label>
                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        value={outputPath} onChange={e => setOutputPath(e.target.value)}
                                        placeholder="/path/to/output"
                                        disabled={isBusy}
                                    />
                                    <button 
                                        onClick={() => handleBrowse(setOutputPath)} 
                                        disabled={isBusy}
                                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
                                    >
                                        Browse
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Takeout Date</label>
                                <input
                                    type="datetime-local"
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={takeoutDate} onChange={e => setTakeoutDate(e.target.value)}
                                    disabled={isBusy}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Post-Action</label>
                        <select
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                            value={postAction} onChange={e => setPostAction(e.target.value)}
                            disabled={isBusy}
                        >
                            <option value="KEEP_AWAKE_ONLY">Keep Awake Only</option>
                            <option value="KEEP_AWAKE_THEN_SHUTDOWN">Shutdown After</option>
                        </select>

                        <div className="pt-4 space-y-2">
                            {!isBusy ? (
                                <button
                                    onClick={handleStart}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-md"
                                >
                                    Start Process
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        onClick={handlePause}
                                        className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                                    >
                                        {isPaused ? 'Resume' : 'Pause'}
                                    </button>
                                    <button
                                        onClick={handleCancel}
                                        className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-500">Processing Progress</span>
                        <span className="text-sm font-bold text-blue-600">
                            {progress.current} / {progress.total} ({Math.round((progress.current/progress.total || 0)*100)}%)
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300 ease-out"
                            style={{ width: `${(progress.current/progress.total || 0)*100}%` }}
                        />
                    </div>
                </div>

                <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden flex flex-col h-96">
                    <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Live System Logs</span>
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/20" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                            <div className="w-3 h-3 rounded-full bg-green-500/20" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 font-mono text-sm scroll-smooth">
                        {logs.length === 0 && <div className="text-slate-600 italic">Waiting for process to start...</div>}
                        {logs.map((log, i) => (
                            <div key={i} className="mb-1 flex gap-3">
                                <span className={`font-bold ${
                                    log.level === 'ERROR' ? 'text-red-400' :
                                    log.level === 'WARN' ? 'text-red-400' : 'text-blue-400'
                                }`}>
                                    [{log.level}]
                                </span>
                                <span className={
                                    (log.level === 'ERROR' || log.level === 'WARN') ? 'text-red-400' : 'text-slate-300'
                                }>{log.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
