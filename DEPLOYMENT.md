# Deployment Guide

## 🚀 Railway Single Service Deploy

### Full Stack (Railway)
1. Connect your GitHub repo to Railway
2. Set environment variables:
   ```
   OPENAI_API_KEY=sk-your-key-here
   ADMIN_PASSWORD=your-secure-password
   ```
3. Deploy automatically with `railway.json` config
4. Both frontend and backend served from same domain

## 📋 Environment Variables

### Required Backend (Railway)
- `OPENAI_API_KEY` - Your OpenAI API key
- `ADMIN_PASSWORD` - Password for admin access

### Optional Backend
- `LLM_PROVIDER=openai`
- `LLM_MODEL=gpt-4o-mini`
- `STT_PROVIDER=openai`
- `TTS_PROVIDER=openai`
- `TTS_MODEL=tts-1`

## 🔧 Configuration Files

- `railway.json` - Railway deployment configuration
- `package.json` - Build scripts for full-stack deployment
- `.env.example` - Environment variables template

## 🚨 Important Notes

1. **Single Service**: Frontend and backend deployed together on Railway
2. **Static Serving**: Express serves React build files
3. **Client Routing**: Server handles React Router routes (including `/dev`)
4. **Build Process**: `npm run build:server` builds React then starts server
5. **Firebase**: Optional for settings sync between admin/dev console

## 📝 Deploy Steps

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Deploy ready"
   git push origin main
   ```

2. **Railway Backend**:
   - Import from GitHub
   - Set environment variables
   - Deploy automatically

3. **Vercel Frontend**:
   - Import from GitHub
   - Set REACT_APP_API_BASE_URL
   - Deploy automatically

4. **Test**:
   - Visit your Vercel URL
   - Test `/dev` route
   - Test voice functionality
