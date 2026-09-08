import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';
import { toolFunctionName } from '../types';

interface OpenAiMessage { role: string; content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string }

export async function runOpenAiCompatConversation(baseUrl: string | undefined, apiKey: string | undefined, model: string, messages: ChatMessage[], systemPrompt: string, tools: McpTool[], callTool: ToolCaller): Promise<ChatTurnResult> {
  if (!baseUrl) return { reply: 'ยังไม่ได้ตั้งค่า OPENAI_COMPAT_BASE_URL จึงยังใช้งาน gateway นี้ไม่ได้', toolTrace: [] };
  if (!apiKey) return { reply: 'ยังไม่ได้ตั้งค่า API key ของ provider ที่เลือก จึงยังใช้งานไม่ได้', toolTrace: [] };
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const conversation: OpenAiMessage[] = [{ role: 'system', content: systemPrompt }, ...messages.map((message) => ({ role: message.role, content: message.content }))];
  const trace: ToolTraceEntry[] = [];
  const apiTools = tools.length ? tools.map((tool) => ({ type: 'function', function: { name: toolFunctionName(tool.serverId, tool.name), description: tool.description, parameters: tool.inputSchema } })) : undefined;
  for (let round = 0; round < 4; round += 1) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: conversation, ...(apiTools ? { tools: apiTools, tool_choice: 'auto' } : {}) }) });
    if (!response.ok) return { reply: `เรียก AI provider ไม่สำเร็จ (${response.status}) กรุณาตรวจสอบการตั้งค่า`, toolTrace: trace };
    const data = await response.json() as { choices?: Array<{ message?: OpenAiMessage }> };
    const message = data.choices?.[0]?.message;
    if (!message) return { reply: 'AI provider ไม่ได้ส่งข้อความตอบกลับ', toolTrace: trace };
    conversation.push(message);
    if (!message.tool_calls?.length) return { reply: message.content?.trim() || 'โมเดลไม่ได้ส่งข้อความตอบกลับ', toolTrace: trace };
    for (const toolCall of message.tool_calls) {
      const separator = toolCall.function.name.indexOf('__');
      const serverId = separator >= 0 ? toolCall.function.name.slice(0, separator) : '';
      const toolName = separator >= 0 ? toolCall.function.name.slice(separator + 2) : toolCall.function.name;
      let args: Record<string, unknown>;
      try { args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>; } catch { args = {}; }
      try { const result = await callTool(serverId, toolName, args); trace.push({ serverId, toolName, arguments: args, result }); conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) }); }
      catch (error) { const messageText = error instanceof Error ? error.message : 'เรียกเครื่องมือไม่สำเร็จ'; trace.push({ serverId, toolName, arguments: args, error: messageText }); conversation.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: messageText }) }); }
    }
  }
  return { reply: 'โมเดลเรียกเครื่องมือเกินจำนวนรอบที่กำหนด', toolTrace: trace };
}