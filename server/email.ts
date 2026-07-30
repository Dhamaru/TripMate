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

