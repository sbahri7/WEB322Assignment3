/********************************************************************************
* WEB322 – Assignment 03
********************************************************************************/
require("dotenv").config();

const path = require("path");
const express = require("express");
const clientSessions = require("client-sessions");

const connectMongo = require("./config/mongo");
const sequelize = require("./config/postgres");
const User = require("./models/User");
const Task = require("./models/Task");

const app = express();
const PORT = process.env.PORT || 8080;

// view engine & static
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// sessions
app.use(
  clientSessions({
    cookieName: "session",
    secret: process.env.SESSION_SECRET,
    duration: 30 * 60 * 1000,
    activeDuration: 5 * 60 * 1000
  })
);

// expose user to views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// auth middleware
function ensureLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// home redirect
app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.redirect("/login");
});

// AUTH ROUTES
app.get("/register", (req, res) => {
  res.render("register", { error: null, formData: {} });
});

app.post("/register", async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  if (!username || !email || !password || password !== confirmPassword) {
    return res.render("register", {
      error: "Invalid input or passwords do not match.",
      formData: { username, email }
    });
  }
  try {
    const user = new User({ username, email, password });
    await user.save();
    res.redirect("/login");
  } catch (err) {
    let msg = "Registration failed.";
    if (err.code === 11000) {
      msg = "Username or email already exists.";
    }
    res.render("register", { error: msg, formData: { username, email } });
  }
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { emailOrUsername, password } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }]
    });
    if (!user) {
      return res.render("login", { error: "Invalid credentials." });
    }
    const match = await user.comparePassword(password);
    if (!match) {
      return res.render("login", { error: "Invalid credentials." });
    }
    req.session.user = {
      id: String(user._id),
      email: user.email,
      username: user.username
    };
    res.redirect("/dashboard");
  } catch {
    res.render("login", { error: "Login failed." });
  }
});

app.get("/logout", (req, res) => {
  req.session.reset();
  res.redirect("/login");
});

// DASHBOARD
app.get("/dashboard", ensureLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [total, completed, pending] = await Promise.all([
      Task.count({ where: { userId } }),
      Task.count({ where: { userId, status: "completed" } }),
      Task.count({ where: { userId, status: "pending" } })
    ]);
    res.render("dashboard", { stats: { total, completed, pending } });
  } catch {
    res.render("dashboard", { stats: { total: 0, completed: 0, pending: 0 } });
  }
});

// TASK ROUTES
app.get("/tasks", ensureLogin, async (req, res) => {
  const userId = req.session.user.id;
  const tasks = await Task.findAll({ where: { userId }, order: [["createdAt", "DESC"]] });
  res.render("tasks", { tasks });
});

app.get("/tasks/add", ensureLogin, (req, res) => {
  res.render("taskForm", { task: null, error: null });
});

app.post("/tasks/add", ensureLogin, async (req, res) => {
  const { title, description, dueDate, status } = req.body;
  if (!title) {
    return res.render("taskForm", { task: null, error: "Title is required." });
  }
  try {
    await Task.create({
      title,
      description,
      dueDate: dueDate || null,
      status: status || "pending",
      userId: req.session.user.id
    });
    res.redirect("/tasks");
  } catch {
    res.render("taskForm", { task: null, error: "Failed to create task." });
  }
});

app.get("/tasks/edit/:id", ensureLogin, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, userId: req.session.user.id }
  });
  if (!task) return res.redirect("/tasks");
  res.render("taskForm", { task, error: null });
});

app.post("/tasks/edit/:id", ensureLogin, async (req, res) => {
  const { title, description, dueDate, status } = req.body;
  if (!title) {
    const task = { id: req.params.id, title, description, dueDate, status };
    return res.render("taskForm", { task, error: "Title is required." });
  }
  try {
    await Task.update(
      { title, description, dueDate: dueDate || null, status },
      { where: { id: req.params.id, userId: req.session.user.id } }
    );
    res.redirect("/tasks");
  } catch {
    const task = { id: req.params.id, title, description, dueDate, status };
    res.render("taskForm", { task, error: "Failed to update task." });
  }
});

app.post("/tasks/delete/:id", ensureLogin, async (req, res) => {
  await Task.destroy({ where: { id: req.params.id, userId: req.session.user.id } });
  res.redirect("/tasks");
});

app.post("/tasks/status/:id", ensureLogin, async (req, res) => {
  const task = await Task.findOne({
    where: { id: req.params.id, userId: req.session.user.id }
  });
  if (task) {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    await task.update({ status: newStatus });
  }
  res.redirect("/tasks");
});

// 404
app.use((req, res) => {
  res.status(404).render("404");
});

// INIT
(async () => {
  console.log("🚀 Starting server...");
  
  try {
    console.log("📡 Connecting to MongoDB...");
    await connectMongo();
    console.log("✅ MongoDB connected!");
    
    console.log("📡 Connecting to Postgres...");
    await sequelize.authenticate();
    console.log("✅ Postgres connected!");
    
    console.log("🔄 Syncing database...");
    await sequelize.sync();
    console.log("✅ Database synced!");
    
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Startup failed:", err.message);
    process.exit(1);
  }
})();
