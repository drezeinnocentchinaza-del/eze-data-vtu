const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the website
app.use(express.static(path.join(__dirname, "public")));

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const VTPASS_API_KEY = process.env.VTPASS_API_KEY;
const VTPASS_SECRET_KEY = process.env.VTPASS_SECRET_KEY;

// =========================
// HEALTH CHECK
// =========================

app.get("/api/health", (req, res) => {
  res.json({
    status: true,
    message: "EZEDATA server is running"
  });
});

// =========================
// PAYSTACK: INITIALIZE PAYMENT
// =========================

app.post("/api/paystack/initialize", async (req, res) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount) {
      return res.status(400).json({
        status: false,
        message: "Email and amount are required"
      });
    }

    if (!PAYSTACK_SECRET_KEY) {
      console.error("PAYSTACK_SECRET_KEY is missing");
      return res.status(500).json({
        status: false,
        message: "Paystack is not configured"
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 100) {
      return res.status(400).json({
        status: false,
        message: "Minimum payment amount is ₦100"
      });
    }

    const reference =
      "EZEDATA_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 8).toUpperCase();

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          amount: Math.round(numericAmount * 100),
          currency: "NGN",
          reference,
          callback_url: `${req.protocol}://${req.get("host")}/payment/callback`,
          metadata: {
            source: "EZEDATA"
          }
        })
      }
    );

    const result = await response.json();

    console.log("Paystack initialize:", {
      httpStatus: response.status,
      status: result.status,
      message: result.message
    });

    if (!response.ok || !result.status) {
      return res.status(400).json({
        status: false,
        message: result.message || "Unable to initialize payment"
      });
    }

    return res.json({
      status: true,
      message: "Payment initialized",
      authorization_url: result.data.authorization_url,
      access_code: result.data.access_code,
      reference: result.data.reference
    });
  } catch (error) {
    console.error("Paystack initialization error:", error);

    return res.status(500).json({
      status: false,
      message: "Payment provider could not be reached"
    });
  }
});

// =========================
// PAYSTACK: VERIFY PAYMENT
// =========================

app.get("/api/paystack/verify/:reference", async (req, res) => {
  try {
    const reference = req.params.reference;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        status: false,
        message: "Paystack is not configured"
      });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const result = await response.json();

    console.log("Paystack verification:", {
      httpStatus: response.status,
      status: result.status,
      paymentStatus: result.data?.status
    });

    if (!response.ok || !result.status) {
      return res.status(400).json({
        status: false,
        message: result.message || "Payment verification failed"
      });
    }

    const successful = result.data.status === "success";

    return res.json({
      status: true,
      paid: successful,
      reference: result.data.reference,
      amount: result.data.amount,
      currency: result.data.currency,
      payment_status: result.data.status
    });
  } catch (error) {
    console.error("Paystack verification error:", error);

    return res.status(500).json({
      status: false,
      message: "Unable to verify payment"
    });
  }
});

// =========================
// PAYSTACK CALLBACK
// =========================

app.get("/payment/callback", (req, res) => {
  const reference = req.query.reference;

  if (!reference) {
    return res.redirect("/?payment=failed");
  }

  res.redirect(
    `/?payment=success&reference=${encodeURIComponent(reference)}`
  );
});

// =========================
// VTPASS PURCHASE
// =========================

app.post("/api/vtpass/purchase", async (req, res) => {
  try {
    const {
      request_id,
      serviceID,
      billersCode,
      variation_code,
      amount,
      phone
    } = req.body;

    if (!VTPASS_API_KEY || !VTPASS_SECRET_KEY) {
      console.error("VTpass credentials are missing");

      return res.status(500).json({
        status: false,
        message: "VTpass is not configured"
      });
    }

    if (!serviceID || !amount || !phone) {
      return res.status(400).json({
        status: false,
        message: "serviceID, amount and phone are required"
      });
    }

    const payload = {
      request_id:
        request_id ||
        `EZEDATA_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      serviceID,
      amount: Number(amount),
      phone
    };

    if (billersCode) {
      payload.billersCode = billersCode;
    }

    if (variation_code) {
      payload.variation_code = variation_code;
    }

    const response = await fetch(
      "https://vtpass.com/api/pay",
      {
        method: "POST",
        headers: {
          "api-key": VTPASS_API_KEY,
          "secret-key": VTPASS_SECRET_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    console.log("VTpass response:", {
      httpStatus: response.status,
      code: result.code,
      response_description: result.response_description
    });

    return res.status(response.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error("VTpass purchase error:", error);

    return res.status(500).json({
      status: false,
      message: "Unable to connect to VTpass"
    });
  }
});

// =========================
// FRONTEND FALLBACK
// =========================

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(`EZEDATA server running on port ${PORT}`);
});
