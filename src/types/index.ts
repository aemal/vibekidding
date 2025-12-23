export interface Project {
  id: string;
  name: string;
  emoji: string;
  htmlContent: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  emoji: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  id: string;
  prompt: string;
  createdAt: string;
}

