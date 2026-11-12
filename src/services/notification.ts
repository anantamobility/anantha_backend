import envConfig from "../config/env.js";

export type DeliveryChannel = "EMAIL" | "SMS";

export type DeliveryResult = {
  delivered: boolean;
  channel: DeliveryChannel | null;
  provider: string;
  reason?: string;
};

type PasswordResetMessage = {
  toEmail?: string | null;
  toPhone?: string | null;
  name: string;
  token: string;
  expiresAt: Date;
};

function resetBody(input: PasswordResetMessage) {
  const url = new URL("/reset-password", envConfig.frontendUrl);
  url.searchParams.set("token", input.token);
  return [
    `Hello ${input.name},`,
    "",
    "A password reset was requested for your Anantha account.",
    `Use the following single-use code to reset your password: ${input.token}`,
    `This code expires at ${input.expiresAt.toISOString()}.`,
    `If you are using the web application, open ${url.toString()}`,
    "",
    "If you did not request this, you can ignore this message.",
  ].join("\n");
}

async function postJson(
  url: string,
  body: unknown,
  token?: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ok: false, reason: `Provider responded with ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Provider request failed",
    };
  }
}

async function sendEmail(input: PasswordResetMessage): Promise<DeliveryResult> {
  const provider = envConfig.notificationEmailProvider;
  if (provider === "none") {
    return {
      delivered: false,
      channel: "EMAIL",
      provider,
      reason: "Email delivery provider is not configured",
    };
  }

  if (!input.toEmail) {
    return {
      delivered: false,
      channel: "EMAIL",
      provider,
      reason: "User has no email address",
    };
  }

  const body = resetBody(input);

  if (provider === "webhook") {
    if (!envConfig.emailWebhookUrl) {
      return {
        delivered: false,
        channel: "EMAIL",
        provider,
        reason: "NOTIFICATION_EMAIL_WEBHOOK_URL is not configured",
      };
    }
    const result = await postJson(
      envConfig.emailWebhookUrl,
      {
        from: envConfig.mailFrom,
        to: input.toEmail,
        subject: "Anantha password reset",
        text: body,
      },
      envConfig.emailWebhookToken || undefined
    );
    return {
      delivered: result.ok,
      channel: "EMAIL",
      provider,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }

  return {
    delivered: false,
    channel: "EMAIL",
    provider,
    reason: `Unsupported email provider: ${provider}`,
  };
}

async function sendSms(input: PasswordResetMessage): Promise<DeliveryResult> {
  const provider = envConfig.notificationSmsProvider;
  if (provider === "none") {
    return {
      delivered: false,
      channel: "SMS",
      provider,
      reason: "SMS delivery provider is not configured",
    };
  }

  if (!input.toPhone) {
    return {
      delivered: false,
      channel: "SMS",
      provider,
      reason: "User has no phone number",
    };
  }

  if (provider === "http") {
    if (!envConfig.smsApiUrl) {
      return {
        delivered: false,
        channel: "SMS",
        provider,
        reason: "SMS_API_URL is not configured",
      };
    }
    const text = `Anantha password reset code: ${input.token}. Expires ${input.expiresAt.toISOString()}.`;
    const result = await postJson(
      envConfig.smsApiUrl,
      {
        to: input.toPhone,
        sender: envConfig.smsSenderId || undefined,
        message: text,
      },
      envConfig.smsApiKey || undefined
    );
    return {
      delivered: result.ok,
      channel: "SMS",
      provider,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }

  return {
    delivered: false,
    channel: "SMS",
    provider,
    reason: `Unsupported SMS provider: ${provider}`,
  };
}

/**
 * Delivers a password reset message through the configured provider. The raw
 * token is passed only to the provider and is never logged by this module.
 *
 * When no provider is configured the result explicitly reports
 * `delivered: false`; callers must not claim that a message was sent.
 */
export async function deliverPasswordReset(
  input: PasswordResetMessage
): Promise<DeliveryResult> {
  if (envConfig.notificationEmailProvider !== "none") {
    return sendEmail(input);
  }
  if (envConfig.notificationSmsProvider !== "none") {
    return sendSms(input);
  }
  return sendEmail(input);
}
