import { useState } from "react";
import ToDoList from "./components/ToDoList"; // ✅ import this

export default function App() {
  const [page, setPage] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token") || "");

  const handleRegister = async () => {
    setMessage("");
    try {
      const res = await fetch("http://localhost:3001/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      setMessage("Registration successful! You can now log in.");
      setPage("login");
      setUsername("");
      setPassword("");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleLogin = async () => {
    setMessage("");
    try {
      const res = await fetch("http://localhost:3001/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      setToken(data.token);
      localStorage.setItem("token", data.token);
      setMessage("Login successful!");
      setUsername("");
      setPassword("");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleLogout = () => {
    setToken("");
    localStorage.removeItem("token");
    setMessage("Logged out.");
  };

  // ✅ Show ToDoList if logged in
  if (token) {
    return (
      <div>
        <button onClick={handleLogout}>Logout</button>
        <p>{message}</p>
        <ToDoList token={token} />
      </div>
    );
  }

  // ❌ Otherwise show login/register
  return (
    <div style={{ maxWidth: 320, margin: "auto", padding: 20 }}>
      <h1>{page === "login" ? "Login" : "Register"}</h1>
      <input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 10 }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 10 }}
      />
      {message && <p style={{ color: "red" }}>{message}</p>}

      {page === "login" ? (
        <>
          <button onClick={handleLogin} style={{ width: "100%", padding: 10 }}>
            Login
          </button>
          <p>
            Don't have an account?{" "}
            <button onClick={() => setPage("register")}>Register here</button>
          </p>
        </>
      ) : (
        <>
          <button
            onClick={handleRegister}
            style={{ width: "100%", padding: 10 }}
          >
            Register
          </button>
          <p>
            Already have an account?{" "}
            <button onClick={() => setPage("login")}>Login here</button>
          </p>
        </>
      )}
    </div>
  );
}
