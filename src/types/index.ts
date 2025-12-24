export interface User {
  id: string;
  username: string;
  createdAt: string;
  gameCount?: number;
  totalLikes?: number;
}

export interface Project {
  id: string;
  name: string;
  emoji: string;
  htmlContent: string;
  prompt: string;
  playCount: number;
  createdAt: string;
  updatedAt: string;
  creatorId: string;
  creator?: User;
  likeCount?: number;
  isLikedByUser?: boolean;
  isOwner?: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  emoji: string;
  prompt: string;
  playCount: number;
  createdAt: string;
  updatedAt: string;
  creatorId: string;
  creator: User;
  likeCount: number;
  isLikedByUser: boolean;
  isOwner: boolean;
}

export interface Version {
  id: string;
  prompt: string;
  createdAt: string;
}

export interface LeaderboardGame {
  id: string;
  name: string;
  emoji: string;
  playCount: number;
  likeCount: number;
  createdAt: string;
  creator: User;
}

export interface LeaderboardBuilder {
  id: string;
  username: string;
  gameCount: number;
  totalLikes: number;
  totalPlays: number;
}
