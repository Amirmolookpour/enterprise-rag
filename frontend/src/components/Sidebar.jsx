import { useState, useRef, useMemo, useCallback, memo } from 'react';

const ACCEPTED_FILE_TYPES = ".pdf,.docx,.csv,.txt,.md";
const RAIL_ICON_STYLE = "w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer";


function isSameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}


const SessionItem = memo(function SessionItem({ session, isActive, onSelect, onDelete }) {
  return (
    <li className="relative group">
      <button
        type="button"
        onClick={() => onSelect(session.id, session.title)}
        className={`w-full text-left px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs flex items-center gap-2 hover:bg-white/5 ${isActive ? 'bg-white/5 text-white font-medium' : 'text-gray-400 hover:text-white'}`}
      >
        <i className="fa-regular fa-message text-[10px] opacity-70 shrink-0"></i>
        <span className="flex-1 truncate">{session.title || 'Untitled chat'}</span>
      </button>
      <button
        type="button"
        aria-label="Delete chat"
        onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1 cursor-pointer"
        title="Delete chat"
      >
        <i className="fa-regular fa-trash-can text-[10px]"></i>
      </button>
    </li>
  );
});


const DocumentItem = memo(function DocumentItem({ doc, onDelete }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/5 text-[10px] text-gray-400 group transition-all">
      <div className="flex items-center gap-1.5 truncate">
        <i className="fa-regular fa-file-lines text-gray-600 shrink-0"></i>
        <span className="truncate">{doc.filename}</span>
      </div>
      <button
        type="button"
        onClick={() => onDelete(doc.id)}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-red-400 transition-all ml-1 p-0.5 cursor-pointer"
        title="Delete"
      >
        <i className="fa-regular fa-trash-can"></i>
      </button>
    </div>
  );
});

export default function Sidebar({
  isExpanded,
  setIsExpanded,
  workspaceName = "default_demo",
  sessions = [],
  documents = [],
  currentSessionId,
  isUploading = false,
  uploadStatusText = "Processing…",
  isHealthy = true,
  onNewChat,
  onNewWorkspace,
  onSelectSession,
  onDeleteSession,
  onUploadFile,
  onDeleteDocument
}) {
  const [isVisionEnabled, setIsVisionEnabled] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile?.(file, isVisionEnabled);
      e.target.value = '';
    }
  }, [onUploadFile, isVisionEnabled]);

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);
  const toggleVision = useCallback(() => setIsVisionEnabled((v) => !v), []);

  const handleSelectSession = useCallback(
    (id, title) => onSelectSession?.(id, title),
    [onSelectSession]
  );
  const handleDeleteSession = useCallback(
    (id) => onDeleteSession?.(id),
    [onDeleteSession]
  );
  const handleDeleteDocument = useCallback(
    (id) => onDeleteDocument?.(id),
    [onDeleteDocument]
  );


  const groupedSessions = useMemo(() => {
    const groups = { 'Today': [], 'Previous 7 Days': [], 'Older': [] };
    const now = new Date();

    sessions.forEach((s) => {
      const created = new Date(s.created_at);
      const diffDays = (now - created) / (1000 * 60 * 60 * 24);
      if (isSameCalendarDay(created, now)) {
        groups['Today'].push(s);
      } else if (diffDays < 7) {
        groups['Previous 7 Days'].push(s);
      } else {
        groups['Older'].push(s);
      }
    });

    return groups;
  }, [sessions]);

  const workspaceInitial = (workspaceName || "?").charAt(0).toUpperCase();

  return (
    <aside className={`${isExpanded ? 'w-[280px]' : 'w-[72px]'} bg-[#121212] border-r border-white/5 flex flex-col z-20 shadow-2xl h-full shrink-0 transition-all duration-300 relative overflow-hidden`}>

      <input ref={fileInputRef} onChange={handleFileChange} type="file" className="hidden" accept={ACCEPTED_FILE_TYPES} />

      {isExpanded ? (
        
        <div className="flex flex-col h-full w-[280px]">

          
          <div className="p-4 flex items-center justify-between border-b border-white/5 h-16 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-tr from-[#6366f1] to-[#a855f7] text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-md shadow-[#6366f1]/20">
                <i className="fa-solid fa-brain text-xs"></i>
              </div>
              <h1 className="font-bold text-sm tracking-wide text-white">Enterprise AI</h1>
            </div>
            <button type="button" aria-label="Collapse sidebar" onClick={() => setIsExpanded(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
          </div>

          
          <div className="p-4 pb-2 shrink-0">
            <button type="button" onClick={onNewChat} className="w-full bg-[#6366f1] hover:bg-[#5457d6] text-white font-medium py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-md cursor-pointer">
              <i className="fa-solid fa-plus text-xs"></i> New Chat
            </button>
          </div>

          
          <div className="flex-grow overflow-y-auto custom-scrollbar px-4 py-3 space-y-4 min-h-0">

          
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Workspace</span>
                <button type="button" onClick={onNewWorkspace} className="text-[10px] text-gray-400 hover:text-[#6366f1] transition-colors cursor-pointer">
                  <i className="fa-solid fa-plus"></i> New
                </button>
              </div>
              <div className="bg-[#6366f1]/10 text-[#6366f1] px-3 py-2 rounded-xl border border-[#6366f1]/20 flex items-center gap-2.5 font-medium text-xs">
                <i className="fa-regular fa-folder-open shrink-0"></i>
                <span className="truncate">{workspaceName}</span>
              </div>
            </div>

            
            <div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">History</span>
              <div className="space-y-3">
                {sessions.length === 0 ? (
                  <p className="text-[11px] text-gray-600 px-1">No chats yet.</p>
                ) : (
                  Object.entries(groupedSessions).filter(([, items]) => items.length > 0).map(([label, items]) => (
                    <div key={label}>
                      <span className="text-[9px] text-gray-600 mb-1 block font-medium px-1">{label}</span>
                      <ul className="space-y-0.5">
                        {items.map((s) => (
                          <SessionItem
                            key={s.id}
                            session={s}
                            isActive={s.id === currentSessionId}
                            onSelect={handleSelectSession}
                            onDelete={handleDeleteSession}
                          />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          
          <div className="p-4 border-t border-white/5 bg-[#0e0e0e] shrink-0 space-y-2.5">

            
            <button
              type="button"
              onClick={openFilePicker}
              className="w-full border border-dashed border-gray-700 hover:border-[#6366f1] bg-[#141414] hover:bg-[#6366f1]/5 rounded-xl p-2.5 text-center transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-center gap-2">
                <div className="w-6 h-6 bg-[#1e1e1e] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="fa-solid fa-cloud-arrow-up text-gray-400 text-xs group-hover:text-[#6366f1]"></i>
                </div>
                <div className="text-left">
                  <p className="text-[11px] text-gray-200 font-medium">Upload Document</p>
                  <p className="text-[9px] text-gray-500">PDF, DOCX, TXT</p>
                </div>
              </div>
            </button>

            
            <button
              type="button"
              onClick={toggleVision}
              aria-pressed={isVisionEnabled}
              className="w-full bg-[#161616] border border-white/5 rounded-xl px-3 py-2 flex items-center justify-between cursor-pointer hover:border-purple-500/30 transition-all"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-[#a855f7] to-[#ec4899] flex items-center justify-center text-white text-[10px]">
                  <i className="fa-solid fa-eye animate-pulse"></i>
                </div>
                <span className="text-[11px] text-gray-300 font-medium">Vision AI</span>
              </div>
              <span className="relative inline-flex items-center shrink-0 scale-75 origin-right pointer-events-none">
                <span className={`w-9 h-5 rounded-full transition-colors ${isVisionEnabled ? 'bg-purple-600' : 'bg-gray-700'}`}>
                  <span className={`block bg-white rounded-full h-4 w-4 mt-0.5 transition-transform ${isVisionEnabled ? 'translate-x-4' : 'translate-x-0.5'}`}></span>
                </span>
              </span>
            </button>

          
            {isUploading && (
              <div className="flex items-center gap-2 text-[10px] text-gray-400 px-1" role="status">
                <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                <span className="truncate">{uploadStatusText}</span>
              </div>
            )}

          
            <button
              type="button"
              onClick={() => setShowDocs((v) => !v)}
              aria-expanded={showDocs}
              className="w-full text-[11px] text-gray-400 hover:text-[#6366f1] transition-colors flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/5 font-medium cursor-pointer"
            >
              <span className="flex items-center gap-1.5"><i className="fa-solid fa-database text-[10px]"></i> Knowledge Base</span>
              <span className="bg-white/5 px-2 py-0.5 rounded-md text-[10px] text-gray-300">{documents.length}</span>
            </button>

            {/*Knowledge Base */}
            {showDocs && (
              <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar pt-1">
                {documents.length === 0 ? (
                  <p className="text-[10px] text-gray-600 px-2">No documents yet.</p>
                ) : (
                  documents.map((d) => (
                    <DocumentItem key={d.id} doc={d} onDelete={handleDeleteDocument} />
                  ))
                )}
              </div>
            )}

            
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {workspaceInitial}
                </div>
                <span className="text-xs text-gray-300 font-medium truncate">{workspaceName}</span>
              </div>
              <span className={`w-2 h-2 rounded-full shrink-0 ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`} title={isHealthy ? 'Online' : 'Offline'}></span>
            </div>
          </div>
        </div>
      ) : (
        
        
        <div className="flex flex-col items-center justify-between py-4 h-full w-[72px]">
          <div className="flex flex-col items-center gap-2">
            <div className="bg-gradient-to-tr from-[#6366f1] to-[#a855f7] text-white w-9 h-9 rounded-xl flex items-center justify-center mb-2 shadow-md shadow-[#6366f1]/20">
              <i className="fa-solid fa-brain text-xs"></i>
            </div>
            <button type="button" onClick={() => setIsExpanded(true)} title="Expand" aria-label="Expand sidebar" className={RAIL_ICON_STYLE}><i className="fa-solid fa-chevron-right text-xs"></i></button>
            <button type="button" onClick={() => { setIsExpanded(true); onNewChat?.(); }} title="New chat" aria-label="New chat" className={RAIL_ICON_STYLE}><i className="fa-solid fa-plus text-xs"></i></button>
            <button type="button" onClick={() => { setIsExpanded(true); openFilePicker(); }} title="Upload" aria-label="Upload document" className={RAIL_ICON_STYLE}><i className="fa-solid fa-cloud-arrow-up text-xs"></i></button>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => setIsExpanded(true)} title="History" aria-label="Chat history" className={RAIL_ICON_STYLE}><i className="fa-solid fa-clock-rotate-left text-xs"></i></button>
            <div className={`w-2.5 h-2.5 rounded-full my-1 ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white text-xs font-semibold">
              {workspaceInitial}
            </div>
          </div>
        </div>
      )}

    </aside>
  );
}