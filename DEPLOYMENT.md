# Deployment Guide 🚀

This guide will help you deploy TripMate to **Render**, a cloud hosting provider that supports Docker and Node.js applications.

## Option 1: Deploy using Docker (Recommended)

Since we have a `Dockerfile`, this is the easiest and most reliable method.

1.  **Sign up for Render**: Go to [render.com](https://render.com) and create an account (you can sign up with GitHub).
2.  **Create a New Web Service**:
    *   Click on the "New +" button and select "Web Service".
    *   Connect your GitHub account and select the `TripMate` repository.
3.  **Configure the Service**:
    *   **Name**: Choose a name (e.g., `tripmate-app`).
    *   **Region**: Select the one closest to you.
    *   **Runtime**: Select **Docker**.
    *   **Instance Type**: "Free" (for hobby projects) or "Starter".
4.  **Environment Variables**:
    *   Scroll down to the "Environment Variables" section.
    *   Add the following keys and values (copy them from your local `.env` file):
        *   `OPENAI_API_KEY`: Your OpenAI API Key.
        *   `DATABASE_URL`: Your MongoDB connection string (e.g., from MongoDB Atlas).
        *   `SESSION_SECRET`: A long random string.
        *   `NODE_ENV`: `production`
5.  **Deploy**:
    *   Click "Create Web Service".
    *   Render will start building your Docker image. This might take a few minutes.
6.  **Done!**:
    *   Once the build finishes, Render will provide you with a URL (e.g., `https://tripmate-app.onrender.com`).

## Option 2: Deploy as a Node.js Service

If you prefer not to use Docker, you can deploy it as a standard Node.js app.

1.  **Create a New Web Service** on Render and select your repository.
2.  **Configure the Service**:
    *   **Runtime**: **Node**.
    *   **Build Command**: `npm install && npm run build`
    *   **Start Command**: `npm start`
3.  **Environment Variables**:
    *   Add the same variables as above (`OPENAI_API_KEY`, `DATABASE_URL`, etc.).
4.  **Deploy**.

## Database Setup (MongoDB Atlas)

If you haven't set up a cloud database yet:

1.  Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2.  Create a free cluster.
3.  Create a database user (username and password).
4.  Allow access from anywhere (`0.0.0.0/0`) in the Network Access tab (or whitelist Render's IPs if you can find them).
5.  Get the connection string (e.g., `mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority`).
6.  Use this string as your `DATABASE_URL` environment variable in Render.
