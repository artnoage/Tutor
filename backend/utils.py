# Import necessary libraries for audio processing, API interactions, and utility functions
import io
import requests
from fastapi import HTTPException
from openai import OpenAI
import logging
from pydantic import BaseModel
from typing import List
import tempfile
import os

# Set up logging for this module
logger = logging.getLogger(__name__)

def transcribe_audio(audio_content, language, api_key, new_parameter=None, provider="groq"):
    """
    Transcribes audio content using either Groq or OpenAI API.

    This function handles audio transcription by sending the audio content to the specified provider's API.
    It supports both Groq and OpenAI as transcription providers and includes error handling and logging.

    Args:
    audio_content (bytes): The audio content to transcribe.
    language (str): The language of the audio.
    api_key (str): The API key for authentication.
    new_parameter (bool, optional): If True, includes the language in the transcription request. Defaults to None.
    provider (str, optional): The provider to use for transcription ('groq' or 'openai'). Defaults to "groq".

    Returns:
    str: The transcribed text.

    Raises:
    HTTPException: If there's an error in the API call or if the API key is not provided.
    ValueError: If an unsupported provider is specified.
    """
    if provider == "groq":
        if not api_key:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY is not provided")

        logger.debug(f"Using GROQ_API_KEY: {api_key[:5]}...")
        logger.debug(f"New parameter value: {new_parameter}")

        try:
            # Set up the API request for Groq
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
            
            # Include language in the request if new_parameter is True
            if new_parameter:
                data["language"] = language

            # Send the request to Groq API
            response = requests.post(url, headers=headers, files=files, data=data)
            response.raise_for_status()
            
            # Extract and return the transcription
            transcription_text = response.text.strip()
            logger.info("Transcription extracted successfully using Groq")
            return transcription_text
        except requests.RequestException as e:
            logger.error(f"Error in Groq API call: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error in Groq API call: {str(e)}")
    
    elif provider == "openai":
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not provided")

        logger.debug(f"Using OPENAI_API_KEY: {api_key[:5]}...")

        try:
            # Initialize OpenAI client
            client = OpenAI(api_key=api_key)
            
            # Create a temporary file to store the audio content
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio_file:
                temp_audio_file.write(audio_content)
                temp_audio_file_path = temp_audio_file.name

            # Open the temporary file and send it to OpenAI API
            with open(temp_audio_file_path, "rb") as audio_file:
                transcription_params = {
                    "model": "whisper-1",
                    "file": audio_file,
                    "response_format": "text"
                }
                
                # Include language in the request if new_parameter is True
                if new_parameter:
                    transcription_params["language"] = language_to_code(language)

                # Get the transcription from OpenAI
                transcription = client.audio.transcriptions.create(**transcription_params)

            # Clean up the temporary file
            os.unlink(temp_audio_file_path)

            logger.info("Transcription extracted successfully using OpenAI")
            return transcription
        except Exception as e:
            logger.error(f"Error in OpenAI API call: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error in OpenAI API call: {str(e)}")
    
    else:
        # Raise an error if an unsupported provider is specified
        raise ValueError(f"Unsupported provider: {provider}. Choose 'groq' or 'openai'.")

def generate_tts(text, api_key, voice="onyx"):
    """
    Generates text-to-speech audio using OpenAI's API.

    This function takes a text input and converts it to speech using OpenAI's text-to-speech API.
    It supports different voices and handles API authentication and error cases.

    Args:
    text (str): The text to convert to speech.
    api_key (str): The OpenAI API key for authentication.
    voice (str, optional): The voice to use for TTS. Defaults to "onyx".

    Returns:
    bytes: The generated audio content.

    Raises:
    HTTPException: If there's an error in the API call or if the API key is not provided.
    """
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not provided")

    logger.debug(f"Using OPENAI_API_KEY: {api_key[:5]}...")  # Log first 5 chars for security
    try:
        # Initialize OpenAI client
        client = OpenAI(api_key=api_key)
        
        # Make the API call to generate speech
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
    """
    Converts a language name to its corresponding ISO 639-1 code.

    This function takes a full language name as input and returns the corresponding
    two-letter ISO 639-1 language code. If the language is not found in the predefined
    mapping, it defaults to 'en' (English).

    Args:
    language_name (str): The full name of the language.

    Returns:
    str: The ISO 639-1 code for the language, or 'en' if not found.
    """
    # Dictionary mapping full language names to their ISO 639-1 codes
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
    
    # Return the code if found, otherwise default to 'en'
    return language_map.get(language_name, "en") 

# Mapping of intervention levels to numeric values
INTERVENTION_LEVEL_MAP = {
    "no": 0,
    "low": 1,
    "medium": 2,
    "high": 3
}
