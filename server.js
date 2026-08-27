const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "EZEDATA server is running"
  });
});

app.get("/", (req, res) => {
  res.send("EZEDATA VTU is coming soon.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`EZEDATA server running on port ${PORT}`);
});
