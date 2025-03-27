const express = require("express");
const fs = require("fs");
const cors = require("cors"); // 引入 cors 包
const app = express();
const port = 3001;

// 启用 CORS，允许来自 http://localhost:3000 的请求
app.use(cors({
    origin: "http://localhost:3000",
    methods: ["GET"],
    allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

app.get("/tx-log", (req, res) => {
    try {
        const data = fs.readFileSync("sepolia_tx_log.json", "utf8");
        res.json(JSON.parse(data));
    } catch (error) {
        res.json({});
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
