import Link from "next/link";
import { headers } from "next/headers";
import Studio from "@/components/Studio";
import { DemoWorkspace } from "@/components/demo/DemoWorkspace";
import { localStudioEnabled } from "@/lib/demo-server/local-studio";
import "./demo/demo.css";

export default async function HomePage() {
  if (localStudioEnabled(await headers(), process.env)) {
    return <>
      <aside aria-label="Local studio mode" style={{ position: "relative", zIndex: 1, padding: "12px 20px", background: "#ede9fe", color: "#312e81", textAlign: "center" }}>
        <strong>Local studio - no sign-in needed.</strong>{" "}
        Projects save in this browser. Account administration, cloud sync and publishing are unavailable in this mode.{" "}
        <Link href="/account-studio" style={{ textDecoration: "underline" }}>Open account studio</Link>
      </aside>
      <DemoWorkspace />
    </>;
  }
  return <Studio />;
}
