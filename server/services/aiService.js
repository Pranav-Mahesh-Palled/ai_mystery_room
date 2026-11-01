import { generateMystery as generateGeminiMystery, MysteryGenerationError } from './geminiService.js';
import { generateMystery as generateOpenAIMystery } from './openaiService.js';

export { MysteryGenerationError };

export function getAIProvider() {
  const provider = (process.env.AI_PROVIDER ?? 'gemini').trim().toLowerCase();
  if (provider !== 'gemini' && provider !== 'openai') {
    throw new MysteryGenerationError('AI_PROVIDER_UNSUPPORTED', 'AI_PROVIDER must be either gemini or openai.', 503);
  }
  return provider;
}

export function createAIService({ gemini = generateGeminiMystery, openai = generateOpenAIMystery, getProvider = getAIProvider } = {}) {
  return {
    generateMystery(input, options) {
      const provider = getProvider();
      return provider === 'gemini' ? gemini(input, options) : openai(input, options);
    },
  };
}

export const generateMystery = createAIService().generateMystery;
