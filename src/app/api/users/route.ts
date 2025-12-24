import { prisma } from "@/lib/db";
import { generateRandomUsername } from "@/lib/user";
import { NextResponse } from "next/server";

// POST - Create a new user with random username
export async function POST() {
  try {
    // Generate a unique username
    let username = generateRandomUsername();
    let attempts = 0;
    
    while (attempts < 10) {
      const existing = await prisma.user.findUnique({
        where: { username },
      });
      
      if (!existing) break;
      
      username = generateRandomUsername();
      attempts++;
    }
    
    const user = await prisma.user.create({
      data: { username },
    });
    
    return NextResponse.json(user);
  } catch (error) {
    console.error("Failed to create user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}

