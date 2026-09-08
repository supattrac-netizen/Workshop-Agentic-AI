import type { Env } from '../env';
import { errorJson, json } from '../lib/http';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';
import type { ChatMessage, ChatProvider, ChatTurnResult, McpTool, ToolCaller } from './types';

interface ChatRequestBody {
  message?: unknown;
  history?: unknown;
  provider?: unknown;
  model?: unknown;
}

export function buildSystemPrompt(): string {
  return 'คุณคือผู้ช่วย AI ภาษาไทยที่สุภาพ กระชับ และช่วยผู้ใช้แก้ปัญหาอย่างเป็นประโยชน์ หากไม่แน่ใจให้บอกตามตรง';
}

export function resolveProvider(value: unknown, env: Env): ChatProvider {
  const candidate = value ?? env.DEFAULT_CHAT_PROVIDER ?? 'gemini';
  return candidate === 'openai' || candidate === 'openai-compat' ? candidate : 'gemini';
}

export function defaultModelFor(provider: ChatProvider, env: Env): string {
  if (provider === 'gemini') return env.GEMINI_MODEL || 'gemini-flash-latest';
  if (provider === 'openai') return env.OPENAI_MODEL || 'gpt-4o-mini';
  return env.OPENAI_COMPAT_MODEL || 'gpt-4o-mini';
}

export function resolveApiKey(env: Env, provider: ChatProvider): string | undefined {
  if (provider === 'gemini') return env.GEMINI_API_KEY;
  if (provider === 'openai') return env.OPENAI_API_KEY;
  return env.OPENAI_COMPAT_API_KEY;
}

export function resolveBaseUrl(env: Env, provider: ChatProvider): string | undefined {
  return provider === 'openai' ? 'https://api.openai.com/v1' : provider === 'openai-compat' ? env.OPENAI_COMPAT_BASE_URL : undefined;
}

export async function resolveTools(): Promise<{ tools: McpTool[]; callTool: ToolCaller }> {
  return { tools: [], callTool: async () => { throw new Error('ยังไม่มี MCP tools ในโมดูลนี้'); } };
}

function validHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChatMessage => Boolean(item) && typeof item === 'object' && ((item as ChatMessage).role === 'user' || (item as ChatMessage).role === 'assistant') && typeof (item as ChatMessage).content === 'string').slice(-50);
}

export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('ต้องใช้เมธอด POST', 405);
  let body: ChatRequestBody;
  try { body = await request.json() as ChatRequestBody; } catch { return errorJson('รูปแบบ JSON ไม่ถูกต้อง', 400); }
  if (typeof body.message !== 'string' || !body.message.trim()) return errorJson('กรุณาระบุ message เป็นข้อความที่ไม่ว่าง', 400);
  const provider = resolveProvider(body.provider, env);
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModelFor(provider, env);
  const messages: ChatMessage[] = [...validHistory(body.history), { role: 'user', content: body.message.trim() }];
  const { tools, callTool } = await resolveTools();
  let result: ChatTurnResult;
  try {
    result = await runChatTurn({ env, provider, model, messages, tools, callTool });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'ไม่สามารถเชื่อมต่อ provider ได้';
    result = { reply: `เกิดข้อผิดพลาดในการเชื่อมต่อ AI provider: ${detail}`, toolTrace: [] };
  }
  return json({ reply: result.reply, provider, model, toolTrace: result.toolTrace });
}

export async function runChatTurn(options: { env: Env; provider: ChatProvider; model: string; messages: ChatMessage[]; tools: McpTool[]; callTool: ToolCaller }): Promise<ChatTurnResult> {
  const { env, provider, model, messages, tools, callTool } = options;
  if (provider === 'gemini') return runGeminiConversation(resolveApiKey(env, provider), model, messages, buildSystemPrompt(), tools, callTool);
  return runOpenAiCompatConversation(resolveBaseUrl(env, provider), resolveApiKey(env, provider), model, messages, buildSystemPrompt(), tools, callTool);
}