"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareText, X } from "lucide-react";

interface PromptModalProps {
  isOpen: boolean;
  prompt: string;
  onClose: () => void;
}

export default function PromptModal({
  isOpen,
  prompt,
  onClose,
}: PromptModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  // Ensure we're mounted on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Focus the close button when dialog opens
      setTimeout(() => closeButtonRef.current?.focus(), 100);
      // Prevent body scroll
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !mounted) return null;

  const dialogContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        aria-describedby="prompt-dialog-content"
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl animate-dialog-pop overflow-hidden"
      >
        {/* Decorative top gradient */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="p-6 pt-8">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-purple-100 text-purple-600">
              <MessageSquareText size={32} />
            </div>
          </div>

          {/* Title */}
          <h2
            id="prompt-dialog-title"
            className="text-xl font-bold text-gray-800 text-center mb-4"
          >
            Full Request
          </h2>

          {/* Prompt content */}
          <div
            id="prompt-dialog-content"
            className="max-h-[300px] overflow-y-auto p-4 bg-purple-50 rounded-xl mb-6"
          >
            <p className="text-purple-700 font-medium text-sm md:text-base leading-relaxed whitespace-pre-wrap">
              {prompt}
            </p>
          </div>

          {/* Close button */}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="w-full px-5 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Got it!
          </button>
        </div>

        {/* Decorative elements */}
        <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-r from-purple-200 to-pink-200 rounded-full opacity-50 blur-xl pointer-events-none" />
        <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-gradient-to-r from-orange-200 to-yellow-200 rounded-full opacity-50 blur-xl pointer-events-none" />
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}

