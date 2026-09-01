import nodemailer from "nodemailer";

export interface SystemEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required SMTP environment variable: ${name}`);
  return value;
}

function smtpPort(): number {
  const value = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  return value;
}

function smtpSecure(): boolean {
  const raw = (process.env.SMTP_SECURE ?? "false").trim().toLowerCase();
  if (raw !== "true" && raw !== "false") {
    throw new Error("SMTP_SECURE must be true or false");
  }
  return raw === "true";
}

/**
 * ส่งอีเมลระบบผ่าน SMTP โดยไม่บันทึกผู้รับ เนื้อหา หรือลิงก์ token ลง log
 * ใน test จะไม่เชื่อมต่อเครือข่าย เพื่อให้ integration test ทำงานแบบ deterministic
 */
export async function sendSystemEmail(message: SystemEmail): Promise<void> {
  if (process.env.NODE_ENV === "test") return;

  const user = requiredEnv("SMTP_USER");
  const transporter = nodemailer.createTransport({
    host: requiredEnv("SMTP_HOST"),
    port: smtpPort(),
    secure: smtpSecure(),
    auth: {
      user,
      pass: requiredEnv("SMTP_PASSWORD"),
    },
  });

  await transporter.sendMail({
    from: requiredEnv("SMTP_FROM"),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function emailShell(title: string, greeting: string, description: string, button: string, url: string, expiry: string): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="th"><body style="margin:0;background:#f1f5f9;font-family:Tahoma,Arial,sans-serif;color:#172033">
<div style="max-width:600px;margin:0 auto;padding:32px 16px">
  <div style="background:#ffffff;border-radius:20px;padding:32px;border:1px solid #dbe4f0">
    <div style="font-size:13px;font-weight:700;color:#2563eb;margin-bottom:12px">SKL-FRIS</div>
    <h1 style="font-size:24px;margin:0 0 18px">${escapeHtml(title)}</h1>
    <p style="line-height:1.7;margin:0 0 10px">${escapeHtml(greeting)}</p>
    <p style="line-height:1.7;margin:0 0 24px;color:#52617a">${escapeHtml(description)}</p>
    <p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${escapeHtml(button)}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#64748b">ลิงก์นี้ใช้ได้ ${escapeHtml(expiry)} และใช้ได้ครั้งเดียว หากคุณไม่ได้เป็นผู้ดำเนินการ ไม่ต้องกดลิงก์นี้</p>
    <p style="font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all">หากปุ่มไม่ทำงาน ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:<br>${safeUrl}</p>
  </div>
</div></body></html>`;
}

export function verificationEmail(name: string, url: string): Omit<SystemEmail, "to"> {
  const greeting = `สวัสดี ${name || "ผู้สมัคร"}`;
  return {
    subject: "ยืนยันอีเมลสำหรับบัญชี SKL-FRIS",
    text: `${greeting}\n\nกดยืนยันอีเมลเพื่อให้ผู้ดูแลระบบสามารถอนุมัติบัญชีของคุณได้:\n${url}\n\nลิงก์นี้ใช้ได้ 24 ชั่วโมงและใช้ได้ครั้งเดียว`,
    html: emailShell(
      "ยืนยันอีเมลของคุณ",
      greeting,
      "กรุณายืนยันอีเมลก่อน ผู้ดูแลระบบจึงจะสามารถอนุมัติบัญชีของคุณได้",
      "ยืนยันอีเมล",
      url,
      "24 ชั่วโมง",
    ),
  };
}

export function passwordResetEmail(name: string, url: string): Omit<SystemEmail, "to"> {
  const greeting = `สวัสดี ${name || "ผู้ใช้งาน"}`;
  return {
    subject: "ตั้งรหัสผ่านใหม่สำหรับบัญชี SKL-FRIS",
    text: `${greeting}\n\nมีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ:\n${url}\n\nลิงก์นี้ใช้ได้ 30 นาทีและใช้ได้ครั้งเดียว`,
    html: emailShell(
      "ตั้งรหัสผ่านใหม่",
      greeting,
      "เราได้รับคำขอตั้งรหัสผ่านใหม่ กดปุ่มด้านล่างเพื่อดำเนินการ",
      "ตั้งรหัสผ่านใหม่",
      url,
      "30 นาที",
    ),
  };
}
