from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging
from pydantic import BaseModel
import os
from utils import *
import base64
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
    chatObject: ChatObject


@app.post("/process_audio")
async def process_audio(
    audio: UploadFile = File(...),
    data: str = Form(...),
    groq_api_key: str = Form(None),
    openai_api_key: str = Form(None)
):
    try:
        # Use model_validate_json instead of parse_raw
        audio_data = AudioData.model_validate_json(data)

        # Log the received data
        logger.debug(f"Received audio file: {audio.filename}")
        logger.debug(f"Mother Tongue: {audio_data.motherTongue}")
        logger.debug(f"Tutoring Language: {audio_data.tutoringLanguage}")
        logger.debug(f"Tutor's Language: {audio_data.tutorsLanguage}")
        logger.debug(f"Tutor's Voice: {audio_data.tutorsVoice}")
        logger.debug(f"Partner's Voice: {audio_data.partnersVoice}")
        logger.debug(f"Intervention Level: {audio_data.interventionLevel}")
        logger.debug(f"Chat Object: {audio_data.chatObject}")

        # Debug: Log API key status
        logger.debug(f"GROQ_API_KEY from env: {'set' if os.getenv('GROQ_API_KEY') else 'not set'}")
        logger.debug(f"OPENAI_API_KEY from env: {'set' if os.getenv('OPENAI_API_KEY') else 'not set'}")
        logger.debug(f"groq_api_key from form: {'provided' if groq_api_key else 'not provided'}")
        logger.debug(f"openai_api_key from form: {'provided' if openai_api_key else 'not provided'}")

        # Read the audio file
        audio_content = await audio.read()

        # Transcribe the audio using Groq API
        transcription = transcribe_audio(audio_content, groq_api_key)

        chat_json=audio_data.chatObject.model_dump()
        # Process ChatObject separately
        updated_chat_object = process_chat_object(chat_json, transcription)
        # Generate TTS audio using OpenAI API with the selected tutor's voice
        tts_audio = generate_tts(transcription, openai_api_key, audio_data.tutorsVoice)

        # Encode the TTS audio to base64
        audio_base64 = base64.b64encode(tts_audio).decode('utf-8')

        # Return the transcription, audio file as base64, and the updated chatObject
        return JSONResponse({
            "transcription": transcription,
            "audio_base64": audio_base64,
            "chatObject": updated_chat_object
        })

    except Exception as e:
        logger.error(f"An error occurred: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "Welcome to the Audio Processing API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")