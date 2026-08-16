import Razorpay from "razorpay";
import dotenv from "dotenv";

dotenv.config();

export const getRazorpayKeyId = (): string => {
    return process.env.RAZORPAY_TEST_KEY || process.env.RAZORPAY_KEY_ID || "";
};

export const getRazorpayKeySecret = (): string => {
    return process.env.RAZORPAY_TEST_SECRET || process.env.RAZORPAY_KEY_SECRET || "";
};

export const getRazorpayWebhookSecret = (): string => {
    return process.env.RAZORPAY_WEBHOOK_SECRET || "";
};

export const getRazorpayInstance = (): Razorpay => {
    const key_id = getRazorpayKeyId();
    const key_secret = getRazorpayKeySecret();

    return new Razorpay({
        key_id,
        key_secret,
    });
};
