const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 10000;
const VT_PASS_URL =
  process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/*
====================================================
HEALTH CHECK
====================================================
*/

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "EZEDATA server is running"
  });
});

/*
====================================================
PAYSTACK - INITIALIZE WALLET FUNDING
====================================================
*/

app.post("/api/wallet/fund", async (req, res) => {
  try {
    const { amount, email } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required"
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured"
      });
    }

    const amountInKobo = Math.round(Number(amount) * 100);

    if (amountInKobo < 10000) {
      return res.status(400).json({
        success: false,
        message: "Minimum funding amount is ₦100"
      });
    }

    const reference =
      "EZEWALLET_" +
      Date.now() +
      "_" +
      Math.floor(Math.random() * 100000);

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email,
          amount: amountInKobo,
          reference: reference,
          currency: "NGN",
          callback_url:
            process.env.PAYSTACK_CALLBACK_URL ||
            "https://ezedata-vtu-platform--ezehchinazs.replit.app/api/paystack/callback",
          metadata: {
            purpose: "wallet_funding",
            email: email,
            amount: Number(amount)
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).json({
        success: false,
        message: data.message || "Paystack could not initialize payment",
        provider_response: data
      });
    }

    return res.json({
      success: true,
      message: "Payment initialized",
      authorization_url: data.data.authorization_url,
      checkout_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference
    });
  } catch (error) {
    console.error("Paystack initialization error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment provider did not respond",
      error: error.message
    });
  }
});

/*
====================================================
PAYSTACK - VERIFY TRANSACTION
====================================================
*/

app.get("/api/paystack/verify/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured"
      });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).json({
        success: false,
        message: data.message || "Could not verify payment",
        provider_response: data
      });
    }

    return res.json({
      success: true,
      status: data.data.status,
      reference: data.data.reference,
      amount: data.data.amount / 100,
      email: data.data.customer?.email || null,
      provider_response: data.data
    });
  } catch (error) {
    console.error("Paystack verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment",
      error: error.message
    });
  }
});

/*
====================================================
PAYSTACK CALLBACK
====================================================
*/

app.get("/api/paystack/callback", async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).send("Payment reference is missing.");
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const data = await response.json();

    if (
      data.status &&
      data.data &&
      data.data.status === "success"
    ) {
      return res.send(`
        <html>
          <head>
            <title>EZEDATA Payment Successful</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family:Arial;text-align:center;padding:50px">
            <h1>Payment Successful</h1>
            <p>Your payment was successful.</p>
            <p>Reference: ${reference}</p>
            <p>You can return to EZEDATA.</p>
          </body>
        </html>
      `);
    }

    return res.send(`
      <html>
        <head>
          <title>EZEDATA Payment</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family:Arial;text-align:center;padding:50px">
          <h1>Payment Not Completed</h1>
          <p>Your payment could not be confirmed as successful.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Callback error:", error);
    return res.status(500).send("Unable to verify payment.");
  }
});

/*
====================================================
VTPASS PURCHASE
====================================================
*/

app.post("/api/vtpass/purchase", async (req, res) => {
  try {
    const {
      serviceID,
      amount,
      phone,
      variation_code,
      billersCode
    } = req.body;

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

    if (
      !process.env.VTPASS_API_KEY ||
      !process.env.VTPASS_SECRET_KEY
    ) {
      return res.status(500).json({
        success: false,
        message: "VTpass API credentials are not configured"
      });
    }

    const requestId =
      "EZEDATA" +
      Date.now() +
      Math.floor(Math.random() * 1000);

    const payload = {
      request_id: requestId,
      serviceID: serviceID,
      phone: phone
    };

    if (amount) {
      payload.amount = Number(amount);
    }

    if (variation_code) {
      payload.variation_code = variation_code;
    }

    if (billersCode) {
      payload.billersCode = billersCode;
    }

    const response = await fetch(`${VT_PASS_URL}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.VTPASS_API_KEY,
        "secret-key": process.env.VTPASS_SECRET_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: "VTpass rejected the request",
        provider_response: data
      });
    }

    if (data.code === "000") {
      return res.json({
        success: true,
        message: "Purchase successful",
        request_id: requestId,
        provider_response: data
      });
    }

    return res.status(400).json({
      success: false,
      message:
        data.response_description ||
        data.message ||
        "Purchase not completed",
      request_id: requestId,
      provider_response: data
    });
  } catch (error) {
    console.error("VTpass purchase error:", error);

    return res.status(500).json({
      success: false,
      message: "VTpass provider did not respond",
      error: error.message
    });
  }
});

/*
====================================================
START SERVER
====================================================
*/

app.listen(PORT, "0.0.0.0", () => {
  console.log(`EZEDATA server running on port ${PORT}`);
});
