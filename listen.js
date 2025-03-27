const { ethers } = require("ethers");
require("dotenv").config();

// 从 .env 文件中获取私钥和 API 密钥
const privateKey = process.env.PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

// Arb Mainnet WebSocket provider (监听事件)
const arbProvider = new ethers.providers.WebSocketProvider(`wss://arb-mainnet.g.alchemy.com/v2/${alchemyApiKey}`);
// Sepolia provider (发送 ETH)
const sepoliaProvider = new ethers.providers.JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`);

const wallet = new ethers.Wallet(privateKey);
const arbSigner = wallet.connect(arbProvider); // 用于 Arb Mainnet
const sepoliaSigner = wallet.connect(sepoliaProvider); // 用于 Sepolia

const contractAddress = "0x669AA9f2D877d8aa874256a6115f011970f9f8e7"; // Arbitrum Mainnet 合约地址
const abi = [
    "event SepoliaETHPurchased(address indexed buyer, uint256 usdtAmount, uint256 sepoliaAmount)"
];

const contract = new ethers.Contract(contractAddress, abi, arbProvider);

console.log("Listening for SepoliaETHPurchased events on Arbitrum Mainnet...");

// 添加 WebSocket 错误处理
arbProvider._websocket.on("error", (error) => {
    console.error("WebSocket Error:", error);
});

// 监听连接关闭并尝试重连
arbProvider._websocket.on("close", (code, reason) => {
    console.error(`WebSocket closed with code ${code}: ${reason}. Reconnecting...`);
    setTimeout(() => {
        console.log("Attempting to reconnect...");
        // 这里可以手动重新初始化 arbProvider，但 ethers v5 会自动尝试重连
    }, 5000);
});

contract.on("SepoliaETHPurchased", async (buyer, usdtAmount, sepoliaAmount) => {
    const usdtAmountFormatted = ethers.utils.formatUnits(usdtAmount, 6);
    const sepoliaAmountFormatted = ethers.utils.formatEther(sepoliaAmount);

    console.log(`Purchase detected: ${buyer} bought ${sepoliaAmountFormatted} Sepolia ETH for ${usdtAmountFormatted} USDT`);

    try {
        const balance = await sepoliaProvider.getBalance(wallet.address);
        const ethBalance = ethers.utils.formatEther(balance);
        if (balance.lt(sepoliaAmount)) {
            throw new Error(`Insufficient Sepolia ETH balance: ${ethBalance} ETH available, ${sepoliaAmountFormatted} ETH required`);
        }

        const tx = await sepoliaSigner.sendTransaction({
            to: buyer,
            value: sepoliaAmount,
            gasLimit: 21000,
        });

        console.log(`Sepolia ETH sent: ${tx.hash}`);
        await tx.wait();
        console.log(`Transaction confirmed: ${tx.hash}`);
    } catch (error) {
        console.error("Error sending Sepolia ETH:", error.message);
    }
});
