import { prisma } from './prisma';
import { env } from './env';
import { getSettings } from './settings';

export type NotifyInput = {
  userIds?: string[];
  roleKeys?: string[];
  type: string;
  title: string;
  message: string;
  caseId?: string | null;
  link?: string | null;
};

/**
 * In-app notification centre + email. The demo mail driver logs to the console;
 * swap MAIL_DRIVER to wire a real transport.
 */
export async function notify(input: NotifyInput) {
  const ids = new Set(input.userIds ?? []);

  if (input.roleKeys?.length) {
    const users = await prisma.user.findMany({
      where: { roleKey: { in: input.roleKeys }, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    users.forEach((u) => ids.add(u.id));
  }
  if (!ids.size) return;

  const recipients = [...ids];
  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      caseId: input.caseId ?? null,
      link: input.link ?? null,
    })),
  });

  await sendMail(recipients, input);
}

async function sendMail(recipients: string[], input: NotifyInput) {
  const settings = await getSettings();
  if (settings.notifications_email_enabled === false) return;
  if (env.mailDriver !== 'console') return;

  const users = await prisma.user.findMany({
    where: { id: { in: recipients } },
    select: { email: true, name: true },
  });
  for (const user of users) {
    // eslint-disable-next-line no-console
    console.log(
      `[mail] from=${env.mailFrom} to=${user.email} subject="${input.title}"\n       ${input.message}` +
        (input.link ? `\n       link: ${input.link}` : '')
    );
  }
}

/** Templates live in Settings so an admin can edit the wording. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(vars[key] ?? ''));
}
