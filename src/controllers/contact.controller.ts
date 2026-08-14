import { asyncHandler } from '../utils/asyncHandler';
import { getSettings } from '../services/settings.service';
import { sendEmail } from '../services/notification.service';

export const submit = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;
  const settings = await getSettings();

  await sendEmail({
    to: settings.supportEmail,
    subject: `[Contact form] ${subject}`,
    text: `From: ${name} <${email}>\n\n${message}`,
  });

  res.json({ message: "Thanks — we'll get back to you within 1-2 business days." });
});
