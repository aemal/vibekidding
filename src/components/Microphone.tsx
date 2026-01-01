"use client";

import { useState, useCallback, useRef } from "react";
import { Mic, MicOff, Loader2, X, Globe } from "lucide-react";
import LanguagesModal from "./LanguagesModal";

interface MicrophoneProps {
  onTranscript: (transcript: string) => void;
  isGenerating: boolean;
}

export default function Microphone({
  onTranscript,
  isGenerating,
}: MicrophoneProps) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [showLanguagesModal, setShowLanguagesModal] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startListening = useCallback(async () => {
    if (isGenerating) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermissionDenied(false);

      // Create MediaRecorder with webm format (widely supported)
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsListening(true);
        setLiveTranscript("");
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        // Only transcribe if we have audio data
        if (audioBlob.size > 0) {
          try {
            const formData = new FormData();
            formData.append("audio", audioBlob, "recording.webm");

            const response = await fetch("/api/transcribe", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              throw new Error("Transcription failed");
            }

            const data = await response.json();
            const transcript = data.text?.trim();

            if (transcript) {
              setLiveTranscript(transcript);
              onTranscript(transcript);
            } else {
              setLiveTranscript("(no speech detected)");
            }
          } catch (error) {
            console.error("Transcription error:", error);
            setLiveTranscript("(transcription failed)");
          }
        }

        setIsTranscribing(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
    } catch (error) {
      console.error("Microphone access error:", error);
      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError")
      ) {
        setPermissionDenied(true);
      }
    }
  }, [isGenerating, onTranscript]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
    }
  }, [isListening]);

  const cancelListening = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      // Clear chunks before stopping to prevent transcription
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
    }

    // Stop the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setIsListening(false);
    setLiveTranscript("");
  }, [isListening]);

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
          disabled={isGenerating || isTranscribing}
          className={`
            relative w-24 h-24 rounded-full flex items-center justify-center
            transition-all duration-300 
            ${
              isGenerating || isTranscribing
                ? "bg-gray-300 cursor-not-allowed"
                : isListening
                ? "bg-gradient-to-br from-red-500 to-pink-600 mic-recording"
                : "bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 hover:scale-110"
            }
            shadow-lg hover:shadow-xl
          `}
        >
          {isGenerating || isTranscribing ? (
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
        ) : isTranscribing ? (
          <p className="text-blue-600 font-bold text-lg animate-pulse">
            🎧 Processing your voice...
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
      {(isListening || liveTranscript || isTranscribing) && !isGenerating && (
        <div className="w-full max-w-md p-4 bg-white/80 rounded-2xl shadow-inner">
          <p className="text-sm text-gray-500 mb-1">What I heard:</p>
          <p className="text-gray-800 font-medium min-h-[3rem]">
            {isTranscribing
              ? "Processing..."
              : isListening
              ? "Recording..."
              : liveTranscript || "..."}
          </p>
        </div>
      )}

      {/* Language hint - Subtle but discoverable */}
      <button
        onClick={() => setShowLanguagesModal(true)}
        className="flex items-center gap-1.5 mt-3 px-3 py-1.5 
          text-gray-500 hover:text-purple-600 
          text-sm rounded-full hover:bg-purple-50
          transition-all duration-200"
      >
        <Globe size={14} />
        <span>Speak in any language</span>
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
