import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import detectEthereumProvider from "@metamask/detect-provider";
import SepoliaETHBuyerABI from "./abi/SepoliaETHBuyerABI.json";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";

import usdtIcon from "./assets/usdt-icon.png";
import sepoliaEthIcon from "./assets/sepolia-eth-icon.png";
import xIcon from "./assets/X.png";
import telegramIcon from "./assets/Telegram.png";
import youtubeIcon from "./assets/YouTube.png";

const processedEvents = new Set();

const USDTABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
];
const CONTRACT_ADDRESS = "0x669AA9f2D877d8aa874256a6115f011970f9f8e7"; // Arbitrum Mainnet 合约地址
const USDT_ADDRESS = "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"; // Arbitrum Mainnet USDT 地址
const ARB_EXPLORER_URL = "https://arbiscan.io/tx/"; // Arbitrum Mainnet 浏览器
const CHAIN_ID = "42161"; // Arbitrum Mainnet chainId

function App() {
    const [account, setAccount] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [usdtAmount, setUsdtAmount] = useState("");
    const [ethAmount, setEthAmount] = useState("0");
    const [usdtBalance, setUsdtBalance] = useState("0");
    const [ethBalance, setEthBalance] = useState("0");
    const [network, setNetwork] = useState("Arbitrum Mainnet");
    const [provider, setProvider] = useState(null);
    const [pricePerEth] = useState(0.3);
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [txStatus, setTxStatus] = useState(null);
    const [isNetworkChecked, setIsNetworkChecked] = useState(false);

    // Define all functions before useEffect hooks
    const listenForPurchases = useCallback(
        (ethersProvider, userAccount) => {
            if (!ethersProvider || !userAccount) return;

            const contract = new ethers.Contract(CONTRACT_ADDRESS, SepoliaETHBuyerABI, ethersProvider);

            contract.removeAllListeners("SepoliaETHPurchased");

            contract.on("SepoliaETHPurchased", async (buyer, usdtAmount, sepoliaAmount, event) => {
                console.log("SepoliaETHPurchased Event:", {
                    buyer,
                    usdtAmount: usdtAmount.toString(),
                    sepoliaAmount: sepoliaAmount.toString(),
                    transactionHash: event.transactionHash || (event.log && event.log.transactionHash),
                    logIndex: event.logIndex || event.index || "0",
                });

                const eventHash = `${event.transactionHash || (event.log && event.log.transactionHash)}-${event.logIndex || event.index || "0"}`;
                if (processedEvents.has(eventHash)) return;
                processedEvents.add(eventHash);

                if (buyer.toLowerCase() === userAccount.toLowerCase()) {
                    const usdtAmountFormatted = ethers.utils.formatUnits(usdtAmount, 6);
                    const ethAmountCalculated = parseFloat(usdtAmountFormatted) / pricePerEth;
                    const arbTxHash = event.transactionHash || (event.log && event.log.transactionHash);
                    if (!arbTxHash || !arbTxHash.startsWith("0x")) return;

                    setHistory((prev) => {
                        const newTimestamp = new Date().toLocaleString();
                        const exists = prev.some(
                            (tx) =>
                                tx.txHash === arbTxHash &&
                                tx.type === "ethReceived" &&
                                tx.timestamp === newTimestamp
                        );
                        if (exists) return prev;

                        return [
                            {
                                type: "ethReceived",
                                eth: ethAmountCalculated.toFixed(4),
                                message: `🎉 Processing your transaction: ${ethAmountCalculated.toFixed(4)} Sepolia ETH will arrive soon!`,
                                timestamp: newTimestamp,
                                txHash: arbTxHash,
                                explorerUrl: ARB_EXPLORER_URL,
                            },
                            ...prev.slice(0, 4),
                        ];
                    });
                }
            });

            return () => contract.removeAllListeners("SepoliaETHPurchased");
        },
        [pricePerEth]
    );

    const connectWallet = useCallback(async () => {
        const ethProvider = await detectEthereumProvider();
        if (!ethProvider) {
            setError("Please install MetaMask!");
            return;
        }

        try {
            const accounts = await ethProvider.request({ method: "eth_requestAccounts" });
            setAccount(accounts[0]);
            const ethersProvider = new ethers.providers.Web3Provider(ethProvider);
            setProvider(ethersProvider);
            setStatus("Wallet connected!");

            await new Promise((resolve) => setTimeout(resolve, 1000));
            await checkNetwork(ethProvider);
            await updateBalance(ethersProvider, accounts[0]);
        } catch (error) {
            setError("Connection failed: " + (error.message || "Unknown error"));
        }
    }, []);

    const checkNetwork = useCallback(async (ethProvider, retries = 3, delay = 1000) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                let networkId;
                try {
                    console.log(`Attempt ${attempt}: Requesting net_version...`);
                    networkId = await ethProvider.request({ method: "net_version" });
                    console.log(`net_version response: ${networkId}`);
                } catch (err) {
                    console.log(`net_version failed: ${err.message}. Falling back to eth_chainId...`);
                    const chainIdHex = await ethProvider.request({ method: "eth_chainId" });
                    console.log(`eth_chainId response: ${chainIdHex}`);
                    networkId = parseInt(chainIdHex, 16).toString();
                }
                if (!networkId) {
                    throw new Error("No network ID returned");
                }
                if (networkId !== CHAIN_ID) {
                    setError("Please switch to Arbitrum Mainnet!");
                    await ethProvider.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: "0x" + parseInt(CHAIN_ID).toString(16) }],
                    });
                    setNetwork("Arbitrum Mainnet");
                    setStatus("Switched to Arbitrum Mainnet!");
                    setError("");
                } else {
                    setNetwork("Arbitrum Mainnet");
                    setError("");
                }
                setIsNetworkChecked(true);
                return;
            } catch (error) {
                console.error(`Attempt ${attempt} failed: ${error.message}`);
                if (attempt === retries) {
                    setError(
                        `Error checking network after ${retries} attempts: ${
                            error.message || "Unknown error"
                        }. Please ensure MetaMask is connected to Arbitrum Mainnet with a reliable RPC endpoint (e.g., https://arb1.arbitrum.io/rpc) and your internet connection is stable.`
                    );
                } else {
                    setStatus(`Retrying network check... (${attempt}/${retries})`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
    }, []);

    const updateBalance = useCallback(async (ethersProvider, account) => {
        if (!ethersProvider || !account) {
            setUsdtBalance("0");
            setEthBalance("0");
            return;
        }
        try {
            const usdtContract = new ethers.Contract(USDT_ADDRESS, USDTABI, ethersProvider);
            const usdtBalance = await usdtContract.balanceOf(account);
            setUsdtBalance(ethers.utils.formatUnits(usdtBalance, 6));

            const sepoliaProvider = new ethers.providers.JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/PYvU9d7QOGRiPxMs8s22aP3r-KGGky5q`);
            const ethBal = await sepoliaProvider.getBalance(account);
            setEthBalance(ethers.utils.formatEther(ethBal));

            setStatus("Balance updated!");
            setError("");
        } catch (error) {
            // Check if the error is related to a network mismatch
            if (error.code === "NETWORK_ERROR" && error.event === "changed") {
                setError("Please switch to Arbitrum Mainnet and refresh the page.");
                setStatus("Network mismatch detected.");
            } else {
                setError("Error updating balance: " + (error.message || "Unknown error"));
            }
            setUsdtBalance("0");
            setEthBalance("0");
        }
    }, []);

    const handleUsdtChange = useCallback(
        (event) => {
            const usdt = event.target.value;
            if (usdt < 0) return;
            setUsdtAmount(usdt);
            const eth = usdt ? (parseFloat(usdt) / pricePerEth).toFixed(4) : "0";
            setEthAmount(eth);
            setError(!usdt || parseFloat(usdt) <= 0 ? "Please enter an amount greater than 0!" : "");
        },
        [pricePerEth]
    );

    const setMaxUsdt = useCallback(() => {
        if (parseFloat(usdtBalance) <= 0) {
            setError("Insufficient balance!");
            return;
        }
        setUsdtAmount(usdtBalance);
        setEthAmount((parseFloat(usdtBalance) / pricePerEth).toFixed(4));
        setError("");
    }, [usdtBalance, pricePerEth]);

    const buySepoliaETH = useCallback(async () => {
        if (!account) {
            setError("Please connect wallet first!");
            return;
        }
        if (!usdtAmount || parseFloat(usdtAmount) <= 0) {
            setError("Please enter an amount greater than 0!");
            return;
        }
        if (!provider) {
            setError("Provider not initialized. Please reconnect wallet.");
            return;
        }

        setIsLoading(true);
        setTxStatus("pending");
        setError("");
        try {
            const signer = provider.getSigner();
            const usdtWei = ethers.utils.parseUnits(usdtAmount, 6);

            const usdtContract = new ethers.Contract(USDT_ADDRESS, USDTABI, signer);
            const balance = await usdtContract.balanceOf(account);
            if (balance.lt(usdtWei)) throw new Error("Insufficient USDT balance");

            const allowance = await usdtContract.allowance(account, CONTRACT_ADDRESS);
            if (allowance.lt(usdtWei)) {
                setStatus("Approving USDT...");
                const approveTx = await usdtContract.approve(CONTRACT_ADDRESS, usdtWei);
                await approveTx.wait();
                setStatus("USDT approved!");
            }

            const contract = new ethers.Contract(CONTRACT_ADDRESS, SepoliaETHBuyerABI, signer);
            setStatus("Buying Sepolia ETH...");
            const tx = await contract.buySepoliaETH(usdtWei, { gasLimit: 300000 });
            await tx.wait();

            setTxStatus("success");
            setTimeout(() => {
                setStatus(`Purchase successful! Waiting for ${ethAmount} Sepolia ETH...`);
                setTxStatus(null);
                updateBalance(provider, account);
            }, 2000);
        } catch (error) {
            console.error("Error in buySepoliaETH:", error);
            setTxStatus("failed");
            setTimeout(() => {
                setError(
                    error.code === "ACTION_REJECTED"
                        ? "Transaction cancelled: You rejected the transaction."
                        : error.code === "CALL_EXCEPTION"
                        ? "Transaction reverted: Contract rejected the transaction."
                        : "Error: " + (error.message || "Unknown error")
                );
                setTxStatus(null);
            }, 2000);
        } finally {
            setIsLoading(false);
        }
    }, [account, usdtAmount, ethAmount, provider]);

    // Now place useEffect hooks after all function declarations
    useEffect(() => {
        const savedHistory = localStorage.getItem("txHistory");
        if (savedHistory) {
            try {
                const parsedHistory = JSON.parse(savedHistory);
                setHistory(parsedHistory.filter((tx) => tx && tx.type && tx.message && tx.timestamp && tx.txHash));
            } catch (err) {
                setHistory([]);
                localStorage.removeItem("txHistory");
            }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("txHistory", JSON.stringify(history));
    }, [history]);

    useEffect(() => {
        if (provider && account) {
            const cleanup = listenForPurchases(provider, account);
            return cleanup;
        }
    }, [provider, account, listenForPurchases]);

    useEffect(() => {
        if (provider && account && isNetworkChecked) {
            updateBalance(provider, account);
        }
    }, [provider, account, isNetworkChecked, updateBalance]);

    useEffect(() => {
        const ethProvider = window.ethereum;
        if (!ethProvider) return;

        const handleChainChanged = () => {
            setIsNetworkChecked(false);
            checkNetwork(ethProvider);
            updateBalance(provider, account);
        };

        const handleAccountsChanged = (accounts) => {
            if (accounts.length === 0) {
                setAccount("");
                setProvider(null);
                setStatus("");
                setError("Wallet disconnected!");
                setIsNetworkChecked(false);
            } else {
                setAccount(accounts[0]);
                const ethersProvider = new ethers.providers.Web3Provider(ethProvider);
                setProvider(ethersProvider);
                setIsNetworkChecked(false);
                checkNetwork(ethProvider);
                updateBalance(ethersProvider, accounts[0]);
            }
        };

        ethProvider.on("chainChanged", handleChainChanged);
        ethProvider.on("accountsChanged", handleAccountsChanged);

        return () => {
            ethProvider.removeListener("chainChanged", handleChainChanged);
            ethProvider.removeListener("accountsChanged", handleAccountsChanged);
        };
    }, [provider, account, checkNetwork, updateBalance]);

    return (
        <motion.div className="App" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
            <nav className="navbar">
                <div className="nav-right">
                    <motion.div className="network" whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 300 }}>
                        {network}
                    </motion.div>
                    <motion.button
                        className="connect-btn"
                        onClick={connectWallet}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
                    </motion.button>
                </div>
            </nav>

            <div className="swap-container">
                <motion.div className="swap-box" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
                    <div className="swap-header">
                        <p className="swap-tip">Enter amount to swap</p>
                    </div>
                    <div className="input-group">
                        <div className="token-info">
                            <div className="token-wrapper">
                                <img src={usdtIcon} alt="USDT" className="token-icon" />
                                <span className="token">USDT</span>
                            </div>
                            <span className="balance-text">
                                Balance: {usdtBalance}{" "}
                                <motion.button
                                    className="refresh-btn"
                                    onClick={() => updateBalance(provider, account)}
                                    whileHover={{ rotate: 360 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    ↻
                                </motion.button>
                            </span>
                        </div>
                        <div className="input-wrapper">
                            <input type="number" value={usdtAmount} onChange={handleUsdtChange} placeholder="0.0" step="0.01" />
                            <motion.button
                                className="max-btn"
                                onClick={setMaxUsdt}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 300 }}
                            >
                                Max
                            </motion.button>
                        </div>
                    </div>
                    <motion.div className="arrow" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.4 }}>
                        ↓
                    </motion.div>
                    <div className="input-group">
                        <div className="token-info">
                            <div className="token-wrapper">
                                <img src={sepoliaEthIcon} alt="Sepolia ETH" className="token-icon" />
                                <span className="token">Sepolia ETH</span>
                            </div>
                            <span className="balance-text">
                                Balance: {ethBalance}{" "}
                                <motion.button
                                    className="refresh-btn"
                                    onClick={() => updateBalance(provider, account)}
                                    whileHover={{ rotate: 360 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    ↻
                                </motion.button>
                            </span>
                        </div>
                        <div className="input-wrapper">
                            <input type="text" value={ethAmount} disabled placeholder="0.0" />
                        </div>
                    </div>
                    <div className="price-info">
                        <p>1 Sepolia ETH = {pricePerEth} USDT</p>
                        <p>Slippage Tolerance: 0.5% (Fixed)</p>
                    </div>
                    <motion.button
                        className="swap-btn"
                        onClick={buySepoliaETH}
                        disabled={isLoading || !isNetworkChecked}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <AnimatePresence mode="wait">
                            {isLoading ? (
                                <motion.span
                                    key="spinner"
                                    className="loading-spinner"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                />
                            ) : (
                                <motion.span
                                    key="text"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    Swap
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </motion.button>
                    <motion.p className="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                        <AnimatePresence mode="wait">
                            {txStatus === "pending" && (
                                <motion.span
                                    key="pending"
                                    className="tx-status pending"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    Processing transaction...
                                </motion.span>
                            )}
                            {txStatus === "success" && (
                                <motion.span
                                    key="success"
                                    className="tx-status success"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <span className="checkmark">✔</span> Transaction successful!
                                </motion.span>
                            )}
                            {txStatus === "failed" && (
                                <motion.span
                                    key="failed"
                                    className="tx-status failed"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <span className="cross">✖</span> Transaction failed!
                                </motion.span>
                            )}
                            {!txStatus && (
                                <motion.span
                                    key="status"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    Status: {status}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </motion.p>
                    {error && (
                        <motion.p
                            className="error"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            Error: {error}
                        </motion.p>
                    )}
                </motion.div>

                {history.length > 0 && (
                    <motion.div className="history-box" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
                        <h3>Recent Transactions</h3>
                        <ul>
                            {history.map((tx, index) => {
                                const txHash = tx.txHash || "Unknown";
                                const displayHash = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
                                return (
                                    <motion.li
                                        key={`${txHash}-${tx.type}-${index}`}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.3, delay: index * 0.1 }}
                                    >
                                        {tx.message} at {tx.timestamp} (Tx Hash: {displayHash}) -{" "}
                                        <a
                                            href={`${tx.explorerUrl}${txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="tx-link"
                                        >
                                            View on Explorer
                                        </a>
                                    </motion.li>
                                );
                            })}
                        </ul>
                    </motion.div>
                )}
            </div>

            <footer className="social-footer">
                <h4>Follow Us</h4>
                <div className="social-links">
                    <motion.a
                        href="https://x.com/zwh20010228"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="social-link"
                        whileHover={{ scale: 1.1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <img src={xIcon} alt="Twitter/X" className="social-icon" />
                        Twitter/X
                    </motion.a>
                    <motion.a
                        href="https://t.me/Sepoliabuy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="social-link"
                        whileHover={{ scale: 1.1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <img src={telegramIcon} alt="Telegram" className="social-icon" />
                        Telegram
                    </motion.a>
                    <motion.a
                        href="https://www.youtube.com/@NiceGamezwh"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="social-link"
                        whileHover={{ scale: 1.1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <img src={youtubeIcon} alt="YouTube" className="social-icon" />
                        YouTube
                    </motion.a>
                </div>
            </footer>
        </motion.div>
    );
}

export default App;