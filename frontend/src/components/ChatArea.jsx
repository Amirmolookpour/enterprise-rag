import { useState, useRef, useEffect, memo, useCallback } from 'react';

const MIN_MESSAGE_LENGTH = 2;
const MAX_MESSAGE_LENGTH = 1000;
const COPY_FEEDBACK_DURATION_MS = 2000;
const TEXTAREA_MAX_HEIGHT_PX = 200;


const Message = memo(function Message({ msg, isLastMessage, isStreaming, onCopy, isCopied }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#6366f1] text-white px-6 py-4 rounded-2xl rounded-tr-sm max-w-2xl shadow-md text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }

  const isThinking = isStreaming && msg.content === "" && isLastMessage;
  const showActions = !isStreaming && msg.content !== "";

  return (
    <div className="flex justify-start">
      <div className="flex gap-4 max-w-3xl w-full">
        <div className="w-9 h-9 rounded-full bg-[#121212] border border-white/10 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <i className="fa-solid fa-robot text-[#6366f1]"></i>
        </div>
        <div className="bg-[#121212] border border-white/5 text-gray-300 px-6 py-5 rounded-2xl rounded-tl-sm shadow-lg text-sm flex-1 min-w-0">

          {isThinking ? (
            <div className="flex items-center gap-3 py-1">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-6 h-6 rounded-full bg-[#6366f1]/30 animate-ping"></div>
                <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#a855f7] flex items-center justify-center shadow-lg shadow-[#6366f1]/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                <span className="animate-pulse">Enterprise AI is thinking</span>
                <span className="inline-flex gap-0.5">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              </div>
            </div>
          ) : (
            <p className="leading-relaxed whitespace-pre-wrap">
              {msg.content}
              {isStreaming && isLastMessage && msg.content !== "" && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-[#6366f1] animate-pulse align-middle"></span>
              )}
            </p>
          )}

          {msg.citations && msg.citations.length > 0 && (
            <div className="border-t border-white/5 mt-4 pt-4 flex flex-wrap gap-2.5">
              <span className="text-[11px] text-gray-500 mb-1 w-full font-medium uppercase tracking-wider">Citations</span>
              {msg.citations.map((c, i) => (
                <div key={c.id ?? i} className="bg-[#050505] text-[#a855f7] text-xs px-3 py-2 rounded-lg border border-white/5 cursor-default flex items-center gap-2 shadow-sm">
                  <i className="fa-regular fa-file-lines"></i> {c.filename} (Page {c.page})
                </div>
              ))}
            </div>
          )}

          {showActions && (
            <div className="flex items-center gap-1 mt-4 -ml-2 text-gray-500">
              <button
                type="button"
                aria-label="Good response"
                className="w-8 h-8 rounded-lg hover:bg-white/5 hover:text-[#6366f1] transition-colors cursor-pointer"
                title="Good response"
              >
                <i className="fa-regular fa-thumbs-up text-xs"></i>
              </button>
              <button
                type="button"
                aria-label="Bad response"
                className="w-8 h-8 rounded-lg hover:bg-white/5 hover:text-red-400 transition-colors cursor-pointer"
                title="Bad response"
              >
                <i className="fa-regular fa-thumbs-down text-xs"></i>
              </button>
              <button
                type="button"
                aria-label="Copy response"
                onClick={onCopy}
                className="w-8 h-8 rounded-lg hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                title="Copy"
              >
                <i className={`fa-regular text-xs transition-all ${isCopied ? 'fa-check text-green-400' : 'fa-copy'}`}></i>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default function ChatArea({
  sessionTitle = "New Chat",
  isHealthy = true,
  messages = [],
  isStreaming = false,
  onSendMessage,
  onStopStreaming
}) {
  const [inputValue, setInputValue] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const copyTimeoutRef = useRef(null);

  const trimmedLength = inputValue.trim().length;
  const isSendDisabled = isStreaming || trimmedLength < MIN_MESSAGE_LENGTH;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);


  useEffect(() => {
    return () => clearTimeout(copyTimeoutRef.current);
  }, []);


  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  }, [inputValue]);

  const handleSend = useCallback(() => {
    if (isSendDisabled) return;
    onSendMessage(inputValue.trim());
    setInputValue("");

    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [inputValue, isSendDisabled, onSendMessage]);


  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };


  const copyToClipboard = useCallback(async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, COPY_FEEDBACK_DURATION_MS);
    } catch (err) {
      console.error("Copy to clipboard failed:", err);
    }
  }, []);

  return (
    <main className="flex-1 flex flex-col relative bg-[#050505] min-w-0">

      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 z-10 bg-[#050505] shrink-0">
        <h2 className="font-medium text-gray-200 ml-2">
          Current Chat: <span className="text-gray-400 text-sm font-light">{sessionTitle}</span>
        </h2>
        <div className={`flex items-center gap-2 text-xs bg-[#121212] border border-white/5 px-3 py-1.5 rounded-full ${isHealthy ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span>{isHealthy ? 'Online' : 'Offline'}</span>
        </div>
      </header>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 pb-40 custom-scrollbar scroll-smooth">


        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="bg-gradient-to-tr from-[#6366f1] to-[#a855f7] w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-[#6366f1]/20">
              <i className="fa-solid fa-brain text-white text-xl"></i>
            </div>
            <h3 className="text-white font-medium text-xl mb-2">Ask about your documents</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Upload a file from the sidebar, then ask any question about it. Every answer comes with citations pointing to the exact file and page.
            </p>
          </div>
        )}

  
        {messages.map((msg, index) => {
          const messageKey = msg.id ?? index;
          return (
            <Message
              key={messageKey}
              msg={msg}
              isLastMessage={index === messages.length - 1}
              isStreaming={isStreaming}
              isCopied={copiedId === messageKey}
              onCopy={() => copyToClipboard(msg.content, messageKey)}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 w-full p-8 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent pt-12 shrink-0">
        <div className="max-w-4xl mx-auto relative group">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask anything about your workspace..."
            maxLength={MAX_MESSAGE_LENGTH}
            aria-label="Message input"
            className="w-full bg-[#121212] border border-white/10 text-white rounded-2xl pl-5 pr-16 py-4 focus:outline-none focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1] shadow-xl transition-all placeholder-gray-600 text-sm disabled:opacity-50 resize-none leading-relaxed max-h-[200px] custom-scrollbar"
          />
          {/* Send / Stop */}
          <button
            type="button"
            aria-label={isStreaming ? "Stop generating" : "Send message"}
            onClick={isStreaming ? onStopStreaming : handleSend}
            disabled={!isStreaming && isSendDisabled}
            className={`absolute right-2 bottom-2 w-11 h-11 rounded-xl text-white flex items-center justify-center transition-all duration-300 shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${isStreaming ? 'bg-red-500 hover:bg-red-600' : 'bg-[#6366f1] hover:bg-[#5457d6]'}`}
          >
            <i className={`fa-solid ${isStreaming ? 'fa-square text-xs' : 'fa-paper-plane'} transition-transform`}></i>
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-600 mt-4 font-medium tracking-wide">Enterprise RAG models can make mistakes. Check your sources.</p>
      </div>

    </main>
  );
}