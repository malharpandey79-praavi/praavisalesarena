const dotenv = require("dotenv");

dotenv.config();

const USERS = [
  {
    username: "admin",
    displayName: "Admin",
    role: "admin",
    password: process.env.ADMIN_PASSWORD || "admin123",
  },
  {
    username: "vishal",
    displayName: "Vishal",
    role: "sales",
    password: process.env.VISHAL_PASSWORD || "vishal123",
  },
  {
    username: "aryan",
    displayName: "Aryan",
    role: "sales",
    password: process.env.ARYAN_PASSWORD || "aryan123",
  },
];

const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "praavi-sales-arena-dev-secret",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  timezone: process.env.APP_TIMEZONE || "Asia/Kolkata",
  adminEmail: process.env.ADMIN_EMAIL || "admin@praavi.local",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Praavi Sales Arena <no-reply@praavi.local>",
  },
  users: USERS,
};

module.exports = config;
