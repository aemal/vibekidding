"use client";

import { Copy, Check, Save, RotateCcw, Code2 } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";

interface EditableCodeViewProps {
  code: string;
  isEditable: boolean;
  onSave?: (code: string) => void;
  isSaving?: boolean;
}

export default function EditableCodeView({
  code,
  isEditable,
  onSave,
  isSaving = false,
}: EditableCodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [editedCode, setEditedCode] = useState(code);
  const [hasChanges, setHasChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync editedCode when code prop changes
  useEffect(() => {
    setEditedCode(code);
    setHasChanges(false);
  }, [code]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(isEditable ? editedCode : code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCodeChange = useCallback(
    (newCode: string) => {
      setEditedCode(newCode);
      setHasChanges(newCode !== code);
    },
    [code]
  );

  const handleSave = () => {
    if (onSave && hasChanges) {
      onSave(editedCode);
    }
  };

  const handleReset = () => {
    setEditedCode(code);
    setHasChanges(false);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  if (!code && !isEditable) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-2xl">
        <div className="text-center p-8">
          <div className="text-7xl mb-4">💻</div>
          <h3 className="text-2xl font-bold text-gray-300 mb-2">
            No Code Yet!
          </h3>
          <p className="text-gray-500">
            Create something and the code will appear here!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between p-2 bg-gray-800 rounded-t-2xl border-b border-gray-700">
        <div className="flex items-center gap-2 text-gray-400 text-sm px-2">
          <Code2 size={16} />
          <span>HTML Code</span>
          {isEditable && (
            <span className="ml-2 px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded-full font-medium">
              ✏️ Editable
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditable && hasChanges && (
            <>
              <button
                onClick={handleReset}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 text-orange-400 text-sm"
                title="Reset changes"
              >
                <RotateCcw size={14} />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="p-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex items-center gap-2 text-white text-sm disabled:opacity-50"
                title="Save changes (Ctrl+S)"
              >
                <Save size={14} />
                <span className="hidden sm:inline">
                  {isSaving ? "Saving..." : "Save"}
                </span>
              </button>
            </>
          )}
          <button
            onClick={copyCode}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 text-white text-sm"
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-400" />
                <span className="hidden sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code editor / viewer */}
      <div className="flex-1 min-h-0 relative">
        {isEditable ? (
          <textarea
            ref={textareaRef}
            value={editedCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="code-editor w-full h-full p-4 text-sm font-mono
              bg-[#1e1e2e] text-[#cdd6f4] rounded-b-2xl resize-none
              focus:outline-none focus:ring-2 focus:ring-purple-500/50
              border-0"
            spellCheck={false}
            placeholder="Start typing your HTML code here..."
          />
        ) : (
          <pre className="code-view w-full h-full p-6 overflow-auto rounded-b-2xl">
            <code>{code}</code>
          </pre>
        )}

        {/* Unsaved changes indicator */}
        {isEditable && hasChanges && (
          <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-yellow-500/90 text-yellow-900 text-xs font-bold rounded-full flex items-center gap-1.5 shadow-lg">
            <span className="w-2 h-2 bg-yellow-900 rounded-full animate-pulse" />
            Unsaved changes
          </div>
        )}
      </div>
    </div>
  );
}

