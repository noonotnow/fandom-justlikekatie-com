const RESEND_URL = "https://api.resend.com/emails";

export async function sendMagicLinkEmail({
  env = process.env,
  fetchImpl = fetch,
  email,
  magicLink,
}) {
  if (!env.RESEND_API_KEY || !env.FANDOM_AUTH_FROM_EMAIL) {
    throw new Error("Fandom email delivery is not configured.");
  }
  const response = await fetchImpl(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FANDOM_AUTH_FROM_EMAIL,
      to: [email],
      subject: "Sign in to your Fandom collection",
      text: `Open this link within 15 minutes to sign in:\n\n${magicLink}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Open this link within 15 minutes to sign in:</p><p><a href="${escapeHtml(magicLink)}">Sign in to Fandom</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body.message ? ` — ${body.message}` : "";
    } catch { /* ignore parse failure */ }
    throw new Error(`Resend rejected the message (${response.status})${detail}.`);
  }
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
