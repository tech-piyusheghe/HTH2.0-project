/**
 * Smart Electrical Power Monitoring System
 * Zero-dependency Local Development Server
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = process.env.PORT || 5173;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

const server = http.createServer((req, res) => {
  let reqUrl = req.url.split("?")[0];
  if (reqUrl === "/" || reqUrl === "") {
    reqUrl = "/dashboard/index.html";
  }

  let filePath = path.join(ROOT_DIR, reqUrl);

  // If path is a directory, look for index.html inside
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  // Security: prevent directory traversal outside ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        // Fallback to dashboard/index.html if available
        const fallback = path.join(ROOT_DIR, "dashboard", "index.html");
        if (fs.existsSync(fallback)) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(fs.readFileSync(fallback));
          return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/dashboard/index.html`;
  console.log("\n=======================================================");
  console.log(" SMART ELECTRICAL POWER MONITORING - LOCAL SERVER");
  console.log("=======================================================");
  console.log(` Server running at: \x1b[36m${url}\x1b[0m`);
  console.log(" Press Ctrl+C to stop the server.\n");

  // Automatically open browser on start
  const openCmd = process.platform === "win32" ? `start ${url}` : process.platform === "darwin" ? `open ${url}` : `xdg-open ${url}`;
  exec(openCmd, (err) => {
    if (err) {
      // Non-fatal if browser opening fails
    }
  });
});
