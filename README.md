# 🎙️ AI Voice Chat

An intelligent voice chat application with real-time speech-to-text, AI conversation, and text-to-speech capabilities. Built with React and Node.js, supporting multiple TTS providers and personality profiles.

## ✨ Features

- **Voice Conversation**: Natural voice interaction with AI assistant
- **Multiple TTS Providers**: OpenAI TTS, Piper TTS, Coqui TTS
- **Personality Profiles**: Pre-configured AI personalities (German & English)
- **Real-time Settings Sync**: Firebase-powered live configuration
- **Admin Panel**: Complete control over AI behavior and voice settings
- **Developer Console**: Advanced testing and debugging tools
- **Route-Based Config**: Different settings for production (/) and development (/dev)

## 🏗️ Tech Stack

**Frontend:** React, TypeScript, React Router  
**Backend:** Node.js, Express  
**AI Services:** OpenAI (GPT-4o-mini, Whisper, TTS)  
**Database:** Firebase Realtime Database  
**TTS Options:** OpenAI TTS, Piper TTS, Coqui TTS

---

## 📋 Prerequisites

- **Node.js** 18+ (for native fetch support)
- **npm** or **yarn**
- **OpenAI API Key** (required for STT and LLM)
- **Firebase Project** (optional, for settings sync)

---

## 🚀 Quick Start (Local Development)

### 1. Clone & Install

```bash
git clone <your-repo-url>
npm install
```

### 2. Configure Environment

Create `.env` file in project root:

```env
# Required
OPENAI_API_KEY=sk-your-openai-api-key-here
ADMIN_PASSWORD=your-secure-password

# TTS Provider (openai | piper | coqui)
TTS_PROVIDER=openai
```

### 3. Start Application

```bash
npm run dev
```

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001

---

## 🔊 TTS Provider Setup 

Choose one TTS provider based on your needs:

### **Option 1: OpenAI TTS (Recommended for Production)**

✅ **Best for:** Cloud deployment, simplicity, high quality  
✅ **Pros:** No setup required, 9 voices, HD quality  
❌ **Cons:** API costs, requires internet

#### Setup:

**.env Configuration:**
```env
TTS_PROVIDER=openai
TTS_MODEL=tts-1
OPENAI_API_KEY=sk-your-api-key
```

**That's it!** OpenAI TTS works out of the box.

**Voice Options:** nova, shimmer, echo, onyx, fable, alloy, ash, sage, coral

---

### **Option 2: Piper TTS (Local/Self-Hosted)**

✅ **Best for:** Privacy, offline use, no API costs  
✅ **Pros:** Free, fast, runs locally  
❌ **Cons:** Requires separate server, limited voices

#### Local Setup:

**Step 1: Install Piper TTS Server**

```bash
# Download from https://github.com/rhasspy/piper
# Or use Docker:
docker pull rhasspy/piper

# Run server:
docker run -p 59125:59125 -v /path/to/voices:/voices rhasspy/piper --port 59125
```

**Step 2: Download Voice Models**

1. Download `.onnx` voice files from [Piper voices](https://github.com/rhasspy/piper/releases)
2. Place in a folder (e.g., `C:\piper\voices\`)
3. Example voices: `de_DE-thorsten-high.onnx`, `en_US-lessac-medium.onnx`

**Step 3: Configure .env**

```env
TTS_PROVIDER=piper

# Piper Server Endpoint
PIPER_TTS_ENDPOINT=http://localhost:59125

# API Routes (adjust based on your Piper server)
PIPER_VOICES_ROUTE=/api/voices

# Local voice model path (fallback if API fails)
PIPER_MODELS_PATH=C:\Users\YourName\piper\voices
```

**Step 4: Start Piper Server**

```bash
# Your Piper server should expose:
# GET http://localhost:59125/api/voices  → Returns available voices
# POST http://localhost:59125/api/tts    → Synthesizes audio
```

**Expected API Response Format:**
```json
{
  "voices": ["de_DE-thorsten-high", "en_US-lessac-medium"]
}
```

---

### **Option 3: Coqui TTS (Advanced, High Quality)**

✅ **Best for:** Multi-speaker, voice cloning, advanced features  
✅ **Pros:** High quality, many languages, voice cloning  
❌ **Cons:** Resource intensive, complex setup

#### Local Setup:

**Step 1: Install Coqui TTS**

```bash
# Python 3.9+ required
pip install TTS

# Or Docker:
docker pull ghcr.io/coqui-ai/tts
```

**Step 2: Start Coqui Server**

```bash
# Option 1: Python
tts-server --model_name tts_models/en/ljspeech/tacotron2-DDC --port 5002

# Option 2: Docker
docker run -p 5002:5002 ghcr.io/coqui-ai/tts --model_name tts_models/en/ljspeech/tacotron2-DDC
```

**Step 3: Configure .env**

```env
TTS_PROVIDER=coqui

# Coqui Server Endpoint
COQUI_TTS_ENDPOINT=http://localhost:5002

# API Routes
COQUI_MODELS_ROUTE=/models

# Local model path (fallback)
COQUI_MODELS_PATH=./coqui-models
```

**Step 4: Verify Server**

Your Coqui server should expose:
- `GET http://localhost:5002/models` → Returns available models
- `POST http://localhost:5002/api/tts` → Synthesizes audio

**Expected API Response:**
```json
{
  "models": ["tts_models/en/ljspeech/tacotron2-DDC", "tts_models/de/thorsten/tacotron2-DDC"]
}
```

---

## 🔥 Firebase Setup (Optional)

Firebase enables real-time settings sync across users and sessions.

### Option A: Use Default Firebase (Quick Start)

The app includes a pre-configured Firebase project. Works immediately but shared with all users.

### Option B: Your Own Firebase (Recommended for Production)

**Step 1: Create Firebase Project**

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create new project
3. Enable **Realtime Database**

**Step 2: Set Database Rules**

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

**Step 3: Get Firebase Config**

1. Project Settings → General → Web App
2. Copy config object

**Step 4: Update Frontend Config**

Edit `src/config/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

**Step 5: Backend Admin SDK (Optional)**

For backend real-time listeners:

1. Firebase Console → Project Settings → Service Accounts
2. Generate new private key → Save JSON
3. Set environment variable:

```env
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key":"..."}'
```

Or save as `server/config/serviceAccountKey.json`

---

## 🌐 Production Deployment

### Backend: Railway Deployment

#### 1. Create Railway Project

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select your repository

#### 2. Set Environment Variables

**Railway Dashboard → Variables:**

```env
# Required
OPENAI_API_KEY=sk-your-production-key
ADMIN_PASSWORD=your-secure-admin-password

# TTS Configuration
TTS_PROVIDER=openai
TTS_MODEL=tts-1
LLM_MODEL=gpt-4o-mini

# Firebase Admin (optional)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

#### 3. Configure Build

Railway auto-detects Node.js. Verify settings:

- **Build Command:** `npm install`
- **Start Command:** `node server/index.js`
- **Root Directory:** `/`

#### 4. Deploy

Push to main branch → Railway auto-deploys

**Your backend URL:** `https://your-app.up.railway.app`

---

### Production TTS Setup Options

#### **Option 1: OpenAI TTS (Recommended)**

✅ No additional setup required  
✅ Works immediately on Railway  
✅ Set `TTS_PROVIDER=openai` in Railway environment variables

#### **Option 2: Piper TTS on Railway**

⚠️ **Not recommended** - Railway is ephemeral, file storage doesn't persist

**If you must:**
1. Deploy separate Piper server (e.g., DigitalOcean, Fly.io)
2. Set environment variables:
```env
TTS_PROVIDER=piper
PIPER_TTS_ENDPOINT=https://your-piper-server.fly.dev
PIPER_VOICES_ROUTE=/api/voices
```

#### **Option 3: Coqui TTS on Railway**

⚠️ **Not recommended** - High memory usage, Railway may throttle

**Alternative:** Use dedicated GPU server (RunPod, Vast.ai)

```env
TTS_PROVIDER=coqui
COQUI_TTS_ENDPOINT=https://your-coqui-server.runpod.io
COQUI_MODELS_ROUTE=/models
```

---

### Frontend: Render Deployment

#### 1. Create Render Static Site

1. Go to [render.com](https://render.com)
2. New → Static Site
3. Connect GitHub repository

#### 2. Configure Build Settings

- **Build Command:** `npm run build`
- **Publish Directory:** `build`
- **Environment Variables:**

```env
REACT_APP_API_BASE_URL=https://your-backend.up.railway.app
```

⚠️ **Important:** Remove trailing slash from API URL

#### 3. Deploy

Render automatically builds and deploys on push.

**Your frontend URL:** `https://your-app.onrender.com`

---

## 🔐 Environment Variables Reference

### Required (All Environments)

```env
OPENAI_API_KEY=sk-...              # OpenAI API key
ADMIN_PASSWORD=secure-password      # Admin panel password
```

### Frontend (Render)

```env
REACT_APP_API_BASE_URL=https://your-backend.up.railway.app
```

### Backend Optional

```env
# AI Providers
LLM_PROVIDER=openai                 # openai | ollama | local
LLM_MODEL=gpt-4o-mini
STT_PROVIDER=openai                 # openai | local
STT_MODEL=whisper-1
TTS_PROVIDER=openai                 # openai | piper | coqui
TTS_MODEL=tts-1

# OpenAI TTS Voices
ALLOWED_VOICES=nova,shimmer,echo,onyx,fable,alloy,ash,sage,coral

# Piper TTS Configuration
PIPER_TTS_ENDPOINT=http://localhost:59125
PIPER_VOICES_ROUTE=/api/voices
PIPER_MODELS_PATH=/path/to/voices

# Coqui TTS Configuration
COQUI_TTS_ENDPOINT=http://localhost:5002
COQUI_MODELS_ROUTE=/models
COQUI_MODELS_PATH=./coqui-models

# Firebase Admin SDK
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

---

## 📱 Application Routes

- **`/`** - Main voice chat interface (uses local admin settings)
- **`/dev`** - Developer console (uses Firebase settings)
- **`/debug`** - Debug console (uses Firebase settings)

### Route-Based Configuration

- **Home (`/`)**: Changes in Admin panel apply locally, stored in localStorage
- **Dev (`/dev`)**: Changes in DevConsole save to Firebase and sync globally

---

## 🎯 Usage Guide

### Admin Panel Access

1. Click **"Admin"** button in top-right
2. Enter admin password (from `ADMIN_PASSWORD` env var)
3. Configure:
   - System prompts
   - Voice selection
   - Temperature settings
   - Personality profiles

### Developer Console Access

1. Add `?dev=true` to URL or go to `/dev` route
2. Enter admin password
3. Access:
   - Real-time Firebase sync
   - Debug metrics
   - TTS provider settings
   - Advanced controls

---

## 🐛 Troubleshooting

### Voice Chat Not Working

1. **Check microphone permissions** in browser
2. **Verify OpenAI API key** is valid
3. **Check browser console** for errors
4. **Test backend**: `curl https://your-backend.up.railway.app/health`

### TTS Not Working

**OpenAI TTS:**
- Verify `OPENAI_API_KEY` is set
- Check API quota/billing

**Piper TTS:**
- Ensure Piper server is running: `curl http://localhost:59125/api/voices`
- Verify voice models exist in `PIPER_MODELS_PATH`
- Check backend logs for connection errors

**Coqui TTS:**
- Ensure Coqui server is running: `curl http://localhost:5002/models`
- Verify models are loaded
- Check memory usage (Coqui is resource-intensive)

### Firebase Sync Issues

1. **Check database rules** are set to public (for development)
2. **Verify database URL** in config matches your project
3. **Check browser console** for Firebase errors
4. **Backend logs** will show Admin SDK initialization status

### Railway Deployment Issues

- **Port**: Railway assigns port automatically, don't hardcode `PORT=3001`
- **Build**: Check build logs for errors
- **Env vars**: Verify all required variables are set
- **Logs**: Check Railway logs for runtime errors

---

## 📚 API Endpoints

### Backend Endpoints

- `POST /api/voice/process` - Process voice input (STT → LLM → TTS)
- `GET /api/tts/models` - Get available TTS models/voices
- `POST /api/admin/auth` - Admin authentication
- `GET /api/health` - Health check

### TTS Server Requirements

**Piper Server:**
- `GET /api/voices` - Returns array of voice names
- `POST /api/tts` - Request body: `{text, voice, language, speed, pitch}`

**Coqui Server:**
- `GET /models` - Returns array of model names
- `POST /api/tts` - Request body: `{text, model, speaker_id, temperature}`

---

## 🔄 Updating Voice Models

### Piper TTS

1. Download new `.onnx` models from [Piper releases](https://github.com/rhasspy/piper/releases)
2. Place in `PIPER_MODELS_PATH` directory
3. Restart Piper server
4. Voices automatically detected on next request

### Coqui TTS

1. Install new model: `tts --list_models` to see available models
2. Preload: `tts --model_name <model-name> --out_path test.wav --text "test"`
3. Restart Coqui server with new model
4. Model appears in `/models` endpoint

---

## 📄 License

MIT License - Feel free to use for personal or commercial projects.

---

## 🤝 Support

For issues or questions:
1. Check troubleshooting section above
2. Review backend logs (Railway dashboard)
3. Check browser console for frontend errors
4. Verify environment variables are set correctly

---

## 🎉 Quick Deployment Checklist

### Local Development
- [ ] Node.js 18+ installed
- [ ] `.env` file created with `OPENAI_API_KEY` and `ADMIN_PASSWORD`
- [ ] Choose TTS provider (openai/piper/coqui)
- [ ] Configure TTS provider (if piper/coqui)
- [ ] Run `npm install`
- [ ] Run `npm run dev`
- [ ] Test at http://localhost:3000

### Production Deployment
- [ ] Railway project created
- [ ] Environment variables set in Railway
- [ ] Backend deployed and running
- [ ] Backend URL obtained
- [ ] Render static site created
- [ ] `REACT_APP_API_BASE_URL` set to Railway backend URL
- [ ] Frontend deployed
- [ ] Test production URL
- [ ] Verify voice chat works end-to-end

---

**Happy Coding! 🚀**
