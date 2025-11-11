const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

const driverRoutes = require("./routes/driverRoutes");
const deliveryRoutes = require("./routes/deliveryRoutes");
const routeRoutes = require("./routes/routeRoutes");
const walletRoutes = require("./routes/walletRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const authMiddleware = require("./middleware/auth");
require("./models/User");

dotenv.config();

const app = express();
app.use(cors({ origin: "*" })); // Enable CORS for all origins
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Routes
app.use("/api/drivers", driverRoutes);
app.use("/api/deliveries", authMiddleware, deliveryRoutes);
app.use("/api/notifications", authMiddleware, notificationRoutes);
app.use("/api/routes", authMiddleware, routeRoutes);
app.use("/api/wallet", authMiddleware, walletRoutes);
// In your main app.js or index.js, make sure you import all models
// Health check
app.get("/", (req, res) => {
  res.send("Errand App API running");
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

module.exports = app;
