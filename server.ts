import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import admin from "firebase-admin";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase Admin
// Note: This assumes the environment has default credentials or we use the project ID
// In a real production app, you'd need a service account key.
try {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
  console.log("Firebase Admin initialized");
} catch (error) {
  console.error("Firebase Admin initialization failed:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to create a user (Admin only)
  app.post("/api/admin/create-user", async (req, res) => {
    const { email, password, role, displayName } = req.body;
    
    // In a real app, you'd verify the requester is an admin using a Firebase ID token
    // For this demo, we'll assume the request is authorized if it hits this endpoint
    // (Security should be handled by verifying the ID token in the Authorization header)
    
    try {
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName,
      });

      // Store role in Firestore
      const db = admin.firestore();
      await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        email,
        role: role || "regular",
        displayName: displayName || "",
      });

      res.json({ success: true, uid: userRecord.uid });
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
