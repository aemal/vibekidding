"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Globe, Mic, Bot, Search } from "lucide-react";

interface LanguagesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Languages supported by Whisper (voice input) - ~99 languages
const whisperLanguages = [
  { name: "Afrikaans", emoji: "🇿🇦", code: "af" },
  { name: "Arabic", emoji: "🇸🇦", code: "ar" },
  { name: "Armenian", emoji: "🇦🇲", code: "hy" },
  { name: "Azerbaijani", emoji: "🇦🇿", code: "az" },
  { name: "Belarusian", emoji: "🇧🇾", code: "be" },
  { name: "Bengali", emoji: "🇧🇩", code: "bn" },
  { name: "Bosnian", emoji: "🇧🇦", code: "bs" },
  { name: "Bulgarian", emoji: "🇧🇬", code: "bg" },
  { name: "Catalan", emoji: "🇪🇸", code: "ca" },
  { name: "Chinese", emoji: "🇨🇳", code: "zh" },
  { name: "Croatian", emoji: "🇭🇷", code: "hr" },
  { name: "Czech", emoji: "🇨🇿", code: "cs" },
  { name: "Danish", emoji: "🇩🇰", code: "da" },
  { name: "Dutch", emoji: "🇳🇱", code: "nl" },
  { name: "English", emoji: "🇬🇧", code: "en" },
  { name: "Estonian", emoji: "🇪🇪", code: "et" },
  { name: "Filipino", emoji: "🇵🇭", code: "tl" },
  { name: "Finnish", emoji: "🇫🇮", code: "fi" },
  { name: "French", emoji: "🇫🇷", code: "fr" },
  { name: "Galician", emoji: "🇪🇸", code: "gl" },
  { name: "German", emoji: "🇩🇪", code: "de" },
  { name: "Greek", emoji: "🇬🇷", code: "el" },
  { name: "Gujarati", emoji: "🇮🇳", code: "gu" },
  { name: "Hebrew", emoji: "🇮🇱", code: "he" },
  { name: "Hindi", emoji: "🇮🇳", code: "hi" },
  { name: "Hungarian", emoji: "🇭🇺", code: "hu" },
  { name: "Icelandic", emoji: "🇮🇸", code: "is" },
  { name: "Indonesian", emoji: "🇮🇩", code: "id" },
  { name: "Italian", emoji: "🇮🇹", code: "it" },
  { name: "Japanese", emoji: "🇯🇵", code: "ja" },
  { name: "Kannada", emoji: "🇮🇳", code: "kn" },
  { name: "Kazakh", emoji: "🇰🇿", code: "kk" },
  { name: "Korean", emoji: "🇰🇷", code: "ko" },
  { name: "Latvian", emoji: "🇱🇻", code: "lv" },
  { name: "Lithuanian", emoji: "🇱🇹", code: "lt" },
  { name: "Macedonian", emoji: "🇲🇰", code: "mk" },
  { name: "Malay", emoji: "🇲🇾", code: "ms" },
  { name: "Malayalam", emoji: "🇮🇳", code: "ml" },
  { name: "Marathi", emoji: "🇮🇳", code: "mr" },
  { name: "Maori", emoji: "🇳🇿", code: "mi" },
  { name: "Nepali", emoji: "🇳🇵", code: "ne" },
  { name: "Norwegian", emoji: "🇳🇴", code: "no" },
  { name: "Persian", emoji: "🇮🇷", code: "fa" },
  { name: "Polish", emoji: "🇵🇱", code: "pl" },
  { name: "Portuguese", emoji: "🇧🇷", code: "pt" },
  { name: "Punjabi", emoji: "🇮🇳", code: "pa" },
  { name: "Romanian", emoji: "🇷🇴", code: "ro" },
  { name: "Russian", emoji: "🇷🇺", code: "ru" },
  { name: "Serbian", emoji: "🇷🇸", code: "sr" },
  { name: "Slovak", emoji: "🇸🇰", code: "sk" },
  { name: "Slovenian", emoji: "🇸🇮", code: "sl" },
  { name: "Spanish", emoji: "🇪🇸", code: "es" },
  { name: "Swahili", emoji: "🇰🇪", code: "sw" },
  { name: "Swedish", emoji: "🇸🇪", code: "sv" },
  { name: "Tamil", emoji: "🇮🇳", code: "ta" },
  { name: "Telugu", emoji: "🇮🇳", code: "te" },
  { name: "Thai", emoji: "🇹🇭", code: "th" },
  { name: "Turkish", emoji: "🇹🇷", code: "tr" },
  { name: "Ukrainian", emoji: "🇺🇦", code: "uk" },
  { name: "Urdu", emoji: "🇵🇰", code: "ur" },
  { name: "Vietnamese", emoji: "🇻🇳", code: "vi" },
  { name: "Welsh", emoji: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", code: "cy" },
  { name: "Yoruba", emoji: "🇳🇬", code: "yo" },
];

// Languages with strong Claude support (AI understanding & generation)
const claudeStrongLanguages = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "German",
  "Italian",
  "Dutch",
  "Russian",
  "Chinese",
  "Japanese",
  "Korean",
  "Arabic",
  "Hindi",
  "Bengali",
  "Indonesian",
  "Turkish",
  "Vietnamese",
  "Thai",
  "Polish",
  "Ukrainian",
  "Swedish",
  "Norwegian",
  "Danish",
  "Finnish",
  "Czech",
  "Greek",
  "Hebrew",
  "Romanian",
  "Hungarian",
  "Swahili",
];

export default function LanguagesModal({ isOpen, onClose }: LanguagesModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [mounted, setMounted] = useState(false);

  // Handle client-side mounting for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const filteredLanguages = whisperLanguages.filter((lang) =>
    lang.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden animate-bounce-in">
        {/* Header - Super kid-friendly */}
        <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 p-6 text-white relative overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-2 right-16 text-4xl opacity-30 animate-bounce">🌟</div>
          <div className="absolute bottom-2 left-4 text-3xl opacity-30 animate-bounce" style={{animationDelay: '0.5s'}}>✨</div>
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Globe className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-extrabold">
                  I Speak Your Language! 🗣️
                </h2>
                <p className="text-white/90 text-sm mt-1">
                  Talk to me in any language you want! ✨
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
          {/* Info cards - Super fun for kids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl p-4 border-3 border-blue-300 shadow-md hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <Mic className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-blue-700 text-lg">🎤 I Can Hear You!</h3>
              </div>
              <p className="text-sm text-blue-600">
                <span className="font-extrabold text-3xl text-blue-700">99+</span>
                <span className="block text-blue-600 font-semibold">languages I understand!</span>
                <span className="text-blue-500">Just talk - I&apos;ll get it! 👂</span>
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-100 to-pink-100 rounded-2xl p-4 border-3 border-purple-300 shadow-md hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-purple-700 text-lg">🤖 I Create For You!</h3>
              </div>
              <p className="text-sm text-purple-600">
                <span className="font-extrabold text-3xl text-purple-700">30+</span>
                <span className="block text-purple-600 font-semibold">languages I&apos;m great at!</span>
                <span className="text-purple-500">Games in YOUR language! 🎮</span>
              </p>
            </div>
          </div>

          {/* Search - Kid-friendly */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
            <input
              type="text"
              placeholder="🔍 Find your language..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-2xl border-3 border-purple-200 focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100 transition-all text-lg font-medium"
            />
          </div>

          {/* Language grid - Big and colorful for kids */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filteredLanguages.map((lang) => {
              const hasStrongAI = claudeStrongLanguages.includes(lang.name);
              return (
                <div
                  key={lang.code}
                  className={`
                    flex items-center gap-2 p-3 rounded-xl transition-all cursor-default
                    hover:scale-[1.02] hover:shadow-md
                    ${
                      hasStrongAI
                        ? "bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300 shadow-sm"
                        : "bg-gray-50 border-2 border-gray-200 hover:border-gray-300"
                    }
                  `}
                  title={hasStrongAI ? "⭐ Super! Great AI support!" : "✓ Voice input works great!"}
                >
                  <span className="text-2xl">{lang.emoji}</span>
                  <span className={`truncate font-semibold ${hasStrongAI ? "text-purple-700" : "text-gray-700"}`}>
                    {lang.name}
                  </span>
                  {hasStrongAI && (
                    <span className="ml-auto text-lg">⭐</span>
                  )}
                </div>
              );
            })}
          </div>

          {filteredLanguages.length === 0 && (
            <div className="text-center py-8 bg-gray-50 rounded-2xl">
              <p className="text-6xl mb-3">🤔</p>
              <p className="text-gray-600 font-bold text-lg">Hmm, I can&apos;t find that one...</p>
              <p className="text-gray-500 text-sm mt-1">Try typing something else! Maybe check the spelling? 📝</p>
            </div>
          )}

          {/* Legend - Kid-friendly explanation */}
          <div className="mt-6 p-4 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-2xl border-3 border-yellow-300 shadow-md">
            <h4 className="font-bold text-orange-700 mb-3 text-lg">🌟 What do the colors mean?</h4>
            <ul className="text-sm space-y-3">
              <li className="flex items-center gap-3 bg-white/50 p-2 rounded-xl">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300 text-purple-700 font-bold">
                  ⭐ Star
                </span>
                <span className="text-orange-700">= <strong>Super!</strong> I understand AND make games in this language! 🎮</span>
              </li>
              <li className="flex items-center gap-3 bg-white/50 p-2 rounded-xl">
                <span className="inline-flex px-3 py-1 rounded-lg bg-gray-100 border-2 border-gray-300 text-gray-700 font-bold">
                  Regular
                </span>
                <span className="text-orange-700">= <strong>Good!</strong> I understand you, but might answer in English 🗣️</span>
              </li>
            </ul>
          </div>

          {/* Fun message - Big and encouraging */}
          <div className="mt-6 p-4 bg-gradient-to-r from-green-100 to-emerald-100 rounded-2xl border-3 border-green-300 text-center">
            <p className="text-green-700 font-bold text-lg">
              🎤 Just talk to me like you talk to your friends!
            </p>
            <p className="text-green-600 text-sm mt-1">
              In Arabic, Spanish, Chinese, French, or any language you want! ✨
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render modal at document body level (full screen overlay)
  return createPortal(modalContent, document.body);
}

