// Power user ID - only accessible on the server side
// This ID grants special permissions like deleting any game and selecting featured games
export const POWER_USER_ID = "iamthemostpowerfuluser";

// Helper function to check if a user ID is the power user
export function isPowerUser(userId: string | null | undefined): boolean {
  return userId === POWER_USER_ID;
}

