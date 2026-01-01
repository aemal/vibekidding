"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Send, Loader2, Sparkles, X, Globe } from "lucide-react";
import LanguagesModal from "./LanguagesModal";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  isGenerating: boolean;
}

export default function PromptInput({
  onSubmit,
  isGenerating,
}: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [showLanguagesModal, setShowLanguagesModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (prompt.trim() && !isGenerating) {
      onSubmit(prompt.trim());
      setPrompt("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearPrompt = () => {
    setPrompt("");
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Text input area */}
      <div className="w-full relative">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          placeholder="Describe what you want to create... ✨"
          className="prompt-textarea w-full min-h-[120px] p-4 pr-10 text-base rounded-2xl 
            border-3 border-purple-200 focus:border-purple-400 focus:ring-4 focus:ring-purple-100
            bg-white/90 backdrop-blur-sm resize-none transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            placeholder:text-gray-400"
          rows={4}
        />
        {prompt && !isGenerating && (
          <button
            onClick={clearPrompt}
            className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 
              hover:bg-gray-100 rounded-full transition-all"
            title="Clear"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!prompt.trim() || isGenerating}
        className={`
          prompt-submit-btn flex items-center gap-2 px-8 py-4 rounded-full
          font-bold text-lg transition-all duration-300 shadow-lg
          ${
            isGenerating
              ? "bg-gray-300 cursor-not-allowed text-gray-500"
              : prompt.trim()
              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 hover:scale-105 hover:shadow-xl"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }
        `}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Creating magic...</span>
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            <span>Create!</span>
          </>
        )}
      </button>

      {/* Helper text */}
      <p className="text-xs text-gray-500 text-center">
        Press <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd> to submit quickly
      </p>

      {/* Status */}
      {isGenerating && (
        <div className="text-center">
          <p className="text-purple-600 font-bold text-lg animate-pulse flex items-center gap-2 justify-center">
            <Sparkles className="w-5 h-5" />
            Creating your magic...
            <Sparkles className="w-5 h-5" />
          </p>
        </div>
      )}

      {/* Language hint - Subtle but discoverable */}
      <button
        onClick={() => setShowLanguagesModal(true)}
        className="flex items-center gap-1.5 mx-auto px-3 py-1.5 
          text-gray-500 hover:text-purple-600 
          text-sm rounded-full hover:bg-purple-50
          transition-all duration-200"
      >
        <Globe size={14} />
        <span>Type in any language</span>
        <span className="text-xs text-gray-400">(99+)</span>
      </button>

      {/* Languages Modal */}
      <LanguagesModal
        isOpen={showLanguagesModal}
        onClose={() => setShowLanguagesModal(false)}
      />
    </div>
  );
}

