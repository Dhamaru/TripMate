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
    const host = process.env.SMTP_HOST || "smtp.ethereal.email";



    // For other SMTP providers
    const config: TransporterConfig = {
        host: host,
        port: port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER || "",
            pass: process.env.SMTP_PASS || "",
        },
        tls: {
            rejectUnauthorized: process.env.NODE_ENV === "production",
        }
    };

    console.log(`Configuring SMTP transport: Host=${config.host}, Port=${config.port}, Secure=${config.secure}`);
    return nodemailer.createTransport(config as any);
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
        if (isEthereal || !process.env.SMTP_HOST) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info as any));
        }

        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
}

export async function sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5000"}/reset-password?token=${token}`;
    console.log("=================================================================");
    console.log("PASSWORD RESET LINK (Dev/Test Helper):");
    console.log(resetUrl);
    console.log("=================================================================");

    const message = {
        from: `"TripMate Support" <${process.env.SMTP_USER || 'kasivasi2005@gmail.com'}>`,
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
    } catch (error: any) {
        console.error("Error sending email:", error?.message || error);
        console.error("SMTP Error Code:", error?.code);
        console.error("SMTP Error Response:", error?.response);
        // We might want to re-throw or handle this in the route
        return false;
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

