export interface AIModel {
  providerID: string;
  modelID: string;
}

export interface ResearchPreferences {
  jobTypes: string[]; // ["remote", "hybrid", "onsite"]
  countries: string[]; // ["USA", "UK", "Canada"]
  skills: string[]; // ["React", "Node.js", "Python"]
  notes?: string; // Additional notes
  resumeContent?: string; // Extracted resume text
}
