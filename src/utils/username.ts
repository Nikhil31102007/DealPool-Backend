import { randomBytes } from "crypto";

const ADJECTIVES = [
    "swift", "quiet", "bold", "lucky", "clever", "bright", "calm",
    "eager", "gentle", "brisk", "sunny", "quick", "sharp", "witty",
];

const NOUNS = [
    "otter", "falcon", "maple", "comet", "harbor", "ember", "pixel",
    "willow", "raven", "granite", "meadow", "orbit", "cedar", "delta",
];

export const generateUsername = (): string => {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const suffix = randomBytes(3).toString("hex");

    return `${adjective}_${noun}_${suffix}`;
};