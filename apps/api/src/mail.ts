import nodemailer from 'nodemailer';
import { ControlError } from './errors';

export interface Mailbox {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export async function sendMail(to: string, subject: string, text: string, mailbox?: Mailbox | null): Promise<void> {
  const chosen: Mailbox | null =
    mailbox === undefined
      ? envMailbox()
      : mailbox;
  if (!chosen || !chosen.user || !chosen.pass) {
    throw new ControlError(400, 'mail_unavailable', 'Email is not set up yet. Confirm with your password.');
  }
  const transport = nodemailer.createTransport({
    host: chosen.host,
    port: chosen.port,
    secure: chosen.secure,
    auth: { user: chosen.user, pass: chosen.pass },
  });
  try {
    await transport.sendMail({
      from: chosen.from || chosen.user,
      to,
      subject,
      text,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    if (mailbox) {
      if (/auth|535|534|invalid login/i.test(detail)) {
        throw new ControlError(400, 'mail_unavailable', 'The host rejected that username or app password.');
      }
      throw new ControlError(400, 'mail_unavailable', 'Could not reach that SMTP account. Check the host, port, and encryption.');
    }
    throw new ControlError(400, 'mail_unavailable', 'The code could not be emailed. Confirm with your password.');
  }
}

function envMailbox(): Mailbox | null {
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!user || !pass) return null;
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user,
    pass,
    from: process.env.MAIL_FROM || user,
  };
}
