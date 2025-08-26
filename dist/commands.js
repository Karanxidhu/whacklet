import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, } from "@solana/web3.js";
import bs58 from "bs58";
import prisma from "./db/prisma.js";
import { aesDecrypt, aesEncrypt } from "./encrypt.js";
import { AuthorityType, createAssociatedTokenAccountInstruction, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, createMintToInstruction, createSetAuthorityInstruction, createTransferInstruction, ExtensionType, getAssociatedTokenAddressSync, getMintLen, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TYPE_SIZE, } from "@solana/spl-token";
import { createInitializeInstruction, pack, } from "@solana/spl-token-metadata";
const SECRET = process.env.ENCRYPTION_SECRET;
const connection = new Connection(process.env.RPC_URL);
export async function createWallet(name, chatId) {
    try {
        const user = await prisma.user.findFirst({
            where: { chatId },
            include: { wallets: true },
        });
        if (user) {
            const existingWallet = user.wallets.find((w) => w.name === name);
            if (existingWallet) {
                console.log("Wallet already exists");
                return aesDecrypt(existingWallet.publicKey, SECRET);
            }
        }
        const wallet = Keypair.generate();
        const publicKey = aesEncrypt(wallet.publicKey.toBase58(), SECRET);
        const privateKey = aesEncrypt(bs58.encode(wallet.secretKey), SECRET);
        if (user) {
            await prisma.wallet.create({
                data: {
                    userId: user.id,
                    name,
                    publicKey,
                    privateKey,
                },
            });
        }
        else {
            const user = await prisma.user.create({
                data: {
                    chatId,
                    wallets: {
                        create: { name, publicKey, privateKey },
                    },
                    defaultWallet: 0,
                },
                include: { wallets: true },
            });
            await prisma.user.update({
                where: { chatId },
                data: { defaultWallet: user.wallets[0].id },
            });
        }
        console.log("Wallet created successfully ", wallet.publicKey.toBase58());
        return wallet.publicKey.toBase58();
    }
    catch (error) {
        console.error("Error creating wallet:", error);
    }
}
export async function getBalance(name, chatId) {
    try {
        const wallet = await prisma.user.findFirst({
            where: {
                chatId: chatId,
                wallets: {
                    some: {
                        name: name,
                    },
                },
            },
            select: {
                wallets: {
                    where: {
                        name: name,
                    },
                },
            },
        });
        if (wallet?.wallets[0]) {
            const address = aesDecrypt(wallet.wallets[0].publicKey, SECRET);
            const balance = await connection.getBalance(new PublicKey(address));
            function escapeMarkdownV2(text) {
                return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
            }
            return escapeMarkdownV2(`${balance / 1000000000} SOL`);
        }
        else {
            return "No wallet found";
        }
    }
    catch (error) {
        console.error("Error getting balance:", error);
    }
}
export async function transfer(from, to, amount) {
    try {
        const fromPubkey = new PublicKey(aesDecrypt(from.publicKey, SECRET));
        const fromPrivateKey = aesDecrypt(from.privateKey, SECRET);
        const toPubkey = new PublicKey(to);
        const payer = Keypair.fromSecretKey(bs58.decode(fromPrivateKey));
        const txn = new Transaction().add(SystemProgram.transfer({
            fromPubkey: fromPubkey,
            toPubkey: toPubkey,
            lamports: Math.floor(Number(amount) * 1e9),
        }));
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        txn.recentBlockhash = blockhash;
        txn.feePayer = payer.publicKey;
        const signature = await sendAndConfirmTransaction(connection, txn, [payer]);
        return signature;
    }
    catch (error) {
        console.log("Error transferring:", error);
        return "Error transferring";
    }
}
export async function createNFT(name, ticker, uri, chatId) {
    try {
        // Generate new mint
        const mintKeypair = Keypair.generate();
        const decimals = 0;
        // Get user + default wallet
        const wallet = await prisma.user.findFirst({
            where: { chatId },
            include: { wallets: true },
        });
        if (!wallet)
            return { success: false, error: "Wallet not found" };
        const defaultWallet = wallet.wallets.find((w) => w.id === wallet.defaultWallet);
        if (!defaultWallet)
            return { success: false, error: "Default wallet not found" };
        const payer = Keypair.fromSecretKey(bs58.decode(aesDecrypt(defaultWallet.privateKey, SECRET)));
        const metadata = {
            mint: mintKeypair.publicKey,
            name: name,
            symbol: ticker,
            uri: uri,
            additionalMetadata: [],
        };
        const mintLen = getMintLen([ExtensionType.MetadataPointer]);
        const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
        const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);
        const ata = await getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const mintTransaction = new Transaction().add(SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: mintLen,
            lamports: mintLamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }), createInitializeMetadataPointerInstruction(mintKeypair.publicKey, payer.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID), createInitializeMintInstruction(mintKeypair.publicKey, decimals, payer.publicKey, null, TOKEN_2022_PROGRAM_ID), createInitializeInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            mint: mintKeypair.publicKey,
            metadata: mintKeypair.publicKey,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            mintAuthority: payer.publicKey,
            updateAuthority: payer.publicKey,
        }), createAssociatedTokenAccountInstruction(payer.publicKey, ata, payer.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID), createMintToInstruction(mintKeypair.publicKey, ata, payer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID), createSetAuthorityInstruction(mintKeypair.publicKey, payer.publicKey, AuthorityType.MintTokens, null, [payer], TOKEN_2022_PROGRAM_ID));
        const signature = await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair]);
        await prisma.token.create({
            data: {
                userId: wallet.id,
                name: name,
                mintAddress: mintKeypair.publicKey.toBase58(),
            },
        });
        return {
            success: true,
            mintAddress: mintKeypair.publicKey.toBase58(),
            ata,
            signature,
        };
    }
    catch (error) {
        console.error("Error creating NFT:", error);
        return { success: false, error };
    }
}
export async function transferNFT(from, to, mintAddress) {
    try {
        const payer = Keypair.fromSecretKey(bs58.decode(aesDecrypt(from.privateKey, SECRET)));
        const toPubkey = new PublicKey(to);
        const mint = new PublicKey(mintAddress);
        const senderAta = await getAssociatedTokenAddressSync(new PublicKey(mintAddress), payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const receiverAta = await getAssociatedTokenAddressSync(new PublicKey(mintAddress), toPubkey, false, TOKEN_2022_PROGRAM_ID);
        const txn = new Transaction().add(createAssociatedTokenAccountInstruction(payer.publicKey, receiverAta, toPubkey, mint, TOKEN_2022_PROGRAM_ID), createTransferInstruction(senderAta, receiverAta, payer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID));
        const signature = await sendAndConfirmTransaction(connection, txn, [payer]);
        return { success: true, signature };
    }
    catch (error) {
        console.log("Error transferring:", error);
        return { success: false, error: "Error transferring" };
    }
}
export async function getTokenAccounts(walletPublicKey) {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, { programId: TOKEN_2022_PROGRAM_ID });
    console.log(JSON.stringify(tokenAccounts));
    return tokenAccounts;
}
//# sourceMappingURL=commands.js.map