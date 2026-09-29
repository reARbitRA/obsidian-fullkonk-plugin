// src/templates.ts
//
// System prompts driving each pipeline stage, plus the "showcase" prompt
// gallery shown above the chat input to help users get started quickly.

export type SystemPromptKey = "architect" | "frontend" | "backend" | "verify";

export const SYSTEM_PROMPTS: Record<SystemPromptKey, string> = {
  architect: `You are a senior software architect.
Given a product idea, design the complete system before any code is written.

Output this structure exactly:

## OVERVIEW
## TECH STACK (specific versions)
## COMPONENT TREE (ASCII)
## API CONTRACT (every endpoint: method, path, request, response)
## DATABASE SCHEMA (complete)
## FILE STRUCTURE (complete tree)
## KEY DECISIONS

Be specific. No vague answers. Output the plan only — no code yet.`,

  frontend: `You are a senior frontend engineer.
Write complete, production-ready React TypeScript code.
Stack: React 19, TypeScript strict, Tailwind CSS, Framer Motion.
Rules:
- Complete files only — no truncation, no ellipsis
- Every component fully typed
- All errors handled with user feedback
- Responsive and accessible
- Mark each file with its path as a comment on line one: // path/to/File.tsx`,

  backend: `You are a senior backend engineer.
Write complete, production-ready TypeScript server code.

Stack: Express 5, TypeScript strict, Zod validation.
Rules:
- Validate ALL inputs with Zod before processing
- Return consistent shape: { data?, error?, message? }
- Handle all errors with correct HTTP status codes
- Mark each file with its path as a comment on line one: // path/to/file.ts`,

  verify: `You are a principal engineer doing integration review.

Check:
1. API call signatures in frontend match route definitions in backend
2. TypeScript types consistent across both
3. All imports reference files that exist
4. Auth tokens attached to all authenticated requests
5. Field name consistency (no camelCase vs snake_case drift)

List every issue found.
Output corrected complete files for everything broken.
Mark each file with path comment on line one.`,
};

export interface ShowcaseTemplate {
  id: string;
  name: string;
  tag: string;
  description: string;
  accent: string;
  prompt: string;
}

export const SHOWCASE_TEMPLATES: ShowcaseTemplate[] = [
  {
    id: "prompt-autopsy",
    name: "Prompt Autopsy",
    tag: "AI TOOLS",
    description: "Dissect any prompt. Score it. Rewrite it.",
    accent: "#FF003C",
    prompt:
      "Build Prompt Autopsy: takes any AI prompt as input and returns scored analysis on 6 dimensions: role definition, output format, edge case handling, constraint clarity, few-shot examples, tone. Show failure vectors — specific ways this prompt will break. Generate improved version. Send to 3 providers and compare outputs. Stack: React 19, Express 5.",
  },
  {
    id: "git-archaeologist",
    name: "Git Archaeologist",
    tag: "DEV TOOLS",
    description: "Map the hidden history of any codebase.",
    accent: "#FFD700",
    prompt:
      "Build Git Archaeologist: accepts GitHub repo URL and token. Fetch commit history via GitHub API. Identify: zombie code untouched 6+ months, ghost owners who left, bug attractor files with most patches, velocity map by directory. Visualize with D3 heat map. Export report. Stack: React 19, Express 5.",
  },
  {
    id: "chaos-merchant",
    name: "Chaos Merchant",
    tag: "TESTING",
    description: "Break your system before production does.",
    accent: "#FF6B00",
    prompt:
      "Build Chaos Merchant: accepts API base URL. Runs 4 chaos campaigns: payload flood to find breaking point, malformed input barrage to find unhandled exceptions, latency injection, memory pressure test. Real-time dashboard showing live metrics during attack. Stack: React 19, Express 5.",
  },
  {
    id: "contract-ghost",
    name: "Contract Ghost",
    tag: "CODE GEN",
    description: "Any API docs → full TypeScript client instantly.",
    accent: "#9B00FF",
    prompt:
      "Build Contract Ghost: accepts any API documentation URL. Scrapes and parses docs. Generates: full TypeScript client class, Zod schemas for every endpoint, realistic mock data, error handler classes, TypeScript interfaces. Display as file tree. Stack: React 19, Express 5.",
  },
  {
    id: "interrogator",
    name: "The Interrogator",
    tag: "HIRING",
    description: "Technical interviews that test real depth.",
    accent: "#00FF88",
    prompt:
      "Build The Interrogator: user specifies role and stack. AI generates adaptive interview questions with follow-ups. Real-time scoring on 5 dimensions. Session ends with detailed report: strengths, weaknesses, study plan. Export PDF. Stack: React 19, Express 5.",
  },
  {
    id: "signal-noise",
    name: "Signal / Noise",
    tag: "PRODUCTIVITY",
    description: "Your personal dev news filter. Zero noise.",
    accent: "#00DDFF",
    prompt:
      "Build Signal/Noise: user defines their stack. Aggregate from Hacker News API, GitHub trending, Reddit r/programming, npm releases. Score each item for stack relevance. Show only relevant items tiered as critical, important, fyi. Refresh every 6 hours. Stack: React 19, Express 5.",
  },
];
