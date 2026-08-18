import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.json());

const chatMessages = [];
const chatUsers = new Map();
const CHAT_USER_TIMEOUT = 30000;
let nextMessageId = 1;

function cleanupChatUsers() {
  const now = Date.now();
  for (const [name, info] of chatUsers) {
    if (now - info.lastSeen > CHAT_USER_TIMEOUT) {
      chatUsers.delete(name);
    }
  }
}

setInterval(cleanupChatUsers, 15000);

function isValidChatName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_-]{2,24}$/.test(name.trim());
}

function isValidChatText(text) {
  return typeof text === 'string' && text.trim().length > 0 && text.trim().length <= 400;
}

const allowedNavigationSchemes = /^(mailto:|tel:|sms:|javascript:|data:|blob:|#)/i;

function escapeHtml(value) {
  return value.replace(/[&"'<>]/g, char => ({
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;'
  })[char]);
}

function rewriteAttributeUrl(value, baseUrl) {
  if (!value || value.startsWith('#') || value.match(allowedNavigationSchemes)) {
    return value;
  }
  try {
    const absolute = new URL(value, baseUrl).href;
    if (/^https?:\/\//i.test(absolute)) {
      return `/proxy?url=${encodeURIComponent(absolute)}`;
    }
    return absolute;
  } catch {
    return value;
  }
}

function rewriteSrcsetValue(value, baseUrl) {
  return value.split(',').map(part => {
    const trimmed = part.trim();
    const [url, descriptor] = trimmed.split(/\s+/, 2);
    const rewrittenUrl = rewriteAttributeUrl(url, baseUrl);
    return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
  }).join(', ');
}

function rewriteNavigationLinks(html, baseUrl) {
  html = html.replace(/<(a|area|form|link|script|img|iframe|source|video|audio|track|embed|object)([^>]+?)(href|action|src|poster|data|data-src)\s*=\s*(['"])([^"']*)(['"])/gi,
    (match, tag, prefix, attr, quote, value, endQuote) => {
      const rewritten = rewriteAttributeUrl(value, baseUrl);
      return `<${tag}${prefix}${attr}=${quote}${rewritten}${quote}`;
    });

  html = html.replace(/<(img|source)([^>]+?)srcset\s*=\s*(['"])([^"']*)(['"])/gi,
    (match, tag, prefix, quote, value, endQuote) => {
      const rewritten = rewriteSrcsetValue(value, baseUrl);
      return `<${tag}${prefix}srcset=${quote}${rewritten}${quote}`;
    });

  html = html.replace(/url\((['"]?)([^'"\)]+)(['"]?)\)/gi, (match, open, value, close) => {
    const rewritten = rewriteAttributeUrl(value, baseUrl);
    return `url(${open}${rewritten}${close})`;
  });

  return html;
}

function injectBaseHref(html, baseUrl) {
  const escapedBase = escapeHtml(baseUrl);
  if (/\<base\s+/i.test(html)) {
    return html.replace(/<base[^>]*>/i, `<base href="${escapedBase}">`);
  }
  if (/\<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1<base href="${escapedBase}">`);
  }
  return `<base href="${escapedBase}">` + html;
}

app.post('/chat/join', (req, res) => {
  const name = String(req.body.name || '').trim();

  if (!isValidChatName(name)) {
    return res.status(400).json({ error: 'Name must be 2-24 characters and contain only letters, numbers, underscores, or hyphens.' });
  }

  cleanupChatUsers();

  if (chatUsers.has(name)) {
    return res.status(409).json({ error: 'That name is already in use. Choose another one.' });
  }

  chatUsers.set(name, { lastSeen: Date.now() });
  res.json({ ok: true });
});

app.post('/chat/message', (req, res) => {
  const from = String(req.body.from || '').trim();
  const to = String(req.body.to || '').trim();
  const text = String(req.body.text || '').trim();

  if (!isValidChatName(from) || !chatUsers.has(from)) {
    return res.status(400).json({ error: 'Invalid sender. Please rejoin the chat.' });
  }

  if (!isValidChatText(text)) {
    return res.status(400).json({ error: 'Message must be 1-400 characters.' });
  }

  const recipient = to === 'everyone' || to === '' ? null : to;
  if (recipient && !chatUsers.has(recipient)) {
    return res.status(400).json({ error: 'Selected contact is not available.' });
  }

  chatUsers.get(from).lastSeen = Date.now();

  const message = {
    id: nextMessageId++,
    time: Date.now(),
    from,
    to: recipient,
    text
  };

  chatMessages.push(message);
  if (chatMessages.length > 500) {
    chatMessages.shift();
  }

  res.json({ ok: true, message });
});

app.get('/chat/messages', (req, res) => {
  const user = String(req.query.user || '').trim();
  const since = Number(req.query.since || 0);

  cleanupChatUsers();

  if (isValidChatName(user) && chatUsers.has(user)) {
    chatUsers.get(user).lastSeen = Date.now();
  }

  const visible = chatMessages.filter(message => {
    if (message.id <= since) return false;
    if (message.to === null) return true;
    return message.to === user || message.from === user;
  });

  const contacts = [...chatUsers.keys()].filter(name => name !== user).sort();

  res.json({
    messages: visible,
    lastId: visible.length ? visible[visible.length - 1].id : since,
    contacts
  });
});

app.get('/proxy', proxyHandler);
app.post('/proxy', proxyHandler);

async function proxyHandler(req, res) {
  const rawUrl = req.query.url;

  if (!rawUrl) {
    return res.redirect('/proxy-browser.html');
  }

  let targetUrl = rawUrl;
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const fetchOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProxyBrowser/1.0)'
      }
    };

    // If it's a POST request, forward the body
    if (req.method === 'POST') {
      fetchOptions.method = 'POST';
      fetchOptions.body = req.body ? JSON.stringify(req.body) : undefined;
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const response = await fetch(targetUrl, fetchOptions);

    const contentType = response.headers.get('content-type') || '';
    const body = await response.arrayBuffer();

    if (!response.ok) {
      res.status(response.status).type('text/plain').send(Buffer.from(body));
      return;
    }

    if (contentType.includes('text/html')) {
      let html = new TextDecoder('utf-8').decode(body);
      const finalUrl = response.url || targetUrl;
      const rewritten = rewriteNavigationLinks(injectBaseHref(html, finalUrl), finalUrl);
      
      // Inject script to handle form submissions
      const injectedScript = `<script>
(function() {
  var baseUrl = '${finalUrl.replace(/'/g, "\\'")}';
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form && form.tagName === 'FORM') {
      e.preventDefault();
      var action = form.getAttribute('action') || '';
      var method = (form.getAttribute('method') || 'GET').toUpperCase();
      try {
        var fullUrl = new URL(action, baseUrl).href;
        var params = new URLSearchParams(new FormData(form));
        if (method === 'GET' && params.toString()) {
          fullUrl += (fullUrl.indexOf('?') > -1 ? '&' : '?') + params.toString();
        }
        var encoded = encodeURIComponent(fullUrl);
        top.location = '/proxy?url=' + encoded;
      } catch (err) {
        console.error('Form error:', err);
      }
    }
  }, true);
})();
</script>`;
      
      const finalHtml = rewritten.replace(/<\/body>/i, injectedScript + '</body>');
      res.type('text/html').send(finalHtml);
      return;
    }

    res.type(contentType || 'application/octet-stream').send(Buffer.from(body));
  } catch (error) {
    res.status(500).type('text/plain').send(`Proxy error: ${error.message}`);
  }
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
