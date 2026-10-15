import type {ProviderId} from "@/src/chat/lib/provider";

export type Provider = {
  id: ProviderId;
  name: string;
  link: string;
};

export const PROVIDERS_PRIMARY: Provider[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    link: "console.anthropic.com",
  },
  {
    id: "openai",
    name: "OpenAI ChatGPT",
    link: "platform.openai.com",
  },
  {
    id: "google",
    name: "Google Gemini",
    link: "aistudio.google.com",
  },
  {
    id: "vertex",
    name: "Google Vertex AI",
    link: "cloud.google.com/vertex-ai",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    link: "platform.deepseek.com",
  },
];
