"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, Loader2, X } from "lucide-react";

interface MicrophoneProps {
  onTranscript: (transcript: string) => void;
  isGenerating: boolean;
}

// Type definitions for Web Speech API
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function Microphone({
  onTranscript,
  isGenerating,
}: MicrophoneProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      !("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    ) {
      setIsSupported(false);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported || isGenerating) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setPermissionDenied(false);
      setTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      setTranscript(finalTranscript || interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setPermissionDenied(true);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, isGenerating]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);

      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    }
  }, [transcript, onTranscript]);

  const cancelListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      setIsListening(false);
      setTranscript("");
    }
  }, []);

  if (!isSupported) {
    return (
      <div className="text-center p-6 bg-yellow-50 rounded-2xl border-2 border-yellow-200">
        <p className="text-yellow-700 font-semibold">
          😢 Your browser doesn&apos;t support voice input!
        </p>
        <p className="text-yellow-600 text-sm mt-2">
          Try using Chrome or Edge for the best experience!
        </p>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="text-center p-6 bg-red-50 rounded-2xl border-2 border-red-200">
        <p className="text-red-700 font-semibold">
          🎤 Microphone permission needed!
        </p>
        <p className="text-red-600 text-sm mt-2">
          Please allow microphone access in your browser settings.
        </p>
        <button
          onClick={startListening}
          className="mt-4 btn-primary text-sm py-2 px-4"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Microphone and Cancel buttons */}
      <div className="flex items-center gap-4">
        {/* Cancel button - only shows when listening */}
        {isListening && (
          <button
            onClick={cancelListening}
            className="w-14 h-14 rounded-full flex items-center justify-center
              bg-gradient-to-br from-gray-400 to-gray-500 
              hover:from-gray-500 hover:to-gray-600 hover:scale-110
              transition-all duration-300 shadow-lg hover:shadow-xl"
            title="Cancel"
          >
            <X className="w-7 h-7 text-white" />
          </button>
        )}

        {/* Main microphone button */}
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isGenerating}
          className={`
            relative w-24 h-24 rounded-full flex items-center justify-center
            transition-all duration-300 
            ${
              isGenerating
                ? "bg-gray-300 cursor-not-allowed"
                : isListening
                ? "bg-gradient-to-br from-red-500 to-pink-600 mic-recording"
                : "bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 hover:scale-110"
            }
            shadow-lg hover:shadow-xl
          `}
        >
          {isGenerating ? (
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          ) : isListening ? (
            <MicOff className="w-10 h-10 text-white" />
          ) : (
            <Mic className="w-10 h-10 text-white" />
          )}
        </button>
      </div>

      {/* Status text */}
      <div className="text-center">
        {isGenerating ? (
          <p className="text-purple-600 font-bold text-lg animate-pulse">
            ✨ Creating your magic...
          </p>
        ) : isListening ? (
          <div>
            <p className="text-red-500 font-bold text-lg">
              🎤 I&apos;m listening!
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Tap mic to submit • Tap ✕ to cancel
            </p>
          </div>
        ) : (
          <p className="text-gray-600 font-semibold">
            👆 Tap to start talking!
          </p>
        )}
      </div>

      {/* Live transcript */}
      {(isListening || transcript) && !isGenerating && (
        <div className="w-full max-w-md p-4 bg-white/80 rounded-2xl shadow-inner">
          <p className="text-sm text-gray-500 mb-1">What I heard:</p>
          <p className="text-gray-800 font-medium min-h-[3rem]">
            {transcript || "..."}
          </p>
        </div>
      )}
    </div>
  );
}

