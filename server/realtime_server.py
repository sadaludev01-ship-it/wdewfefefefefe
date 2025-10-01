import asyncio
import os
import json
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from agents.realtime import RealtimeAgent, RealtimeRunner

# Load environment variables
load_dotenv()

app = FastAPI(title="AI Voice Chat Realtime Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RealtimeSession:
    def __init__(self, websocket: WebSocket, config: dict):
        self.websocket = websocket
        self.config = config
        self.agent = None
        self.runner = None
        self.session = None
        
    async def create_agent(self):
        """Create the realtime agent with configuration"""
        instructions = self.config.get('instructions', 
            "You are a helpful voice assistant. Keep your responses conversational and friendly.")
        
        self.agent = RealtimeAgent(
            name="Assistant",
            instructions=instructions,
        )
        
        # Set up the runner with configuration
        runner_config = {
            "model_settings": {
                "model_name": "gpt-4o-realtime-preview",
                "voice": self.config.get('voice', 'alloy'),
                "modalities": ["text", "audio"],
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": self.config.get('vad_threshold', 0.5),
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": self.config.get('silence_duration_ms', 500)
                }
            }
        }
        
        self.runner = RealtimeRunner(
            starting_agent=self.agent,
            config=runner_config
        )
    
    async def start_session(self):
        """Start the realtime session"""
        if not self.runner:
            await self.create_agent()
            
        self.session = await self.runner.run()
        
        # Send initial greeting if configured
        greeting = self.config.get('greeting')
        if greeting and greeting.strip():
            await self.session.send_message(greeting)
    
    async def handle_events(self):
        """Handle events from the realtime session"""
        if not self.session:
            return
            
        async with self.session:
            async for event in self.session:
                try:
                    # Send event to frontend via WebSocket
                    event_data = {
                        "type": event.type,
                        "data": {}
                    }
                    
                    # Handle different event types
                    if event.type == "response.audio_transcript.done":
                        event_data["data"]["transcript"] = event.transcript
                        event_data["data"]["role"] = "assistant"
                    elif event.type == "conversation.item.input_audio_transcription.completed":
                        event_data["data"]["transcript"] = event.transcript
                        event_data["data"]["role"] = "user"
                    elif event.type == "response.audio.delta":
                        event_data["data"]["audio"] = event.delta
                    elif event.type == "error":
                        event_data["data"]["error"] = str(event.error)
                    
                    await self.websocket.send_text(json.dumps(event_data))
                    
                except Exception as e:
                    print(f"Error handling event: {e}")
                    break
    
    async def close(self):
        """Close the session"""
        if self.session:
            await self.session.close()

# Store active sessions
active_sessions = {}

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "realtime_server"}

@app.websocket("/api/realtime/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for realtime communication"""
    await websocket.accept()
    session_id = id(websocket)
    
    try:
        # Wait for initial configuration
        config_data = await websocket.receive_text()
        config = json.loads(config_data)
        
        # Validate API key
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            await websocket.send_text(json.dumps({
                "type": "error",
                "data": {"error": "Missing OPENAI_API_KEY"}
            }))
            return
        
        # Create and start session
        session = RealtimeSession(websocket, config)
        active_sessions[session_id] = session
        
        await session.start_session()
        
        # Send ready signal
        await websocket.send_text(json.dumps({
            "type": "session.ready",
            "data": {}
        }))
        
        # Handle events
        await session.handle_events()
        
    except WebSocketDisconnect:
        print(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.send_text(json.dumps({
            "type": "error",
            "data": {"error": str(e)}
        }))
    finally:
        # Cleanup
        if session_id in active_sessions:
            await active_sessions[session_id].close()
            del active_sessions[session_id]

@app.post("/api/realtime/config")
async def update_config(config: dict):
    """Update configuration for active sessions"""
    # This endpoint can be used to update settings during active sessions
    return {"status": "config_updated"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
