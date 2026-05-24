# TypeClash 

> A high-performance, real-time competitive multiplayer typing game built for speed, accuracy, and absolute chaos. 


##  Overview

TypeClash takes the standard typing test and turns it into a competitive, Tetris-style survival game. Words fall from the top of the screen; type them accurately to destroy them. Build up your combo by typing flawlessly, and send **"Garbage"** (sped-up, chaotic junk words) directly to your opponent's screen to overwhelm them!

### Key Features
- **Real-time Multiplayer:** Create private rooms, share a 6-digit code, and battle your friends head-to-head via WebSockets.
- **Garbage Mechanics:** Every 5-combo multiplier achieved sends a chunk of garbage words to your opponent.
- **Deterministic Synchronization:** Utilizes `seedrandom` to ensure both players get the exact same word spawns at the exact same time.
- **Dynamic Match Scaling:** Choose from 1, 3, or 5-minute matches. The game intelligently scales word spawn rates and speed as the match progresses.
- **Comprehensive Analytics:** Tracks live Words Per Minute (WPM), Accuracy (%), and Garbage Sent.
- **Global Leaderboards:** Persistent high-scores tracked in MongoDB, separated by match duration.

---

##  Tech Stack

**Frontend:**
- [Next.js](https://nextjs.org/) (React)
- HTML5 `<canvas>` (Game Engine / Rendering)
- Vanilla CSS Modules (No heavy utility frameworks)
- Socket.io Client

**Backend:**
- [Node.js](https://nodejs.org/) & Express
- [Socket.io](https://socket.io/) (Real-time WebSockets)
- [MongoDB](https://www.mongodb.com/) (Mongoose for persistence)

---

##  Running Locally

### Prerequisites
- Node.js v18+
- MongoDB installed locally OR a free MongoDB Atlas Cloud URI.

### 1. Start the Server
```bash
cd server
npm install
npm run dev
```
*(The server will run on `http://localhost:3001` and attempt to connect to a local MongoDB instance).*

### 2. Start the Client
```bash
cd client
npm install
npm run dev
```
*(The client will run on `http://localhost:3000`).*

---

##  Production Deployment

TypeClash is designed for a split-hosting architecture to bypass Serverless function limitations with WebSockets.

### 1. Deploy the Backend (Render)
1. Import the `/server` directory into a new [Render](https://render.com) Web Service.
2. Set Build Command: `npm install && npm run build`
3. Set Start Command: `npm run start`
4. Add Environment Variable:
   - `MONGO_URI`: Your MongoDB Atlas Connection String.

### 2. Deploy the Frontend (Vercel)
1. Import the `/client` directory into [Vercel](https://vercel.com).
2. Add Environment Variable:
   - `NEXT_PUBLIC_SERVER_URL`: `https://your-render-app.onrender.com`
3. Deploy!

---

##  License
MIT License. Feel free to fork and build upon this!
