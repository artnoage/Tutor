from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import logging
import base64
import io
import requests
import uuid

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],  # Allow your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get Groq API key
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
logger.info(f"GROQ_API_KEY is {'set' if GROQ_API_KEY else 'not set'}")

class AudioData(BaseModel):
    audio_data: str

def save_wav_file(wav_bytes):
    file_name = f"debug_audio_{uuid.uuid4()}.wav"
    with open(file_name, "wb") as f:
        f.write(wav_bytes)
    logger.info(f"Saved debug audio file: {file_name}")

@app.post("/transcribe")
async def transcribe_audio(audio_data: AudioData, request: Request):
    logger.info("Received transcription request")
    logger.debug(f"Request headers: {request.headers}")
    
    body = await request.body()
    logger.debug(f"Request body length: {len(body)}")
    logger.debug(f"Request body preview: {body[:100].decode('utf-8', errors='ignore')}")

    try:
        # Log the first 100 characters of the audio data (for debugging)
        logger.debug(f"Audio data preview: {audio_data.audio_data[:100]}...")
        logger.debug(f"Audio data length: {len(audio_data.audio_data)}")

        # Check if audio data is empty or too short
        if len(audio_data.audio_data) < 100:  # Adjust this threshold as needed
            return JSONResponse(content={"error": "Audio data is empty or too short"}, status_code=400)

        # Decode base64 WAV data
        try:
            wav_bytes = base64.b64decode(audio_data.audio_data)
            logger.debug(f"Decoded WAV data size: {len(wav_bytes)} bytes")
            
            # Save the WAV file for debugging
            save_wav_file(wav_bytes)
        except Exception as e:
            logger.error(f"Error decoding base64 data: {str(e)}")
            return JSONResponse(content={"error": f"Invalid base64 audio data: {str(e)}"}, status_code=400)

        # Create a file-like object from the WAV bytes
        wav_file = io.BytesIO(wav_bytes)

        # Transcribe the audio using Groq API
        logger.info("Starting transcription with Groq API")
        try:
            url = "https://api.groq.com/openai/v1/audio/transcriptions"
            headers = {
                "Authorization": f"Bearer {GROQ_API_KEY}"
            }
            files = {
                "file": ("audio.wav", wav_file, "audio/wav")
            }
            data = {
                "model": "whisper-large-v3",
                "response_format": "text"
            }
            response = requests.post(url, headers=headers, files=files, data=data)
            response.raise_for_status()
            
            transcription_text = response.text.strip()
            
            logger.info("Transcription extracted successfully")
            logger.debug(f"Extracted transcription: {transcription_text}")
        except requests.RequestException as e:
            logger.error(f"Error in Groq API call: {str(e)}", exc_info=True)
            return JSONResponse(content={"error": f"Error in Groq API call: {str(e)}"}, status_code=500)

        # Create the response
        response_data = {"transcription": transcription_text}
        logger.info("Preparing response")
        logger.debug(f"Response data: {response_data}")

        return JSONResponse(content=response_data)

    except Exception as e:
        logger.error(f"An error occurred during transcription: {str(e)}", exc_info=True)
        return JSONResponse(content={"error": f"An error occurred during transcription: {str(e)}"}, status_code=500)

@app.get("/")
async def root():
    return {"message": "Welcome to the Audio Transcription API"}

@app.options("/transcribe")
async def options_transcribe():
    return JSONResponse(content={})

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting the FastAPI application")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")