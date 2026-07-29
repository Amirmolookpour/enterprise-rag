import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;

const HEALTH_CHECK_INTERVAL_MS = 10000;
const UPLOAD_STATUS_RESET_MS = 3000;
const LS_WORKSPACE_ID_KEY = 'rag_ws_id';
const LS_WORKSPACE_NAME_KEY = 'rag_ws_name';
const DEFAULT_WORKSPACE_ID = 1;
const DEFAULT_WORKSPACE_NAME = 'default_demo';


function readStoredWorkspaceId() {
  const raw = parseInt(localStorage.getItem(LS_WORKSPACE_ID_KEY) || '', 10);
  return Number.isNaN(raw) ? DEFAULT_WORKSPACE_ID : raw;
}


async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Server responded with ${res.status}`);
  return res.json();
}

function App() {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isHealthy, setIsHealthy] = useState(false);

  const [workspaceId, setWorkspaceId] = useState(readStoredWorkspaceId);
  const [workspaceName, setWorkspaceName] = useState(() => localStorage.getItem(LS_WORKSPACE_NAME_KEY) || DEFAULT_WORKSPACE_NAME);
  const [documents, setDocuments] = useState([]);

  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionTitle, setSessionTitle] = useState("New Chat");
  const [messages, setMessages] = useState([]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("Processing…");
  const [isStreaming, setIsStreaming] = useState(false);

  const abortControllerRef = useRef(null);
  const uploadResetTimeoutRef = useRef(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      setIsHealthy(res.ok);
    } catch {
      setIsHealthy(false);
    }
  }, []);

  const loadDocuments = useCallback(async (targetWorkspaceId) => {
    try {
      const data = await fetchJson(`${API}/workspaces/${targetWorkspaceId}/documents`);

      setWorkspaceId((current) => {
        if (current === targetWorkspaceId) setDocuments(data);
        return current;
      });
    } catch (e) {
      console.error("Failed to load documents", e);
    }
  }, []);

  const loadChatHistory = useCallback(async (targetWorkspaceId) => {
    try {
      const data = await fetchJson(`${API}/workspaces/${targetWorkspaceId}/chat-sessions`);
      setWorkspaceId((current) => {
        if (current === targetWorkspaceId) setSessions(data);
        return current;
      });
    } catch (e) {
      console.error("Failed to load chat history", e);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    loadDocuments(workspaceId);
    loadChatHistory(workspaceId);
    const healthInterval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(healthInterval);
  }, [workspaceId, checkHealth, loadDocuments, loadChatHistory]);


  useEffect(() => {
    return () => clearTimeout(uploadResetTimeoutRef.current);
  }, []);

  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    setSessionTitle("New Chat");
    setMessages([]);
    handleStopStreaming();
  }, [handleStopStreaming]);

  const handleNewWorkspace = useCallback(async () => {
    const name = prompt('Enter a name for the new workspace:');
    if (!name || !name.trim()) return;
    try {
      const res = await fetch(`${BASE_URL}/workspace/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_name: name.trim() })
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      setWorkspaceId(data.workspace_id);
      setWorkspaceName(data.name);
      localStorage.setItem(LS_WORKSPACE_ID_KEY, data.workspace_id);
      localStorage.setItem(LS_WORKSPACE_NAME_KEY, data.name);
      handleNewChat();
    } catch (e) {
      console.error('Failed to create workspace', e);
      alert('Failed to create workspace.');
    }
  }, [handleNewChat]);

  const handleUploadFile = useCallback(async (file, extractImg) => {
    setIsUploading(true);
    setUploadStatusText(`Processing "${file.name}"…`);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('extract_img', extractImg);

    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/upload`, {
        method: 'POST',
        body: formData
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
      }
      if (!res.ok) throw new Error(data.detail || `Upload failed (${res.status})`);

      setUploadStatusText(`✓ ${data.chunks_processed} chunks extracted`);
      loadDocuments(workspaceId);
    } catch (err) {
      setUploadStatusText(`Error: ${err.message}`);
    } finally {
      clearTimeout(uploadResetTimeoutRef.current);
      uploadResetTimeoutRef.current = setTimeout(() => setIsUploading(false), UPLOAD_STATUS_RESET_MS);
    }
  }, [workspaceId, loadDocuments]);

  const handleDeleteDocument = useCallback(async (docId) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/documents/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      loadDocuments(workspaceId);
    } catch (e) {
      console.error('Delete document failed', e);
      alert('Failed to delete document.');
    }
  }, [workspaceId, loadDocuments]);

  const handleSelectSession = useCallback(async (sessionId, title) => {
    setCurrentSessionId(sessionId);
    setSessionTitle(title || "Untitled chat");
    handleStopStreaming();

    try {
      const msgs = await fetchJson(`${API}/chat-sessions/${sessionId}/messages`);
      setMessages(msgs);
    } catch (e) {
      console.error('Failed to load messages', e);
      setMessages([]);
    }
  }, [handleStopStreaming]);

  const handleDeleteSession = useCallback(async (sessionId) => {
    if (!confirm('Are you sure you want to delete this chat?')) return;
    try {
      const res = await fetch(`${API}/chat-sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      setCurrentSessionId((current) => {
        if (current === sessionId) handleNewChat();
        return current;
      });
      loadChatHistory(workspaceId);
    } catch (e) {
      console.error('Delete chat failed', e);
      alert('Failed to delete chat.');
    }
  }, [handleNewChat, loadChatHistory, workspaceId]);

  const ensureSession = useCallback(async () => {
    if (currentSessionId) return currentSessionId;
    const res = await fetch(`${API}/workspaces/${workspaceId}/chat-sessions`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to create chat session');
    const data = await res.json();
    setCurrentSessionId(data.id);
    return data.id;
  }, [currentSessionId, workspaceId]);

  const handleSendMessage = useCallback(async (query) => {
    const userMsg = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const aiMsg = { role: 'assistant', content: '', citations: [] };
    setMessages(prev => [...prev, aiMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let answerBuffer = "";
    let citationsBuffer = [];

    try {
      const sessionId = await ensureSession();
      const res = await fetch(`${API}/chat-sessions/${sessionId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal
      });

      if (!res.ok) throw new Error('Server response error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;

          let evt;
          try {
            evt = JSON.parse(part.slice(6));
          } catch (parseErr) {
            console.error("Stream parse error", parseErr);
            continue;
          }

          if (evt.type === 'citations') {
            citationsBuffer = evt.citations || [];
          } else if (evt.type === 'token') {
            answerBuffer += evt.content;
            setMessages(prev => {
              const newMsgs = [...prev];
              newMsgs[newMsgs.length - 1] = {
                role: 'assistant',
                content: answerBuffer,
                citations: citationsBuffer
              };
              return newMsgs;
            });
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'Server reported a streaming error.');
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        answerBuffer += ' [Stopped by user]';
      } else {
        answerBuffer = err.message || 'Could not reach the server or processing failed.';
      }
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { role: 'assistant', content: answerBuffer, citations: citationsBuffer };
        return newMsgs;
      });
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      loadChatHistory(workspaceId);
    }
  }, [ensureSession, loadChatHistory, workspaceId]);

  return (
    <div className="bg-[#050505] text-gray-300 w-screen h-screen flex overflow-hidden selection:bg-[#6366f1] selection:text-white m-0 p-0">

      <Sidebar
        isExpanded={isSidebarExpanded}
        setIsExpanded={setIsSidebarExpanded}
        workspaceName={workspaceName}
        sessions={sessions}
        documents={documents}
        currentSessionId={currentSessionId}
        isUploading={isUploading}
        uploadStatusText={uploadStatusText}
        isHealthy={isHealthy}
        onNewChat={handleNewChat}
        onNewWorkspace={handleNewWorkspace}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onUploadFile={handleUploadFile}
        onDeleteDocument={handleDeleteDocument}
      />

      <ChatArea
        sessionTitle={sessionTitle}
        isHealthy={isHealthy}
        messages={messages}
        isStreaming={isStreaming}
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
      />

    </div>
  );
}

export default App;