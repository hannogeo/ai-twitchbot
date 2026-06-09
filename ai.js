import Groq from 'groq-sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';

const SEARCH_DECISION_PROMPT = `You are a classifier. Decide if the user's chat message requires a web search for current information.
- If it's a casual greeting, small talk, opinion, or simple question that doesn't need current data, reply with "NO".
- If it asks about news, events, facts, prices, weather, or any time-sensitive information, reply with "YES".
Only reply with "YES" or "NO".`;

const SEARCH_QUERY_PROMPT = `Create a concise 3-6 word search query based on the user's question. Only output the query, nothing else.`;

const SPAM_DOMAINS = ['crazygames', 'worldguessr', 'openguessr', 'geoguesser-free'];

export class AIModule {
  constructor(apiKeys) {
    this.keys = Array.isArray(apiKeys) ? apiKeys.filter(Boolean) : [];
    this.clients = this.keys.map(k => (k ? new Groq({ apiKey: k }) : null));
    this.currentKeyIndex = 0;
    this.conversationHistory = [];
    this.maxHistory = 10;
  }

  setApiKeys(apiKeys) {
    this.keys = Array.isArray(apiKeys) ? apiKeys.filter(Boolean) : [];
    this.clients = this.keys.map(k => (k ? new Groq({ apiKey: k }) : null));
    this.currentKeyIndex = 0;
    this.conversationHistory = [];
  }

  async callWithRotation(fn) {
    if (this.clients.length === 0) return null;
    const startIndex = this.currentKeyIndex;
    for (let i = 0; i < this.clients.length; i++) {
      const index = (startIndex + i) % this.clients.length;
      const client = this.clients[index];
      if (!client) continue;
      try {
        const result = await fn(client);
        this.currentKeyIndex = index;
        return result;
      } catch (e) {
        if (e.status === 429 && this.clients.length > 1) {
          continue;
        }
        throw e;
      }
    }
    throw new Error('All API keys rate limited');
  }

  async searchWeb(query) {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 8000,
      });

      const $ = cheerio.load(data);
      const results = [];

      $('.result').each((i, el) => {
        if (results.length >= 5) return;
        const title = $(el).find('.result__title').text().trim();
        const snippet = $(el).find('.result__snippet').text().trim();
        const link = $(el).find('.result__url').attr('href') || '';
        if (title && snippet && !SPAM_DOMAINS.some(d => title.includes(d) || link.includes(d))) {
          const existing = results.some(r => r.title === title && r.body === snippet);
          if (!existing) results.push({ title, body: snippet, link });
        }
      });

      return results;
    } catch (e) {
      console.error('Web search error:', e.message);
      return [];
    }
  }

  async getGroqResponse(messages, maxTokens = 300, temperature = 0.6) {
    try {
      return await this.callWithRotation(async (client) => {
        const completion = await client.chat.completions.create({
          messages,
          model: 'llama-3.3-70b-versatile',
          max_tokens: maxTokens,
          temperature,
        });
        return completion.choices[0]?.message?.content?.trim() || null;
      });
    } catch (e) {
      if (e.message === 'All API keys rate limited') {
        console.error('All Groq API keys rate limited');
      } else {
        console.error('Groq API error:', e.message);
      }
      return null;
    }
  }

  async quickGroqResponse(systemPrompt, userMessage, maxTokens = 10, temperature = 0.0) {
    const model = 'llama-3.1-8b-instant';
    try {
      return await this.callWithRotation(async (client) => {
        const completion = await client.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          model,
          max_tokens: maxTokens,
          temperature,
        });
        return completion.choices[0]?.message?.content?.trim() || null;
      });
    } catch (e) {
      if (e.message === 'All API keys rate limited') {
        console.error('All Groq API keys rate limited (quick)');
      } else {
        console.error('Groq quick API error:', e.message);
      }
      return null;
    }
  }

  addToHistory(role, content) {
    this.conversationHistory.push({ role, content });
    if (this.conversationHistory.length > this.maxHistory * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory * 2);
    }
  }

  async getAIResponse(userMessage, speakerUsername, systemInstruction = '', chatterContext = {}) {
    if (this.clients.length === 0 || this.clients.every(c => !c)) {
      return 'AI Error: Groq API key not set.';
    }

    try {
      const needsSearch = await this.quickGroqResponse(SEARCH_DECISION_PROMPT, userMessage);
      let webResults = [];
      let searchQuery = null;

      if (needsSearch === 'YES') {
        searchQuery = await this.quickGroqResponse(SEARCH_QUERY_PROMPT, userMessage, 64);
        if (searchQuery) {
          webResults = await this.searchWeb(searchQuery);
        }
      }

      const systemParts = [];
      if (systemInstruction) {
        systemParts.push(systemInstruction);
      }

      const senderLower = speakerUsername?.toLowerCase();
      if (chatterContext && senderLower && chatterContext[senderLower]) {
        systemParts.push(`Context about ${speakerUsername}: ${chatterContext[senderLower]}`);
      }

      if (webResults.length > 0) {
        const webContext = webResults.map((r, i) =>
          `[${i + 1}] "${r.title}": ${r.body}`
        ).join('\n');
        systemParts.push(`Web search results for "${searchQuery}":\n${webContext}`);
      }

      systemParts.push('Be natural and concise. Keep responses under 300 characters when possible.');

      const messages = [
        { role: 'system', content: systemParts.join('\n\n') },
        ...this.conversationHistory,
        { role: 'user', content: userMessage },
      ];

      const response = await this.getGroqResponse(messages);
      if (!response) return 'AI Error: Failed to generate response.';

      this.addToHistory('user', userMessage);
      this.addToHistory('assistant', response);

      return response;
    } catch (e) {
      console.error('AI module error:', e.message);
      return 'AI Error: An unexpected error occurred.';
    }
  }
}
