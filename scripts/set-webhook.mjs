const url = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!url) {
  console.error("usage: npm run webhook:set -- https://your-app.vercel.app");
  process.exit(1);
}
if (!/^https?:\/\//.test(url)) {
  console.error(
    `URL must start with http:// or https:// — usage: npm run webhook:set -- https://your-app.vercel.app`,
  );
  process.exit(1);
}
if (!token || !secret) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set in .env");
  process.exit(1);
}

const webhookUrl = new URL("/api/telegram/webhook", url).toString();

let response;
try {
  response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  });
} catch (error) {
  console.error(`could not reach Telegram: ${error.message}`);
  process.exit(1);
}

let body;
try {
  body = await response.json();
} catch (error) {
  console.error(`could not reach Telegram: ${error.message}`);
  process.exit(1);
}

if (!body.ok) {
  console.error("setWebhook failed:", body.description);
  process.exitCode = 1;
} else {
  console.log("webhook registered:", webhookUrl);
}
