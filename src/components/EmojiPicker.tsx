"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface EmojiPickerProps {
  selectedEmoji: string;
  onSelect: (emoji: string) => void;
}

// Kid-friendly emojis organized by category
const EMOJI_CATEGORIES = {
  "🎮 Games": ["🎮", "🕹️", "🎲", "🎯", "🏆", "⚽", "🏀", "🎱", "🎳", "🎪"],
  "🐾 Animals": ["🐱", "🐶", "🐰", "🦊", "🐼", "🦁", "🐸", "🦋", "🐝", "🦄"],
  "🌈 Nature": ["🌈", "⭐", "🌟", "✨", "🌙", "☀️", "🌸", "🌺", "🍀", "🌊"],
  "🍕 Food": ["🍕", "🍔", "🍦", "🍩", "🍪", "🎂", "🍭", "🍬", "🧁", "🍿"],
  "🚀 Space": ["🚀", "🛸", "👽", "🌍", "🌎", "🌏", "💫", "🌠", "☄️", "🔭"],
  "🎨 Creative": ["🎨", "🎭", "🎬", "🎤", "🎸", "🎹", "🎺", "🥁", "📸", "✏️"],
  "😊 Faces": ["😊", "😎", "🤩", "😜", "🥳", "😇", "🤖", "👻", "💀", "🎃"],
  "💖 Love": ["💖", "💝", "💗", "💕", "❤️", "🧡", "💛", "💚", "💙", "💜"],
  "🦸 Heroes": ["🦸", "🦹", "🧙", "🧚", "🧜", "🧛", "👸", "🤴", "🥷", "👾"],
  "🏠 Things": ["🏠", "🚗", "🚂", "✈️", "🛳️", "🎁", "🎈", "🎀", "💎", "👑"],
};

export default function EmojiPicker({ selectedEmoji, onSelect }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Emoji button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-pink-100 to-purple-100 hover:from-pink-200 hover:to-purple-200 rounded-xl border-2 border-purple-200 transition-all hover:scale-105"
        title="Pick an emoji!"
      >
        <span className="text-2xl">{selectedEmoji}</span>
        <ChevronDown className={`w-4 h-4 text-purple-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border-2 border-purple-200 p-3 w-72 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          <p className="text-sm font-bold text-purple-600 mb-2 text-center">
            ✨ Pick your emoji! ✨
          </p>
          
          {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
            <div key={category} className="mb-3">
              <p className="text-xs font-semibold text-gray-500 mb-1 px-1">
                {category}
              </p>
              <div className="grid grid-cols-5 gap-1">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSelect(emoji)}
                    className={`text-2xl p-1.5 rounded-lg hover:bg-purple-100 transition-all hover:scale-110 ${
                      selectedEmoji === emoji ? "bg-purple-200 ring-2 ring-purple-400" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

