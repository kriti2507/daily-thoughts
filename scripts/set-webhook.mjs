const url = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!url) {
  console.error("usage: npm run webhook:set -- https://your-app.vercel.app");
  process.exit(1);
}
if (!token || !secret) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set in .env");
  process.exit(1);
}

const response = await fetch(
  `https://api.telegram.org/bot${token}/setWebhook`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: new URL("/api/telegram/webhook", url).toString(),
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  },
);

const body = await response.json();
if (!body.ok) {
  console.error("setWebhook failed:", body.description);
  process.exitCode = 1;
} else {
  console.log("webhook registered:", new URL("/api/telegram/webhook", url).toString());
}
