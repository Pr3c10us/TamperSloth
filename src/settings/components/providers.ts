export type Provider = {
  id: string;
  name: string;
  link: string;
  logo: string;
};

export const PROVIDERS_PRIMARY: Provider[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    link: "console.anthropic.com",
    logo: "A",
  },
  {
    id: "openai",
    name: "OpenAI ChatGPT",
    link: "platform.openai.com",
    logo: "O",
  },
  {
    id: "google",
    name: "Google Gemini",
    link: "aistudio.google.com",
    logo: "G",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    link: "platform.deepseek.com",
    logo: "D",
  },
];