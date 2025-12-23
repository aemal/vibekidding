"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface CodeViewProps {
  code: string;
}

export default function CodeView({ code }: CodeViewProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!code) {
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
    <div className="relative w-full h-full">
      <button
        onClick={copyCode}
        className="absolute top-4 right-4 z-10 p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 text-white text-sm"
      >
        {copied ? (
          <>
            <Check size={16} className="text-green-400" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy size={16} />
            <span>Copy</span>
          </>
        )}
      </button>
      <pre className="code-view w-full h-full p-6 overflow-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

