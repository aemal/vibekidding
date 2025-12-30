"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "danger" | "primary" | "success";
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles = {
  danger: {
    confirmButton: "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/30",
    icon: "bg-red-100 text-red-600",
  },
  primary: {
    confirmButton: "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/30",
    icon: "bg-purple-100 text-purple-600",
  },
  success: {
    confirmButton: "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/30",
    icon: "bg-green-100 text-green-600",
  },
};

export default function ConfirmDialog({
  isOpen,
  title = "Are you sure?",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger",
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const styles = variantStyles[confirmVariant];

  // Ensure we're mounted on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Focus the confirm button when dialog opens
      setTimeout(() => confirmButtonRef.current?.focus(), 100);
      // Prevent body scroll
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onCancel]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl animate-dialog-pop overflow-hidden"
      >
        {/* Decorative top gradient */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400" />

        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="p-6 pt-8">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className={`p-4 rounded-full ${styles.icon}`}>
              {icon || <AlertTriangle size={32} />}
            </div>
          </div>

          {/* Title */}
          <h2
            id="dialog-title"
            className="text-xl font-bold text-gray-800 text-center mb-2"
          >
            {title}
          </h2>

          {/* Message */}
          <p
            id="dialog-description"
            className="text-gray-600 text-center mb-6 leading-relaxed"
          >
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-5 py-3 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {cancelText}
            </button>
            <button
              ref={confirmButtonRef}
              onClick={onConfirm}
              className={`flex-1 px-5 py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] ${styles.confirmButton}`}
            >
              {confirmText}
            </button>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-r from-purple-200 to-pink-200 rounded-full opacity-50 blur-xl pointer-events-none" />
        <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-gradient-to-r from-orange-200 to-yellow-200 rounded-full opacity-50 blur-xl pointer-events-none" />
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}

