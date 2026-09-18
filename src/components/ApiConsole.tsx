import React, { useState, useEffect } from 'react';
import type { ApiLog } from '../types';
import { subscribeToApiLogs, BssApiClient } from '../api/bssApi';
import {
  Terminal,
  X,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';

interface ApiConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiConsole: React.FC<ApiConsoleProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToApiLogs((newLog) => {
      setLogs((prev) => [newLog, ...prev].slice(0, 50));
      setSelectedLogId(newLog.id);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (!isOpen) return null;

  const selectedLog = logs.find((l) => l.id === selectedLogId) || logs[0];

  const generateCurl = (log: ApiLog) => {
    const token = BssApiClient.getToken();
    let curl = `curl --location --request ${log.method} '${log.url}'`;
    curl += ` \\\n  --header 'Content-Type: application/json'`;
    if (token) {
      curl += ` \\\n  --header 'Authorization: Bearer ${token}'`;
    }
    if (log.requestBody) {
      curl += ` \\\n  --data-raw '${JSON.stringify(log.requestBody, null, 2)}'`;
    }
    return curl;
  };

  const handleCopyCurl = (log: ApiLog) => {
    navigator.clipboard.writeText(generateCurl(log));
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950 border-t border-slate-800 shadow-2xl h-80 flex flex-col text-white transition-all">
      {/* Console Header */}
      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <span className="font-bold text-slate-200">Live API Inspector & cURL Generator</span>
          <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-[10px]">
            {logs.length} calls
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-slate-400 hover:text-slate-200 p-1 rounded flex items-center space-x-1"
              title="Clear logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Console Body: 2 columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Log list */}
        <div className="w-1/3 border-r border-slate-800 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No API requests recorded yet. Perform an action (login, fetch partners, update) to inspect live calls.
            </div>
          ) : (
            <div className="divide-y divide-slate-900">
              {logs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className={`w-full p-2.5 text-left transition flex items-center justify-between ${
                      isSelected ? 'bg-slate-800/80 border-l-2 border-indigo-500' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 overflow-hidden">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                          log.method === 'GET'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800'
                            : log.method === 'POST'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {log.method}
                      </span>
                      <span className="text-xs text-slate-300 font-mono truncate">
                        {log.url.split('/').pop()}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-[10px] font-mono">
                      <span
                        className={
                          log.status >= 200 && log.status < 300
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                      >
                        {log.status || 'ERR'}
                      </span>
                      <span className="text-slate-500">{log.durationMs}ms</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Detailed inspector & cURL */}
        <div className="w-2/3 p-3 overflow-y-auto bg-slate-950">
          {selectedLog ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                <div className="flex items-center space-x-2 font-mono">
                  <span className="text-indigo-400 font-semibold">{selectedLog.method}</span>
                  <span className="text-slate-300">{selectedLog.url}</span>
                </div>
                <button
                  onClick={() => handleCopyCurl(selectedLog)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center space-x-1 font-mono transition"
                >
                  {copiedLogId === selectedLog.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied cURL</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy cURL</span>
                    </>
                  )}
                </button>
              </div>

              {/* cURL Display */}
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                  cURL Equivalent (As in API Specification)
                </span>
                <pre className="bg-slate-900 p-2.5 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre border border-slate-800">
                  {generateCurl(selectedLog)}
                </pre>
              </div>

              {/* Request Payload if any */}
              {selectedLog.requestBody !== undefined && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                    Request Payload
                  </span>
                  <pre className="bg-slate-900 p-2.5 rounded-lg font-mono text-[11px] text-cyan-300 overflow-x-auto border border-slate-800">
                    {JSON.stringify(selectedLog.requestBody, null, 2)}
                  </pre>
                </div>
              )}

              {/* Response Body */}
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                  Response Payload ({selectedLog.status})
                </span>
                <pre
                  className={`bg-slate-900 p-2.5 rounded-lg font-mono text-[11px] overflow-x-auto border border-slate-800 ${
                    selectedLog.success ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {JSON.stringify(selectedLog.responseBody, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Select a request on the left to inspect
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
