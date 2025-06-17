const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const SECRET_KEY = "your_secret_key";

// Paths to JSON logs
const logsFilePath = path.join(__dirname, "data", "logs.json");
const accountsFilePath = path.join(__dirname, "data", "accounts.json");

// Helper: Append log and auto-push to Git
function appendLog(filePath, entry) {
  fs.readFile(filePath, (err, data) => {
    let json = [];
    if (!err && data.length > 0) {
      try {
        json = JSON.parse(data);
      } catch (e) {
        console.error("Failed to parse JSON:", e);
      }
    }

    json.push(entry);

    fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
      if (err) {
        console.error("Error writing log:", err);
      } else {
        autoGitPush(`Update ${path.basename(filePath)}`);
      }
    });
  });
}

// Helper: Auto git commit and push
function autoGitPush(message = "Auto-update JSON logs") {
  exec(`git add data/*.json && git commit -m "${message}" && git push`, (err, stdout, stderr) => {
    if (err) {
      console.error("Git push failed:", stderr);
    } else {
      console.log("Git push successful:\n", stdout);
    }
  });
}

app.use(cors());
app.use(express.json());

// Connect to SQLite DB
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) {
    console.error("DB connection error:", err.message);
  } else {
    console.log("Connected to SQLite DB");
  }
});

// Create tables if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    task TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// JWT auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

// Register
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (row) return res.status(400).json({ error: "Username already taken" });

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return res.status(500).json({ error: "Error hashing password" });

      db.run(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        [username, hash],
        function (err) {
          if (err) return res.status(500).json({ error: "Database insert error" });

          appendLog(accountsFilePath, {
            id: this.lastID,
            username,
            created_at: new Date().toISOString()
          });

          res.json({ message: "User registered successfully" });
        }
      );
    });
  });
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(400).json({ error: "Invalid username or password" });

    bcrypt.compare(password, user.password_hash, (err, isMatch) => {
      if (err) return res.status(500).json({ error: "Error comparing passwords" });
      if (!isMatch) return res.status(400).json({ error: "Invalid username or password" });

      const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: "1h" });
      res.json({ message: "Login successful", token });
    });
  });
});

// Get todos
app.get("/api/todos", authenticateToken, (req, res) => {
  db.all("SELECT * FROM todos WHERE user_id = ?", [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add todo
app.post("/api/todos", authenticateToken, (req, res) => {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "Task is required" });

  db.run("INSERT INTO todos (user_id, task) VALUES (?, ?)", [req.user.id, task], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    appendLog(logsFilePath, {
      user_id: req.user.id,
      action: "created",
      task,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({ id: this.lastID, task, completed: 0 });
  });
});

// Update todo
app.put("/api/todos/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { task, completed } = req.body;

  db.get("SELECT * FROM todos WHERE id = ? AND user_id = ?", [id, req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Todo not found" });

    db.run("UPDATE todos SET task = ?, completed = ? WHERE id = ?", [task || row.task, completed ? 1 : 0, id], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      appendLog(logsFilePath, {
        user_id: req.user.id,
        action: "updated",
        task: task || row.task,
        completed: !!completed,
        timestamp: new Date().toISOString()
      });

      res.json({ updatedID: id });
    });
  });
});

// Delete todo
app.delete("/api/todos/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM todos WHERE id = ? AND user_id = ?", [id, req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Todo not found" });

    db.run("DELETE FROM todos WHERE id = ?", id, function (err) {
      if (err) return res.status(500).json({ error: err.message });

      appendLog(logsFilePath, {
        user_id: req.user.id,
        action: "deleted",
        task: row.task,
        timestamp: new Date().toISOString()
      });

      res.json({ deletedID: id });
    });
  });
});

// Start server
const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
