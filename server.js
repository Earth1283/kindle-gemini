require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.urlencoded({ extended: true }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-3.1-flash-lite',
  systemInstruction: 'Respond in plain text only. Do not use markdown formatting — no asterisks, no headers, no bullet dashes, no backticks, no bold or italic syntax.',
});

let messages = [];
let chat = model.startChat();

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function renderPage(msgs, error) {
  const msgHtml = msgs.length === 0
    ? '<p class="empty">No messages yet. Say something!</p>'
    : msgs.map(m => `
      <div class="${m.role === 'user' ? 'u' : 'a'}">
        <b>${m.role === 'user' ? 'You' : 'Gemini'}:</b> ${escapeHtml(m.text)}
      </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gemini Chat</title>
<style>
  body{font-family:Georgia,serif;max-width:580px;margin:0 auto;padding:8px;background:#fff;color:#000;font-size:16px}
  h1{font-size:1.1em;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #000}
  #chat{margin-bottom:12px}
  .u{margin:8px 0;padding:6px 8px;border-left:3px solid #000}
  .a{margin:8px 0;padding:6px 8px;border-left:3px solid #555;background:#f2f2f2}
  .empty{color:#555;font-style:italic}
  .err{border:1px solid #000;padding:6px;margin-bottom:8px;font-size:.9em}
  hr{border:none;border-top:1px solid #ccc;margin:10px 0}
  textarea{width:100%;box-sizing:border-box;height:70px;font-size:1em;font-family:Georgia,serif;border:1px solid #000;padding:4px;resize:vertical}
  .btns{margin-top:6px;display:flex;gap:8px}
  button{padding:8px 14px;font-size:1em;font-family:Georgia,serif;border:2px solid #000;cursor:pointer}
  .send{background:#000;color:#fff}
  .clear{background:#fff;color:#000}
</style>
</head>
<body>
<h1>Gemini Chat</h1>
<div id="chat">${msgHtml}</div>
${error ? `<p class="err"><b>Error:</b> ${escapeHtml(error)}</p>` : ''}
<hr>
<form method="POST" action="/">
  <textarea name="msg" placeholder="Type your message..." required autofocus></textarea>
  <div class="btns">
    <button class="send" type="submit">Send</button>
  </div>
</form>
<form method="POST" action="/clear" style="margin-top:6px">
  <button class="clear" type="submit">Clear chat</button>
</form>
</body>
</html>`;
}

app.get('/', (req, res) => {
  res.send(renderPage(messages, null));
});

app.post('/', async (req, res) => {
  const userText = (req.body.msg || '').trim();
  if (!userText) return res.redirect('/');

  messages.push({ role: 'user', text: userText });

  try {
    const result = await chat.sendMessage(userText);
    const aiText = result.response.text();
    messages.push({ role: 'model', text: aiText });
    res.send(renderPage(messages, null));
  } catch (err) {
    messages.pop();
    res.send(renderPage(messages, err.message));
  }
});

app.post('/clear', (req, res) => {
  messages = [];
  chat = model.startChat();
  res.redirect('/');
});

const PORT = 7891;
app.listen(PORT, () => {
  console.log(`Kindle Gemini Chat → http://localhost:${PORT}`);
});
