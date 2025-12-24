"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getOrCreateUser, getUserId } from "./user";

interface UserContextType {
  userId: string | null;
  username: string | null;
  isLoading: boolean;
  gameCount: number;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  userId: null,
  username: null,
  isLoading: true,
  gameCount: 0,
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [gameCount, setGameCount] = useState(0);

  const fetchUserData = async (id: string) => {
    try {
      const response = await fetch(`/api/users/${id}`);
      if (response.ok) {
        const userData = await response.json();
        setUsername(userData.username);
        setGameCount(userData.gameCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch user data:", error);
    }
  };

  const initUser = async () => {
    try {
      const id = await getOrCreateUser();
      setUserId(id);
      await fetchUserData(id);
    } catch (error) {
      console.error("Failed to initialize user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    const id = getUserId();
    if (id) {
      await fetchUserData(id);
    }
  };

  useEffect(() => {
    initUser();
  }, []);

  return (
    <UserContext.Provider
      value={{ userId, username, isLoading, gameCount, refreshUser }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

