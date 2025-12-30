// Random adjectives and nouns for generating fun usernames
const adjectives = [
  "Happy", "Cosmic", "Electric", "Magic", "Pixel", "Neon", "Cyber", "Turbo",
  "Mega", "Super", "Ultra", "Hyper", "Astro", "Rocket", "Thunder", "Crystal",
  "Golden", "Silver", "Rainbow", "Starry", "Speedy", "Lucky", "Epic", "Mystic",
  "Funky", "Groovy", "Jazzy", "Zippy", "Bouncy", "Sparkly", "Glowing", "Swift",
  "Brave", "Clever", "Mighty", "Noble", "Fancy", "Snazzy", "Cosmic", "Dazzle",
];

const nouns = [
  "Coder", "Gamer", "Wizard", "Ninja", "Pirate", "Dragon", "Phoenix", "Unicorn",
  "Tiger", "Panda", "Fox", "Wolf", "Eagle", "Falcon", "Lion", "Bear",
  "Knight", "Hero", "Champion", "Star", "Comet", "Galaxy", "Planet", "Moon",
  "Robot", "Alien", "Captain", "Pilot", "Explorer", "Builder", "Creator", "Maker",
  "Artist", "Genius", "Master", "Legend", "Ace", "Champ", "Warrior", "Guardian",
];

const numbers = ["42", "99", "007", "123", "777", "888", "360", "101", "404", "808", ""];

export function generateRandomUsername(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = numbers[Math.floor(Math.random() * numbers.length)];
  return `${adjective}${noun}${number}`;
}

const USER_ID_KEY = "vibekidding_user_id";

export function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_ID_KEY);
}

export function setUserId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_ID_KEY, id);
}

// Get or create user - returns the user ID
export async function getOrCreateUser(): Promise<string> {
  const userId = getUserId();
  
  if (userId) {
    // Verify the user exists in the database (or is a special user handled by API)
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (response.ok) {
        return userId;
      }
      // If 404, user doesn't exist - will create a new one below
    } catch (e) {
      console.error("Failed to verify user:", e);
    }
  }
  
  // Create a new user
  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    
    if (response.ok) {
      const user = await response.json();
      setUserId(user.id);
      return user.id;
    }
  } catch (e) {
    console.error("Failed to create user:", e);
  }
  
  throw new Error("Failed to get or create user");
}


