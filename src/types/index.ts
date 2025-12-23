export interface Project {
  id: string;
  name: string;
  htmlContent: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  id: string;
  prompt: string;
  createdAt: string;
}

