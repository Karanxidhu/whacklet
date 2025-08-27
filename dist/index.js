import { Bot } from "grammy";
import dotenv from "dotenv";
import { createNFT, createWallet, getBalance, getTokenAccounts, transfer, transferNFT, } from "./commands.js";
import prisma from "./db/prisma.js";
import { aesDecrypt } from "./encrypt.js";
import { PublicKey } from "@solana/web3.js";
dotenv.config();
const bot = new Bot(process.env.BOT_TOKEN);
function escapeMarkdownV2(text) {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
bot.command("start", async (ctx) => {
    await ctx.reply("Hello there!\nWelcome to Whacklet!\n\nSend /createwallet to create a fresh wallet");
    await bot.api.setMyCommands([
        { command: "about", description: "About the bot" },
        { command: "help", description: "Help" },
        { command: "createwallet", description: "Create a wallet" },
        { command: "getwallets", description: "Get wallets" },
        { command: "checkbalance", description: "Check wallet balace" },
        { command: "getdefaultwallet", description: "Get default wallets" },
        { command: "setdefaultwallet", description: "set default wallets" },
    ], {
        scope: { type: "chat", chat_id: ctx.chat.id },
    });
});
bot.command("home", async (ctx) => {
    await ctx.reply("Back to main menu");
    await bot.api.setMyCommands([
        { command: "start", description: "Start the bot" },
        { command: "about", description: "About the bot" },
        { command: "help", description: "Help" },
    ]);
});
bot.command("about", async (ctx) => {
    await ctx.reply("Whacklet is a Solana wallet manager bot");
});
bot.command("help", async (ctx) => {
    await ctx.reply("Send /createwallet to create a fresh wallet");
});
bot.command("createwallet", async (ctx) => {
    const fullText = ctx.message?.text ?? "";
    const chatId = ctx.chat.id;
    const args = fullText.split(" ").slice(1);
    const name = args.join(" ");
    if (!name) {
        await ctx.reply("❌ Please provide a name, e.g. `/createaccount Alice`", {
            parse_mode: "Markdown",
        });
        return;
    }
    await ctx.reply("Creating wallet...");
    const publicKey = await createWallet(name, chatId.toString());
    await bot.api.sendMessage(chatId, `🎉 *Wallet Created Successfully* 🎉

👛 *Wallet Name:* \`${name}\`
🔑 *Public Key:* \`${publicKey}\`

⚠️ _Keep your private key safe and never share it_`, { parse_mode: "MarkdownV2" });
});
bot.command("getwallets", async (ctx) => {
    const chatId = ctx.chat.id;
    await ctx.reply("Fetching wallets...");
    const user = await prisma.user.findFirst({
        where: { chatId: chatId.toString() },
        include: { wallets: true },
    });
    if (!user) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    let reply = `*💼 Wallets:*\n`;
    for (const wallet of user.wallets) {
        reply += `\n👛 *Name:* \`${wallet.name}\`\n🔑 *Public Key:* \`${aesDecrypt(wallet.publicKey, process.env.ENCRYPTION_SECRET)}\`\n`;
    }
    reply += `\n⚠️ _Keep your private key safe and never share it_`;
    await bot.api.sendMessage(chatId, reply, { parse_mode: "MarkdownV2" });
});
bot.command("checkbalance", async (ctx) => {
    const chatId = ctx.chat.id;
    const fullText = ctx.message?.text ?? "";
    const args = fullText.split(" ").slice(1);
    const name = args.join(" ");
    if (!name) {
        await ctx.reply("❌ Please provide a name, e.g. `/checkbalance Alice`\n To get account list, use /getwallets", {
            parse_mode: "Markdown",
        });
        return;
    }
    await ctx.reply("Checking balance... 🔍");
    const balance = await getBalance(name, chatId.toString());
    await ctx.reply(`💰 *Wallet Balance*\n\n👛 *Name:* \`${name}\`\n📊 *Balance:* ${balance}`, { parse_mode: "MarkdownV2" });
});
bot.command("getdefaultwallet", async (ctx) => {
    const chatId = ctx.chat.id;
    await ctx.reply("Fetching default wallet...");
    const user = await prisma.user.findFirst({
        where: { chatId: chatId.toString() },
        include: { wallets: true },
    });
    if (!user) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    const defaultWallet = user.wallets.find((w) => w.id === user.defaultWallet);
    if (!defaultWallet) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    await ctx.reply(`💰 *Default Wallet*\n\n👛 *Name:* \`${defaultWallet.name}\`\n🔑 *Public Key:* \`${aesDecrypt(defaultWallet.publicKey, process.env.ENCRYPTION_SECRET)}\`\n`, { parse_mode: "MarkdownV2" });
});
bot.command("setdefaultwallet", async (ctx) => {
    const chatId = ctx.chat.id;
    const fullText = ctx.message?.text ?? "";
    const args = fullText.split(" ").slice(1);
    const name = args.join(" ");
    if (!name) {
        await ctx.reply("❌ Please provide a name, e.g. `/setdefaultwallet Alice`", {
            parse_mode: "Markdown",
        });
        return;
    }
    await ctx.reply("Setting default wallet...");
    const user = await prisma.user.findFirst({
        where: { chatId: chatId.toString() },
        include: { wallets: true },
    });
    if (!user) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    const wallet = user.wallets.find((w) => w.name === name);
    if (!wallet) {
        await ctx.reply("❌ Wallet not found. Create one with /createwallet");
        return;
    }
    await prisma.user.update({
        where: { chatId: chatId.toString() },
        data: { defaultWallet: wallet.id },
    });
    await ctx.reply(`💰 *Default Wallet Changed*\n\n👛 *Name:* \`${wallet.name}\`\n🔑 *Public Key:* \`${aesDecrypt(wallet.publicKey, process.env.ENCRYPTION_SECRET)}\`\n`, { parse_mode: "MarkdownV2" });
});
bot.command("transfer", async (ctx) => {
    const fullText = ctx.message?.text ?? "";
    const args = fullText.split(" ").slice(1);
    const to = args[0];
    const amount = args[1];
    if (!to || !amount) {
        await ctx.reply("❌ Please provide a name, e.g. `/transfer Alice Bob 10`", {
            parse_mode: "Markdown",
        });
        return;
    }
    await ctx.reply("Transferring...");
    const user = await prisma.user.findFirst({
        where: { chatId: ctx.chat.id.toString() },
        include: { wallets: true },
    });
    if (!user) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    const from = user.wallets.find((w) => w.id === user.defaultWallet);
    if (!from) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    const signature = await transfer(from, to, amount);
    await ctx.reply(`💰 *Transfer Successful*\n\n` +
        `👛 *Name:* \`${escapeMarkdownV2(from.name)}\`\n` +
        `🔑 *Public Key:* \`${escapeMarkdownV2(aesDecrypt(from.publicKey, process.env.ENCRYPTION_SECRET))}\`\n` +
        `👛 *To:* \`${escapeMarkdownV2(to)}\`\n` +
        `💰 *Amount:* \`${escapeMarkdownV2(amount)}\`\n` +
        `🔗 *Transaction Signature:* \`${escapeMarkdownV2(signature)}\``, { parse_mode: "MarkdownV2" });
});
bot.catch((err) => {
    console.error(err);
});
bot.command("nft", async (ctx) => {
    const fullText = ctx.message?.text ?? "";
    const args = fullText.split(" ").slice(1);
    const name = args[0];
    const ticker = args[1];
    const uri = args[2];
    if (!name || !ticker || !uri) {
        await ctx.reply("❌ Please provide a name, e.g. `/nft Alice ALC https://cdn.100xdevs.com/metadata.json`", {
            parse_mode: "Markdown",
        });
        return;
    }
    await ctx.reply("Creating NFT...");
    const mint = await createNFT(name, ticker, uri, ctx.chat.id.toString());
    if (mint.success) {
        await ctx.reply(`💰 *NFT Created Successfully* 🎉

👛 *Name:* \`${name}\`
🔑 *Mint Address:* \`${mint.mintAddress}\`
🔑 *Signature:* \`${mint.signature}\`
🔑 *Associated Token Address:* \`${mint.ata}\`
⚠️ _Keep your private key safe and never share it_`, { parse_mode: "MarkdownV2" });
    }
    else {
        await ctx.reply(`💰 *NFT Creation Failed* 😔`, {
            parse_mode: "MarkdownV2",
        });
    }
});
bot.command("transfernft", async (ctx) => {
    const fullText = ctx.message?.text ?? "";
    const args = fullText.split(" ").slice(1);
    const to = args[0];
    const mintAddress = args[1];
    if (!to || !mintAddress) {
        await ctx.reply("❌ Please provide a name, e.g. `/transfernft <to addresss> <mint address>`", {
            parse_mode: "Markdown",
        });
        return;
    }
    await ctx.reply("Transferring...");
    const user = await prisma.user.findFirst({
        where: { chatId: ctx.chat.id.toString() },
        include: { wallets: true },
    });
    if (!user) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    const from = user.wallets.find((w) => w.id === user.defaultWallet);
    if (!from) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    const transfer = await transferNFT(from, to, mintAddress);
    if (transfer.success) {
        await ctx.reply(`💰 *Transfer Successful*\n\n` +
            `👛 *Name:* \`${escapeMarkdownV2(from.name)}\`\n` +
            `🔑 *Public Key:* \`${escapeMarkdownV2(aesDecrypt(from.publicKey, process.env.ENCRYPTION_SECRET))}\`\n` +
            `👛 *To:* \`${escapeMarkdownV2(to)}\`\n` +
            `🔑 *Mint Address:* \`${escapeMarkdownV2(mintAddress)}\`\n` +
            `🔗 *Transaction Signature:* \`${escapeMarkdownV2(transfer.signature)}\``, { parse_mode: "MarkdownV2" });
    }
    else {
        await ctx.reply(`💰 *Transfer Failed* 😔`, { parse_mode: "MarkdownV2" });
    }
});
bot.command("gettokens", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const user = await prisma.user.findFirst({
        where: { chatId: chatId },
        include: { wallets: true },
    });
    if (!user) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    const wallet = user.wallets.find((w) => w.id === user.defaultWallet);
    if (!wallet) {
        await ctx.reply("❌ You don't have any wallets yet. Create one with /createwallet");
        return;
    }
    const tokenAccounts = await getTokenAccounts(new PublicKey(aesDecrypt(wallet.publicKey, process.env.ENCRYPTION_SECRET)));
    if (tokenAccounts.length === 0) {
        await ctx.reply("No token accounts found");
        return;
    }
    let reply = `*💼 Token Accounts:*\n`;
    for (const tokenAccount of tokenAccounts) {
        const { mint, tokenAmount } = tokenAccount.account.data.parsed.info;
        const pubkey = tokenAccount.pubkey;
        const amount = tokenAmount.uiAmount;
        reply += `
━━━━━━━━━━━━━━━━━━━━
👛 *Token Mint:* \`${mint}\`
🔑 *Account PubKey:* \`${pubkey}\`
💰 *Balance:* \`${amount}\`
━━━━━━━━━━━━━━━━━━━━
`;
    }
    reply += `\n⚠️ _Keep your private key safe and never share it_`;
    await bot.api.sendMessage(chatId, reply, { parse_mode: "MarkdownV2" });
});
bot.start();
//# sourceMappingURL=index.js.map