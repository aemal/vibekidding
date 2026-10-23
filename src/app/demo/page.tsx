import type { Metadata } from "next";
import { DemoWorkspace } from "@/components/demo/DemoWorkspace";
import "./demo.css";

export const metadata: Metadata = {
  title: "Your idea workshop | VibeKidding demo",
  description: "Create a little game, a story, or a world of your own. A browser-saved demo for curious kids and their grown-ups.",
};

export default function DemoPage() {
  return <DemoWorkspace />;
}
