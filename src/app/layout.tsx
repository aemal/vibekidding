import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/lib/UserContext";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "VibeKidding 🎨 - Create Magic with Your Voice!",
  description:
    "A fun coding playground for kids! Just speak and watch your ideas come to life!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} antialiased`}>
        <UserProvider>
          {/* Decorative blobs */}
          <div
            className="decoration-blob"
            style={{
              width: "400px",
              height: "400px",
              background: "linear-gradient(135deg, #fd79a8, #a29bfe)",
              top: "-100px",
              right: "-100px",
            }}
          />
          <div
            className="decoration-blob"
            style={{
              width: "300px",
              height: "300px",
              background: "linear-gradient(135deg, #55efc4, #74b9ff)",
              bottom: "-50px",
              left: "-50px",
            }}
          />
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
