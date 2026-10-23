import type { Metadata } from "next";
import { SharedProjectPlayer } from "@/components/demo/SharedProjectPlayer";
import "../demo.css";

export const metadata: Metadata = {
  title: "Play a shared creation | VibeKidding",
  description: "Open a shared VibeKidding project and choose when to play.",
};

export default function SharedPlayPage() {
  return <SharedProjectPlayer />;
}
