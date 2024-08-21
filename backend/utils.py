import io
import requests
from fastapi import HTTPException
from openai import OpenAI
import logging
from pydantic import BaseModel
from typing import List

logger = logging.getLogger(__name__)

def transcribe_audio(audio_content, language, api_key, new_parameter=None, provider="groq"):
    if provider == "groq":
        if not api_key:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY is not provided")

        logger.debug(f"Using GROQ_API_KEY: {api_key[:5]}...")  # Log first 5 chars for security
        logger.debug(f"New parameter value: {new_parameter}")  # Log the new parameter

        try:
            url = "https://api.groq.com/openai/v1/audio/transcriptions"
            headers = {
                "Authorization": f"Bearer {api_key}"
            }
            files = {
                "file": ("audio.wav", io.BytesIO(audio_content), "audio/wav")
            }
            data = {
                "model": "whisper-large-v3",
                "response_format": "text"
            }
            
            # Only include the language in the data if new_parameter is True
            if new_parameter:
                data["language"] = language

            response = requests.post(url, headers=headers, files=files, data=data)
            response.raise_for_status()
            
            transcription_text = response.text.strip()
            logger.info("Transcription extracted successfully using Groq")
            return transcription_text
        except requests.RequestException as e:
            logger.error(f"Error in Groq API call: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error in Groq API call: {str(e)}")
    
    elif provider == "openai":
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not provided")

        logger.debug(f"Using OPENAI_API_KEY: {api_key[:5]}...")  # Log first 5 chars for security

        try:
            client = OpenAI(api_key=api_key)
            with io.BytesIO(audio_content) as audio_file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text"
                )
            logger.info("Transcription extracted successfully using OpenAI")
            return transcription
        except Exception as e:
            logger.error(f"Error in OpenAI API call: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error in OpenAI API call: {str(e)}")
    
    else:
        raise ValueError(f"Unsupported provider: {provider}. Choose 'groq' or 'openai'.")

def generate_tts(text, api_key, voice="onyx"):
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not provided")

    logger.debug(f"Using OPENAI_API_KEY: {api_key[:5]}...")  # Log first 5 chars for security
    try:
        client = OpenAI(api_key=api_key)
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
    
def language_to_code(language_name):
    language_map = {
        "German": "de",
        "English": "en",
        "Spanish": "es",
        "French": "fr",
        "Italian": "it",
        "Portuguese": "pt",
        "Russian": "ru",
        "Chinese": "zh",
        "Japanese": "ja",
        "Korean": "ko",
        "Arabic": "ar",
        "Hindi": "hi",
        "Turkish": "tr",
        "Greek": "el"
    }
    
    return language_map.get(language_name, "en") 

INTERVENTION_LEVEL_MAP = {
    "no": 0,
    "low": 1,
    "medium": 2,
    "high": 3
}

