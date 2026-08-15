// creating types file for these small types 
// cuz making another file for them will be
//  quite a hassle
export type UserRole = "user" | "admin";

export interface AuthUser {
    uid: string;
    firebaseUid: string;
    email: string | undefined;
    role: UserRole;
}