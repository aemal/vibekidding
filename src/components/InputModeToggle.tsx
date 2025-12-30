"use client";

import { Mic, Keyboard } from "lucide-react";

export type InputMode = "voice" | "typing";

interface InputModeToggleProps {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  disabled?: boolean;
}

export default function InputModeToggle({
  mode,
  onModeChange,
  disabled = false,
}: InputModeToggleProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="mode-toggle-container">
        <button
          onClick={() => onModeChange("voice")}
          disabled={disabled}
          className={`mode-toggle-btn ${mode === "voice" ? "active" : ""}`}
          title="Voice Mode"
        >
          <Mic size={18} />
          <span>Voice</span>
        </button>
        <button
          onClick={() => onModeChange("typing")}
          disabled={disabled}
          className={`mode-toggle-btn ${mode === "typing" ? "active" : ""}`}
          title="Typing Mode"
        >
          <Keyboard size={18} />
          <span>Type</span>
        </button>
        <div
          className={`mode-toggle-slider ${mode === "typing" ? "right" : ""}`}
        />
      </div>
      <p className="text-xs text-gray-500 font-medium">
        {mode === "voice" ? "🎤 Talk to create!" : "⌨️ Type your ideas!"}
      </p>
    </div>
  );
}

