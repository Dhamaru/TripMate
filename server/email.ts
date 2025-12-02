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
    const hasSmtpCreds = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

    if (!hasSmtpCreds) {
        if (process.env.NODE_ENV === "production") {
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
    const port = parseInt(process.env.SMTP_PORT || "587");
    const config: TransporterConfig = {
        host: process.env.SMTP_HOST || "smtp.ethereal.email",
        port: port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER || "",
            pass: process.env.SMTP_PASS || "",
        },
        // Allow explicit auth method override (e.g., "LOGIN" for some providers)
        authMethod: process.env.SMTP_AUTH_METHOD || "PLAIN",
        tls: {
            // In production with proper certs this should be true, but for flexibility we'll allow override
            rejectUnauthorized: process.env.NODE_ENV === "production",
        }
    };

    console.log(`Configuring SMTP transport: Host=${config.host}, Port=${config.port}, Secure=${config.secure}, AuthMethod=${config.authMethod}`);
    return nodemailer.createTransport(config as any);
}

// Initialize transporter wrapper
let transporterPromise = createTransporter();

export async function sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5000"}/reset-password?token=${token}`;

    const message = {
        from: '"TripMate Support" <kasivasi2005@gmail.com>',
        to: email,
        subject: "Password Reset Request",
        text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
            `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
            `${resetUrl}\n\n` +
            `If you did not request this, please ignore this email and your password will remain unchanged.\n`,
        html: `<p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>` +
            `<p>Please click on the following link, or paste this into your browser to complete the process:</p>` +
            `<a href="${resetUrl}">${resetUrl}</a>` +
            `<p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`,
    };

    try {
        const transporter = await transporterPromise;
        if (!transporter) {
            throw new Error("Email transporter not initialized");
        }

        const info = await transporter.sendMail(message);
        console.log("Message sent: %s", info.messageId);

        // If using Ethereal (detected by host), log the preview URL
        // Cast to any to avoid TS errors with union types
        const isEthereal = info.messageId && ((transporter as any).transporter?.options as any)?.host === "smtp.ethereal.email";
        if (isEthereal || !process.env.SMTP_HOST) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info as any));
        }

        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        // We might want to re-throw or handle this in the route
        return false;
    }
}
