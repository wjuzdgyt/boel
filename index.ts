// pages/api/webhook.ts
import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// تعریف type ها
interface TelegramUpdate {
  message?: {
    from: {
      id: number;
    };
    chat: {
      id: number;
    };
    text?: string;
  };
}

interface GeminiResponse {
  candidates?: [{
    content: {
      parts: [{
        text: string;
      }];
    };
  }];
}

class GeminiAPI {
  private gemini_api_key: string;
  private gemini_api_url: string;

  constructor(api_key: string) {
    this.gemini_api_key = api_key;
    this.gemini_api_url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.gemini_api_key}`;
  }

  private review_request(system: string, text: string) {
    return {
      system_instruction: {
        parts: [
          { text: system }
        ]
      },
      contents: [
        {
          parts: [
            { text }
          ]
        }
      ],
      safetySettings: [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE"
        }
      ]
    };
  }

  async talk(system: string, prompt: string): Promise<string> {
    const request_body = this.review_request(system, prompt);

    try {
      const response = await axios.post<GeminiResponse>(
        this.gemini_api_url,
        request_body,
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("Invalid response from Gemini API");
      }

      return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
      throw new Error(`Gemini API Error: ${error.message}`);
    }
  }
}

// Telegram Bot functions
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "YOUR_BOT_TOKEN";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";

async function sendTelegramMessage(
  chat_id: number,
  text: string,
  keyboard: any = null
) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const data = {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard
  };

  try {
    await axios.post(url, data);
  } catch (error) {
    console.error('Telegram API Error:', error);
  }
}

// API Route handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const update: TelegramUpdate = req.body;
  if (!update.message) {
    return res.status(200).end();
  }

  const { 
    from: { id: from_id }, 
    chat: { id: chat_id }, 
    text 
  } = update.message;

  if (!text) {
    return res.status(200).end();
  }

  // Handle /start command
  if (text === '/start') {
    await sendTelegramMessage(chat_id, "به ربات خوش آمدید.");
    return res.status(200).end();
  }

  // Store messages in Vercel KV or another database instead of file system
  // Here's a simplified version without message history
  try {
    const gemini = new GeminiAPI(GEMINI_API_KEY);
    const ai_response = await gemini.talk("", text);
    await sendTelegramMessage(chat_id, ai_response);
  } catch (error) {
    console.error('Error:', error);
    await sendTelegramMessage(chat_id, "خطایی در پردازش درخواست شما رخ داد.");
  }

  res.status(200).end();
}

// Configure API route to handle raw body
export const config = {
  api: {
    bodyParser: true,
  },
};
