"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getUserId, getOrCreateUser } from "@/lib/user";

export default function FullPreview() {
  const params = useParams();
  const projectId = params.id as string;
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const response = await fetch(`/api/preview/${projectId}`);
        if (response.ok) {
          const html = await response.text();
          setHtmlContent(html);
        } else {
          setError(true);
        }
      } catch (e) {
        console.error("Failed to fetch preview:", e);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreview();
  }, [projectId]);

  // Record play
  useEffect(() => {
    const recordPlay = async () => {
      try {
        let userId = getUserId();
        if (!userId) {
          userId = await getOrCreateUser();
        }
        
        await fetch(`/api/projects/${projectId}/play`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
      } catch (e) {
        console.error("Failed to record play:", e);
      }
    };

    recordPlay();
  }, [projectId]);

  useEffect(() => {
    if (htmlContent) {
      document.open();
      document.write(htmlContent);
      document.close();
    }
  }, [htmlContent]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "60px",
              animation: "spin 1s linear infinite",
            }}
          >
            ⭐
          </div>
          <p style={{ color: "#6c5ce7", fontWeight: "bold", marginTop: "20px" }}>
            Loading your creation...
          </p>
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "80px" }}>🔍</div>
          <h1 style={{ color: "#d63031", marginTop: "20px" }}>
            Oops! Creation not found!
          </h1>
          <p style={{ color: "#636e72" }}>
            This creation might have been deleted or doesn&apos;t exist.
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "20px",
              padding: "12px 24px",
              background: "#6c5ce7",
              color: "white",
              borderRadius: "20px",
              textDecoration: "none",
              fontWeight: "bold",
            }}
          >
            Go Back Home
          </a>
        </div>
      </div>
    );
  }

  return null;
}
