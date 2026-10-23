import type { CSSProperties } from "react";
import { sandboxDocument } from "@/lib/studio/sandbox";

// Keep generated code isolated on every current studio surface.
// Deliberately do not accept arbitrary iframe props that could weaken this policy.
export function GeneratedPreview({ html, title, className, style }: {
  html: string;
  title: string;
  className?: string;
  style?: CSSProperties;
}) {
  return <iframe
    title={title}
    className={className}
    style={style}
    sandbox="allow-scripts"
    referrerPolicy="no-referrer"
    allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'; payment 'none'; usb 'none'; fullscreen 'none'"
    srcDoc={sandboxDocument(html)}
  />;
}
