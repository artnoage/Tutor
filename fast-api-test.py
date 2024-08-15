from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging
from pydantic import BaseModel
import os
import io
import requests
import base64
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class AudioData(BaseModel):
    motherTongue: str
    tutoringLanguage: str
    tutorsLanguage: str
    tutorsVoice: str
    partnersVoice: str
    interventionLevel: str

@app.post("/process_audio")
async def process_audio(
    audio: UploadFile = File(...),
    data: str = Form(...),
    groq_api_key: str = Form(None),
    openai_api_key: str = Form(None)
):
    try:
        audio_data = AudioData.parse_raw(data)

        # Log the received data
        logger.info(f"Received audio file: {audio.filename}")
        logger.info(f"Mother Tongue: {audio_data.motherTongue}")
        logger.info(f"Tutoring Language: {audio_data.tutoringLanguage}")
        logger.info(f"Tutor's Language: {audio_data.tutorsLanguage}")
        logger.info(f"Tutor's Voice: {audio_data.tutorsVoice}")
        logger.info(f"Partner's Voice: {audio_data.partnersVoice}")
        logger.info(f"Intervention Level: {audio_data.interventionLevel}")

        # Debug: Log API key status
        logger.debug(f"GROQ_API_KEY from env: {'set' if os.getenv('GROQ_API_KEY') else 'not set'}")
        logger.debug(f"OPENAI_API_KEY from env: {'set' if os.getenv('OPENAI_API_KEY') else 'not set'}")
        logger.debug(f"groq_api_key from form: {'provided' if groq_api_key else 'not provided'}")
        logger.debug(f"openai_api_key from form: {'provided' if openai_api_key else 'not provided'}")

        # Read the audio file
        audio_content = await audio.read()

        # Transcribe the audio using Groq API
        transcription = transcribe_audio(audio_content, groq_api_key)

        # Generate TTS audio using OpenAI API with the selected tutor's voice
        tts_audio = generate_tts(transcription, openai_api_key, audio_data.tutorsVoice)

        # Encode the TTS audio to base64
        audio_base64 = base64.b64encode(tts_audio).decode('utf-8')

        # Return both the transcription and the audio file as base64
        return JSONResponse({
            "transcription": transcription,
            "audio_base64": audio_base64
        })

    except Exception as e:
        logger.error(f"An error occurred: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def transcribe_audio(audio_content, api_key=None):
    groq_api_key = api_key or os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not set and not provided")

    logger.debug(f"Using GROQ_API_KEY: {groq_api_key[:5]}...")  # Log first 5 chars for security

    try:
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {
            "Authorization": f"Bearer {groq_api_key}"
        }
        files = {
            "file": ("audio.wav", io.BytesIO(audio_content), "audio/wav")
        }
        data = {
            "model": "whisper-large-v3",
            "response_format": "text"
        }
        response = requests.post(url, headers=headers, files=files, data=data)
        response.raise_for_status()
        
        transcription_text = response.text.strip()
        logger.info("Transcription extracted successfully")
        return transcription_text
    except requests.RequestException as e:
        logger.error(f"Error in Groq API call: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error in Groq API call: {str(e)}")

def generate_tts(text, api_key=None, voice="onyx"):
    openai_api_key = api_key or os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set and not provided")

    logger.debug(f"Using OPENAI_API_KEY: {openai_api_key[:5]}...")  # Log first 5 chars for security

    try:
        client = OpenAI(api_key=openai_api_key)
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text
        )
        logger.info(f"TTS audio generated successfully using voice: {voice}")
        return response.content
    except Exception as e:
        logger.error(f"Error in OpenAI TTS API call: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error in OpenAI TTS API call: {str(e)}")

@app.get("/")
async def root():
    return {"message": "Welcome to the Audio Processing API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")