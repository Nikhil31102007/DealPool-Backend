import crypto from "crypto";
import QRCode from "qrcode";
import dotenv from "dotenv";

dotenv.config();

const getQrSecret = (): string => {
    return (
        process.env.QR_SECRET ||
        process.env.RAZORPAY_TEST_SECRET ||
        process.env.RAZORPAY_KEY_SECRET ||
        "dealpool_default_handover_secret"
    );
};

export interface QrHandoverPayload {
    transactionId: string;
    action: "checkout" | "complete";
    generatorId: string;
    timestamp: number;
}

export const generateQrDataUrl = async (content: string): Promise<string> => {
    return QRCode.toDataURL(content, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 300,
        color: {
            dark: "#000000",
            light: "#ffffff",
        },
    });
};

export const createHandoverToken = (payload: QrHandoverPayload): string => {
    const dataString = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
        .createHmac("sha256", getQrSecret())
        .update(dataString)
        .digest("base64url");

    return `${dataString}.${signature}`;
};

export const decodeAndVerifyHandoverToken = (token: string): QrHandoverPayload => {
    const parts = token.split(".");
    if (parts.length !== 2) {
        throw new Error("INVALID_TOKEN_FORMAT");
    }

    const [dataString, signature] = parts;
    const expectedSignature = crypto
        .createHmac("sha256", getQrSecret())
        .update(dataString)
        .digest("base64url");

    if (signature !== expectedSignature) {
        throw new Error("INVALID_TOKEN_SIGNATURE");
    }

    const json = Buffer.from(dataString, "base64url").toString("utf8");
    const payload = JSON.parse(json) as QrHandoverPayload;

    // 24 hour expiration limit
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - payload.timestamp > MAX_AGE_MS) {
        throw new Error("TOKEN_EXPIRED");
    }

    return payload;
};
