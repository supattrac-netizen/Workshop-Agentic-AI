const state = { history: [] };
const messages = document.querySelector('#messages');
const form = document.querySelector('#form');
const input = document.querySelector('#message');
const provider = document.querySelector('#provider');
const model = document.querySelector('#model');

function render() {
  messages.replaceChildren(...state.history.map((item) => {
    const el = document.createElement('div');
    el.className = `bubble ${item.role}`;
    el.textContent = item.content;
    return el;
  }));
  messages.scrollTop = messages.scrollHeight;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  state.history.push({ role: 'user', content: message });
  input.value = '';
  render();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, history: state.history.slice(0, -1), provider: provider.value, model: model.value.trim() || undefined }) });
    const data = await response.json();
    const reply = typeof data.reply === 'string' ? data.reply : (data.error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
    state.history.push({ role: 'assistant', content: reply });
  } catch (error) {
    state.history.push({ role: 'assistant', content: 'เชื่อมต่อ backend ไม่สำเร็จ กรุณาลองใหม่' });
  } finally { button.disabled = false; render(); input.focus(); }
});

render();