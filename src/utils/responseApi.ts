// made a type of response so that it will be easier
//  for frontend dev to understand what the structure 
// when to fetch data and easy documentation 
export type ApiResponse<T = unknown> =
    | {
        success: true;
        data: T;
        error?: never;
    }
    | {
        success: false;
        data?: never;
        error: {
            code: string;
            message: string;
        };
    };