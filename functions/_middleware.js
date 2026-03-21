// Mission Control Auth Middleware
// Server-side password gate via Cloudflare Pages Functions
// Cookie-based session lasts 30 days

const COOKIE_NAME = 'mc_auth';
const SESSION_DAYS = 30;

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getLoginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mission Control — Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      font-family: 'Inter', -apple-system, sans-serif;
      color: #e8ecf0;
    }
    .login-container {
      width: 100%;
      max-width: 380px;
      padding: 40px;
      background: #181818;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo h1 {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }
    .logo p {
      color: #666;
      font-size: 13px;
      margin-top: 4px;
    }
    label {
      display: block;
      font-size: 13px;
      color: #888;
      margin-bottom: 6px;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px 16px;
      background: #111;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      color: #e8ecf0;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus {
      border-color: rgba(255,255,255,0.25);
    }
    button {
      width: 100%;
      padding: 12px;
      margin-top: 20px;
      background: #fff;
      color: #000;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.85; }
    .error {
      color: #e74c3c;
      font-size: 13px;
      margin-top: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="logo">
      <h1>Mission Control</h1>
      <p>Verboten Industries HQ</p>
    </div>
    <form method="POST" action="/__auth">
      <label for="password">Access Code</label>
      <input type="password" id="password" name="password" placeholder="Enter access code" autofocus required />
      <button type="submit">Enter</button>
      ${error ? '<p class="error">' + error + '</p>' : ''}
    </form>
  </div>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // The password hash is stored as an env var
  const EXPECTED_HASH = env.MC_AUTH_HASH;
  if (!EXPECTED_HASH) {
    // No auth configured, pass through
    return next();
  }

  // Handle login POST
  if (url.pathname === '/__auth' && request.method === 'POST') {
    const formData = await request.formData();
    const password = formData.get('password') || '';
    const hash = await hashPassword(password);

    if (hash === EXPECTED_HASH) {
      // Generate session token
      const sessionToken = crypto.randomUUID();
      const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

      // Store session (using the hash as a simple validator)
      const response = new Response(null, {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': `${COOKIE_NAME}=${hash}.${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`
        }
      });
      return response;
    } else {
      return new Response(getLoginPage('Wrong access code'), {
        status: 401,
        headers: { 'Content-Type': 'text/html' }
      });
    }
  }

  // Check for valid session cookie
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));

  if (match) {
    const [storedHash] = match[1].split('.');
    if (storedHash === EXPECTED_HASH) {
      return next();
    }
  }

  // Not authenticated — show login
  return new Response(getLoginPage(), {
    status: 401,
    headers: { 'Content-Type': 'text/html' }
  });
}
