/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "bcryptjs", "nodemailer"],
  async headers() {
    const embedOrigins = process.env.CHAT_EMBED_ALLOWED_ORIGINS || "";
    return [
      // The chat page may be framed by the clinic website (embed widget).
      { source: "/chat", headers: [...securityHeaders, { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${embedOrigins}` }] },
      // Everything else, including the staff dashboard, must never be framed.
      { source: "/((?!chat$).*)", headers: [...securityHeaders, { key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
