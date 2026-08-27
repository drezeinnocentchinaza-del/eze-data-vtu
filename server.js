const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 10000;

// VTpass Sandbox
const VTPASS_BASE_URL = "https://sandbox.vtpass.com/api";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));


// ========================================
// HEALTH CHECK
// ========================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "EZEDATA server is running"
  });
});


// ========================================
// VTpass PURCHASE
// ========================================

app.post("/api/vtpass/purchase", async (req, res) => {
  try {
    const {
      serviceID,
      amount,
      phone,
      variation_code,
      billersCode
    } = req.body;


    // ----------------------------------------
    // Validate required fields
    // ----------------------------------------

    if (!serviceID) {
      return res.status(400).json({
        success: false,
        message: "serviceID is required"
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "phone is required"
      });
    }

    if (!amount && !variation_code) {
      return res.status(400).json({
        success: false,
        message: "amount or variation_code is required"
      });
    }


    // ----------------------------------------
    // Check VTpass credentials
    // ----------------------------------------

    if (
      !process.env.VTPASS_API_KEY ||
      !process.env.VTPASS_SECRET_KEY
    ) {
      return res.status(500).json({
        success: false,
        message: "VTpass API credentials are not configured"
      });
    }


    // ----------------------------------------
    // Generate unique request ID
    // ----------------------------------------

    const requestId =
      "EZEDATA" +
      Date.now() +
      Math.floor(Math.random() * 1000);


    // ----------------------------------------
    // Build VTpass payload
    // ----------------------------------------

    const payload = {
      request_id: requestId,
      serviceID: serviceID,
      phone: phone
    };


    // Add amount when supplied
    if (amount) {
      payload.amount = Number(amount);
    }


    // Add variation code when supplied
    if (variation_code) {
      payload.variation_code = variation_code;
    }


    // Add billersCode when supplied.
    // This is required by some VTpass services,
    // such as data and cable services.
    if (billersCode) {
      payload.billersCode = billersCode;
    }


    // ----------------------------------------
    // Send purchase request to VTpass
    // ----------------------------------------

    const response = await fetch(
      `${VTPASS_BASE_URL}/pay`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.VTPASS_API_KEY,
          "secret-key": process.env.VTPASS_SECRET_KEY
        },

        body: JSON.stringify(payload)
      }
    );


    // ----------------------------------------
    // Read VTpass response
    // ----------------------------------------

    const data = await response.json();


    // ----------------------------------------
    // Successful VTpass transaction
    // VTpass normally returns code "000"
    // ----------------------------------------

    if (response.ok && data.code === "000") {
      return res.status(200).json({
        success: true,
        request_id: requestId,
        vtpass: data
      });
    }


    // ----------------------------------------
    // VTpass returned an error/pending response
    // ----------------------------------------

    return res.status(400).json({
      success: false,
      request_id: requestId,
      message:
        data.response_description ||
        "VTpass transaction was not successful",
      vtpass: data
    });


  } catch (error) {

    // ----------------------------------------
    // Server / connection error
    // ----------------------------------------

    console.error(
      "VTpass purchase error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to connect to VTpass",
      error: error.message
    });
  }
});


// ========================================
// SERVE EZEDATA WEBSITE
// ========================================

app.get("/", (req, res) => {
  res.sendFile(
    __dirname + "/public/index.html"
  );
});


// ========================================
// START SERVER
// ========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `EZEDATA server running on port ${PORT}`
  );
});
