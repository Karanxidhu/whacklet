import { PublicKey } from "@solana/web3.js";
import type { Wallet } from "../generated/prisma/index.js";
export declare function createWallet(name: string, chatId: string): Promise<string | undefined>;
export declare function getBalance(name: string, chatId: string): Promise<string | undefined>;
export declare function transfer(from: Wallet, to: string, amount: string): Promise<string>;
export declare function createNFT(name: string, ticker: string, uri: string, chatId: string): Promise<{
    success: boolean;
    mintAddress: string;
    ata: PublicKey;
    signature: string;
    error?: never;
} | {
    success: boolean;
    error: unknown;
    mintAddress?: never;
    ata?: never;
    signature?: never;
}>;
export declare function transferNFT(from: Wallet, to: string, mintAddress: string): Promise<{
    success: boolean;
    signature: string;
    error?: never;
} | {
    success: boolean;
    error: string;
    signature?: never;
}>;
export declare function getTokenAccounts(walletPublicKey: PublicKey): Promise<{
    pubkey: PublicKey;
    account: import("@solana/web3.js").AccountInfo<import("@solana/web3.js").ParsedAccountData>;
}[]>;
//# sourceMappingURL=commands.d.ts.map