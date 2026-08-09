import { config } from "./config";
import nodemailer from "nodemailer";

// Interface for the transporter to allow type checking
interface TransporterConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    authMethod?: string;
    tls?: {
        rejectUnauthorized: boolean;
    };
}

async function createTransporter() {
    // Check if we have production SMTP credentials
    const hasSmtpCreds = config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS;

    if (!hasSmtpCreds) {
        if (config.NODE_ENV === "production") {
            console.warn("WARNING: Missing SMTP credentials in production. Email sending will fail.");
        } else {
            console.log("Development mode: Using Ethereal Email fallback.");
            try {
                const testAccount = await nodemailer.createTestAccount();
                return nodemailer.createTransport({
                    host: "smtp.ethereal.email",
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass,
                    },
                });
            } catch (err) {
                console.error("Failed to create Ethereal test account:", err);
            }
        }
    }

    // Configure for provided SMTP credentials
    const port = config.SMTP_PORT;
    const host = config.SMTP_HOST || "smtp.ethereal.email";



    // For other SMTP providers
    const configData: TransporterConfig = {
        host: host,
        port: port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user: config.SMTP_USER || "",
            pass: config.SMTP_PASS || "",
        },
        tls: {
            rejectUnauthorized: config.NODE_ENV === "production",
        }
    };

    // Force IPv4 and add timeouts (helps with ETIMEDOUT on some cloud providers)
    // @ts-ignore - 'family' is a valid option but might not be in the strict type definition we used
    (configData as any).family = 4;
    (configData as any).greetingTimeout = 10000; // 10s timeout

    console.log(`Configuring SMTP transport: Host=${configData.host}, Port=${configData.port}, Secure=${configData.secure}`);
    return nodemailer.createTransport(configData as any);
}

// Initialize transporter wrapper
let transporterPromise = createTransporter();

export async function sendEmail(options: nodemailer.SendMailOptions) {
    try {
        const transporter = await transporterPromise;
        if (!transporter) {
            throw new Error("Email transporter not initialized");
        }

        const info = await transporter.sendMail(options);
        console.log("Message sent to %s: %s", options.to, info.messageId);

        // If using Ethereal (detected by host), log the preview URL
        const isEthereal = info.messageId && ((transporter as any).transporter?.options as any)?.host === "smtp.ethereal.email";
        if (isEthereal || !config.SMTP_HOST) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info as any));
        }

        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
}

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<boolean> {
    const resendKey = (config as any).RESEND_API_KEY || process.env.RESEND_API_KEY;
    if (!resendKey) return false;
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'TripMate <onboarding@resend.dev>',
                to,
                subject,
                html,
                text,
            }),
        });
        if (res.ok) {
            console.log(`[Email] Resend: sent to ${to}`);
            return true;
        }
        const err = await res.text();
        console.error(`[Email] Resend error: ${err}`);
        return false;
    } catch (e) {
        console.error('[Email] Resend fetch failed:', e);
        return false;
    }
}

export async function sendCollaboratorInviteEmail(toEmail: string, inviterName: string, destination: string, tripId: string, role: string) {
    const tripUrl = `${config.FRONTEND_URL || "http://localhost:5000"}/app/trips/${tripId}`;
    const subject = `${inviterName} added you to a trip on TripMate`;
    const text = `${inviterName} added you as a${role === 'viewer' ? ' viewer' : 'n editor'} on their trip to ${destination}.\n\nOpen it here:\n${tripUrl}`;
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#1E3A8A">You've been added to a trip</h2>
<p><strong>${inviterName}</strong> added you as a${role === 'viewer' ? ' viewer' : 'n editor'} on their trip to <strong>${destination}</strong>.</p>
<a href="${tripUrl}" style="display:inline-block;background:#F59E0B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Open Trip</a>
</div>`;

    const sentViaResend = await sendViaResend(toEmail, subject, html, text);
    if (sentViaResend) return true;

    try {
        const transporter = await transporterPromise;
        if (!transporter) throw new Error("Email transporter not initialized");
        const info = await transporter.sendMail({ from: `"TripMate" <${config.SMTP_FROM_EMAIL || config.SMTP_USER || 'noreply@tripmate.app'}>`, to: toEmail, subject, text, html });
        console.log("Collaborator invite email sent: %s", info.messageId);
        return true;
    } catch (error: any) {
        console.error("Error sending collaborator invite email:", error?.message || error);
        return false;
    }
}

export async function sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${config.FRONTEND_URL || "http://localhost:5000"}/reset-password?token=${token}`;
    console.log("=================================================================");
    console.log("PASSWORD RESET LINK (Dev/Test Helper):");
    console.log(resetUrl);
    console.log("=================================================================");

    const subject = "Password Reset Request — TripMate";
    const text = `You requested a password reset for your TripMate account.\n\nClick the link below to reset your password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#1E3A8A">Reset your TripMate password</h2>
<p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
<a href="${resetUrl}" style="display:inline-block;background:#F59E0B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Reset Password</a>
<p style="color:#666;font-size:13px">If you did not request a password reset, ignore this email — your password won't change.</p>
</div>`;

    // Try Resend first (no SMTP config required — just add RESEND_API_KEY to Render env vars)
    const sentViaResend = await sendViaResend(email, subject, html, text);
    if (sentViaResend) return true;

    // Fall back to SMTP (nodemailer)
    try {
        const transporter = await transporterPromise;
        if (!transporter) throw new Error("Email transporter not initialized");
        const info = await transporter.sendMail({ from: `"TripMate Support" <${config.SMTP_FROM_EMAIL || config.SMTP_USER || 'noreply@tripmate.app'}>`, to: email, subject, text, html });
        console.log("Message sent: %s", info.messageId);
        const isEthereal = ((transporter as any).transporter?.options as any)?.host === "smtp.ethereal.email";
        if (isEthereal || !config.SMTP_HOST) console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info as any));
        return true;
    } catch (error: any) {
        console.error("Error sending email:", error?.message || error);
        return false;
    }
}

export async function sendFeedbackNotificationEmail(feedback: { type: string; category: string; subject: string; description: string; email: string; attachments?: string[] }) {
    const kind = feedback.type === "bug" ? "Bug Report" : feedback.type === "feature" ? "Feature Request" : "Feedback";
    const subject = `New ${kind}: ${feedback.subject}`;
    const attachmentUrls = (feedback.attachments || []).map(a => `${config.FRONTEND_URL || "http://localhost:5000"}${a}`);
    const attachmentsText = attachmentUrls.length ? `\n\nAttachments:\n${attachmentUrls.join('\n')}` : '';
    const text = `New ${kind} submitted on TripMate.\n\nFrom: ${feedback.email}\nCategory: ${feedback.category}\nSubject: ${feedback.subject}\n\n${feedback.description}${attachmentsText}`;
    const attachmentsHtml = attachmentUrls.length
        ? `<div style="margin-top:14px"><strong>Attachments:</strong><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${attachmentUrls.map(u => `<a href="${u}" target="_blank"><img src="${u}" alt="Screenshot" style="width:140px;height:140px;object-fit:cover;border-radius:8px;border:1px solid #ddd" /></a>`).join('')}</div></div>`
        : '';
    const html = `<div style="font-family:sans-serif;max-width:520px;margin:auto">
<h2 style="color:#1E3A8A">New ${kind}</h2>
<p><strong>From:</strong> ${feedback.email}<br/><strong>Category:</strong> ${feedback.category}</p>
<p style="background:#f5f5f5;padding:12px 16px;border-radius:8px"><strong>${feedback.subject}</strong><br/><br/>${feedback.description.replace(/\n/g, '<br/>')}</p>
${attachmentsHtml}
</div>`;

    const adminEmail = config.ADMIN_EMAIL;
    if (!adminEmail) return false;

    const sentViaResend = await sendViaResend(adminEmail, subject, html, text);
    if (sentViaResend) return true;

    try {
        const transporter = await transporterPromise;
        if (!transporter) throw new Error("Email transporter not initialized");
        const info = await transporter.sendMail({ from: `"TripMate Feedback" <${config.SMTP_FROM_EMAIL || config.SMTP_USER || 'noreply@tripmate.app'}>`, to: adminEmail, replyTo: feedback.email, subject, text, html });
        console.log("Feedback notification sent to admin: %s", info.messageId);
        return true;
    } catch (error: any) {
        console.error("Error sending feedback notification email:", error?.message || error);
        return false;
    }
}

export async function sendAgentTriagePlanEmail(feedback: { type: string; category: string; subject: string; description: string; email: string; agentPlan?: string }) {
    const kind = feedback.type === "bug" ? "Bug Report" : feedback.type === "feature" ? "Feature Request" : "Feedback";
    const subject = `Triage plan ready: ${feedback.subject}`;
    const plan = feedback.agentPlan || "(no plan text)";
    const text = `The automated feedback-triage routine investigated this ${kind.toLowerCase()} and drafted a fix plan.\n\nOriginal report from ${feedback.email} (${feedback.category}):\n"${feedback.subject}"\n${feedback.description}\n\n--- Proposed plan ---\n${plan}\n\nThis plan has NOT been applied — review it and say the word if you want it built.`;
    const html = `<div style="font-family:sans-serif;max-width:560px;margin:auto">
<h2 style="color:#1E3A8A">Triage plan ready</h2>
<p style="color:#666;font-size:13px">The automated feedback-triage routine investigated this ${kind.toLowerCase()} and drafted a fix plan below. <strong>Nothing has been changed yet</strong> — this is a proposal for you to review.</p>
<p><strong>Reported by:</strong> ${feedback.email}<br/><strong>Category:</strong> ${feedback.category}</p>
<p style="background:#f5f5f5;padding:12px 16px;border-radius:8px"><strong>${feedback.subject}</strong><br/><br/>${feedback.description.replace(/\n/g, '<br/>')}</p>
<h3 style="color:#1E3A8A;margin-top:20px">Proposed plan</h3>
<div style="background:#f0f4fa;padding:12px 16px;border-radius:8px;white-space:pre-wrap;font-size:14px">${plan.replace(/\n/g, '<br/>')}</div>
</div>`;

    const adminEmail = config.ADMIN_EMAIL;
    if (!adminEmail) return false;

    const sentViaResend = await sendViaResend(adminEmail, subject, html, text);
    if (sentViaResend) return true;

    try {
        const transporter = await transporterPromise;
        if (!transporter) throw new Error("Email transporter not initialized");
        const info = await transporter.sendMail({ from: `"TripMate Feedback Triage" <${config.SMTP_FROM_EMAIL || config.SMTP_USER || 'noreply@tripmate.app'}>`, to: adminEmail, subject, text, html });
        console.log("Triage plan email sent to admin: %s", info.messageId);
        return true;
    } catch (error: any) {
        console.error("Error sending triage plan email:", error?.message || error);
        return false;
    }
}

export async function sendFeedbackConfirmationEmail(email: string, subjectLine: string, type: string) {
    const subject = "We received your feedback — TripMate";
    const kind = type === "bug" ? "bug report" : "feedback";
    const text = `Thanks for reaching out — we received your ${kind}:\n\n"${subjectLine}"\n\nOur team typically responds within 24-48 hours. We'll follow up at this email address if we need more details or once it's resolved.`;
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:auto">
<h2 style="color:#1E3A8A">Thanks for your ${kind}</h2>
<p>We received the following, and it's now in our queue:</p>
<p style="background:#f5f5f5;padding:12px 16px;border-radius:8px;font-style:italic">"${subjectLine}"</p>
<p style="color:#666;font-size:13px">We typically respond within 24-48 hours. We'll follow up at this email address if we need more details or once it's resolved.</p>
</div>`;

    const sentViaResend = await sendViaResend(email, subject, html, text);
    if (sentViaResend) return true;

    try {
        const transporter = await transporterPromise;
        if (!transporter) throw new Error("Email transporter not initialized");
        const info = await transporter.sendMail({ from: `"TripMate Support" <${config.SMTP_FROM_EMAIL || config.SMTP_USER || 'noreply@tripmate.app'}>`, to: email, subject, text, html });
        console.log("Feedback confirmation sent: %s", info.messageId);
        return true;
    } catch (error: any) {
        console.error("Error sending feedback confirmation email:", error?.message || error);
        return false;
    }
}

export async function sendEmailDetailed(options: nodemailer.SendMailOptions): Promise<{ ok: boolean, error?: any, messageId?: string }> {
    try {
        const transporter = await transporterPromise;
        if (!transporter) return { ok: false, error: "Transporter not initialized" };

        const info = await transporter.sendMail(options);
        return { ok: true, messageId: info.messageId };
    } catch (error: any) {
        return {
            ok: false,
            error: {
                message: error.message,
                code: error.code,
                response: error.response
            }
        };
    }
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: any }> {
    try {
        const transporter = await transporterPromise;
        if (!transporter) return { ok: false, error: "Transporter not initialized" };
        await transporter.verify();
        return { ok: true };
    } catch (error: any) {
        console.error("SMTP Verify Error:", error);
        return {
            ok: false,
            error: {
                message: error.message,
                code: error.code,
                response: error.response
            }
        };
    }
}

