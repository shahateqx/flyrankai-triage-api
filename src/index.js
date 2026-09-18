import express from "express";
import dotenv from "dotenv";
import triageRouter from "./routes/triage.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "running", endpoints: ["POST /triage"] });
});

app.use(triageRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
