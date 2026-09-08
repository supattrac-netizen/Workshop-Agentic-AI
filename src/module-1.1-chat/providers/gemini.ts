import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';
import { toGeminiSchema } from '../tool-schema';

interface GeminiPart { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } }
interface GeminiContent { role?: string; parts: GeminiPart[] }

export async function runGeminiConversation(
  apiKey: string | undefined,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  tools: McpTool[],
  callTool: ToolCaller,
): Promise<ChatTurnResult> {
  if (!apiKey) return { reply: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY จึงยังใช้งาน Gemini ไม่ได้', toolTrace: [] };
  const contents: GeminiContent[] = messages.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  const trace: ToolTraceEntry[] = [];
  const toolDeclarations = tools.length ? [{ functionDeclarations: tools.map((tool) => ({ name: `${tool.serverId}__${tool.name}`, description: tool.description, parameters: toGeminiSchema(tool.inputSchema) })) }] : [];

  for (let round = 0; round < 4; round += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents, ...(toolDeclarations.length ? { tools: toolDeclarations } : {}) }),
    });
    if (!response.ok) return { reply: `เรียก Gemini ไม่สำเร็จ (${response.status}) กรุณาตรวจสอบ API key และชื่อโมเดล`, toolTrace: trace };
    const data = await response.json() as { candidates?: Array<{ content?: GeminiContent }> };
    const content = data.candidates?.[0]?.content;
    const parts = content?.parts ?? [];
    const calls = parts.filter((part) => part.functionCall?.name);
    if (!calls.length) return { reply: parts.map((part) => part.text ?? '').join('').trim() || 'โมเดลไม่ได้ส่งข้อความตอบกลับ', toolTrace: trace };
    contents.push({ role: 'model', parts });
    const responses: GeminiPart[] = [];
    for (const part of calls) {
      const call = part.functionCall!;
      const separator = call.name.indexOf('__');
      const serverId = separator >= 0 ? call.name.slice(0, separator) : '';
      const toolName = separator >= 0 ? call.name.slice(separator + 2) : call.name;
      const args = call.args ?? {};
      try {
        const result = await callTool(serverId, toolName, args);
        trace.push({ serverId, toolName, arguments: args, result });
        responses.push({ functionResponse: { name: call.name, response: result && typeof result === 'object' ? result as Record<string, unknown> : { result } } });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'เรียกเครื่องมือไม่สำเร็จ';
        trace.push({ serverId, toolName, arguments: args, error: message });
        responses.push({ functionResponse: { name: call.name, response: { error: message } } });
      }
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { reply: 'โมเดลเรียกเครื่องมือเกินจำนวนรอบที่กำหนด', toolTrace: trace };
}