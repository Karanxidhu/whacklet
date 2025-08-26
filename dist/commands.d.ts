import type { Wallet } from "../generated/prisma/index.js";
export declare function createWallet(name: string, chatId: string): Promise<string | undefined>;
export declare function getBalance(name: string, chatId: string): Promise<string | undefined>;
export declare function transfer(from: Wallet, to: string, amount: string): Promise<string>;
export declare function createNFT(name: string, ticker: string, uri: string, chatId: string): Promise<{
    success: boolean;
    mintAddress: string;
    signature: string;
    error?: never;
} | {
    success: boolean;
    error: unknown;
    mintAddress?: never;
    signature?: never;
}>;
//# sourceMappingURL=commands.d.ts.map