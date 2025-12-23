"use client";

import { useEffect, useRef } from "react";

interface PreviewProps {
  htmlContent: string;
}

export default function Preview({ htmlContent }: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current && htmlContent) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;

      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
      }
    }
  }, [htmlContent]);

  if (!htmlContent) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl">
        <div className="text-center p-8">
          <div className="text-7xl mb-4 animate-bounce">🎨</div>
          <h3 className="text-2xl font-bold text-purple-600 mb-2">
            Ready to Create Magic!
          </h3>
          <p className="text-gray-500">
            Click the microphone and tell me what you want to build! ✨
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-full preview-frame"
      sandbox="allow-scripts allow-same-origin"
      title="Preview"
    />
  );
}

