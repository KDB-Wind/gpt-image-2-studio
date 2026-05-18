import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import type { SendVerificationCode } from "./authService";

export type EmailSenderEnv = {
  NODE_ENV?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURE?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
};

export type EmailSenderDependencies = {
  createTransport?: (options: SMTPTransport.Options) => {
    sendMail: (message: { from: string; to: string; subject: string; text: string }) => Promise<unknown>;
  };
  log?: (message: string) => void;
};

const DEFAULT_SMTP_PORT = 587;
const DEFAULT_FROM = "Chat To Image <no-reply@localhost>";

export function createVerificationCodeSender(
  env: EmailSenderEnv = process.env,
  deps: EmailSenderDependencies = {},
): SendVerificationCode {
  const host = env.SMTP_HOST?.trim();
  if (!host) {
    if (env.NODE_ENV === "production") {
      throw new Error("SMTP_HOST is required in production for email verification codes.");
    }

    const log = deps.log ?? console.info;
    return async ({ email, code }) => {
      log(`Verification code for ${email}: ${code}`);
    };
  }

  const transport = (deps.createTransport ?? nodemailer.createTransport)({
    host,
    port: parseSmtpPort(env.SMTP_PORT),
    secure: parseBoolean(env.SMTP_SECURE),
    auth: getSmtpAuth(env),
  });
  const from = env.SMTP_FROM?.trim() || DEFAULT_FROM;

  return async ({ email, code }) => {
    await transport.sendMail({
      from,
      to: email,
      subject: "Chat To Image 登录验证码",
      text: `你的 Chat To Image 登录验证码是 ${code}，10 分钟内有效。若非本人操作，请忽略。`,
    });
  };
}

function parseSmtpPort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SMTP_PORT;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function getSmtpAuth(env: EmailSenderEnv): SMTPTransport.Options["auth"] {
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();
  return user && pass ? { user, pass } : undefined;
}
