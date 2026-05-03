import { describe, expect, it, vi } from "vitest";

import { createVerificationCodeSender } from "./emailSender";

describe("emailSender", () => {
  it("requires SMTP configuration in production", () => {
    expect(() =>
      createVerificationCodeSender({
        NODE_ENV: "production",
      }),
    ).toThrow("SMTP_HOST is required in production");
  });

  it("sends verification codes through SMTP when configured", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "message-1" }));
    const createTransport = vi.fn(() => ({ sendMail }));
    const sender = createVerificationCodeSender(
      {
        NODE_ENV: "production",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "mailer@example.com",
        SMTP_PASS: "secret",
        SMTP_FROM: "Chat To Image <mailer@example.com>",
      },
      { createTransport },
    );

    await sender({ email: "demo@example.com", code: "123456" });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: {
        user: "mailer@example.com",
        pass: "secret",
      },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "Chat To Image <mailer@example.com>",
      to: "demo@example.com",
      subject: "Chat To Image 登录验证码",
      text: "你的 Chat To Image 登录验证码是 123456，10 分钟内有效。若非本人操作，请忽略。",
    });
  });
});
