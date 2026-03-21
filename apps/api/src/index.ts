import "dotenv/config";
import express from "express";
import cors from "cors";
import { requireAuth } from "./middleware/auth.js";
import ingestRouter from "./routes/ingest.js";
import detectRouter from "./routes/detect.js";
import staysRouter from "./routes/stays.js";
import placesRouter from "./routes/places.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// All routes below require auth
app.use(requireAuth);
app.use("/ingest", ingestRouter);
app.use("/detect", detectRouter);
app.use("/stays", staysRouter);
app.use("/places", placesRouter);

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
